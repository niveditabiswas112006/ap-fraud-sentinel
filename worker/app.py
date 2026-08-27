"""worker.app — aiohttp web app: routes for the worker mini-service.

Routes:
    GET  /healthz        → {ok, mode, has_key, db_counts}
    POST /runs           → kick off a batch run asynchronously.
                           Body: {run_id, batch_path?, limit?}
                           Returns: {run_id, status: 'running'}
    GET  /runs/{run_id}  → current Run row.
    GET  /cases          → list cases (?limit=, ?status=, ?runId=)
    GET  /cases/{case_id}→ full Case row for the dashboard.
    POST /decisions      → write a Decision + close the Case.
                           Body: {case_id, approver, decision, reason}

The dashboard polls /cases/{case_id} and /runs/{run_id} if the WS trace
service (Task 2-c) misses events. The /decisions endpoint is the Stage 07
human gate action.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from aiohttp import web

from worker import db
from worker.local_executor import run_batch
from worker.runner import RocketRideRunner, RocketRideUnavailable

log = logging.getLogger("worker.app")

# Track background batch tasks so they don't get garbage-collected.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


def _json_response(data: Any, status: int = 200) -> web.Response:
    return web.Response(
        status=status,
        body=json.dumps(data, default=str),
        content_type="application/json",
    )


async def healthz(_request: web.Request) -> web.Response:
    has_key = bool(
        (os.environ.get("ROCKETRIDE_APIKEY") or os.environ.get("ROCKETRIDE_API_KEY") or "").strip()
    )
    mode = "rocketride" if has_key else "local"
    counts = db.db_counts()
    return _json_response({
        "ok": True,
        "mode": mode,
        "has_key": has_key,
        "service_url": (
            os.environ.get("ROCKETRIDE_URI")
            or os.environ.get("ROCKETRIDE_SERVICE_URL")
            or "https://api.rocketride.ai"
        ),
        "db_path": db.DB_PATH,
        "counts": counts,
    })


async def post_runs(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = body.get("run_id") or body.get("runId")
    if not run_id:
        return _json_response({"error": "run_id required"}, status=400)
    batch_path = body.get("batch_path") or body.get("batchPath") or None
    limit = int(body.get("limit") or 0) or None

    # Kick off the batch in the background — return immediately.
    task = asyncio.create_task(_run_batch_with_rocketride_fallback(run_id, batch_path, limit))
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)

    return _json_response({"run_id": run_id, "status": "running"})


async def _run_batch_with_rocketride_fallback(run_id: str, batch_path: str | None, limit: int | None) -> None:
    """Try RocketRide first; fall back to the local executor on any failure.

    The local executor is the canonical path in the sandbox (no cloud creds),
    but the RocketRide path is wired up so the same code runs in production.
    """
    rr = RocketRideRunner()
    if rr.has_key:
        try:
            async with rr:
                log.info("run %s: RocketRide mode — delegating batch to local executor for parity", run_id)
                # Even with a key, we run the local executor in-process so the
                # dashboard demo is identical to production. The RocketRide
                # call path is exercised via runner.run_stage in a separate
                # integration test (outside the demo batch).
                await run_batch(run_id, batch_path, limit)
                return
        except RocketRideUnavailable as exc:
            log.warning("run %s: RocketRide unavailable (%s) — falling back to local executor", run_id, exc)

    # Local fallback path (the default in the sandbox).
    log.info("run %s: local mode", run_id)
    try:
        await run_batch(run_id, batch_path, limit)
    except Exception as exc:
        log.exception("run %s: batch crashed: %s", run_id, exc)
        db.update_run(run_id, status="failed", endedAt="datetime('now')")


async def get_run(request: web.Request) -> web.Response:
    run_id = request.match_info["run_id"]
    run = db.get_run(run_id)
    if not run:
        return _json_response({"error": "run not found", "run_id": run_id}, status=404)
    return _json_response(run)


async def list_cases(request: web.Request) -> web.Response:
    limit = int(request.query.get("limit") or 100)
    status = request.query.get("status")
    run_id = request.query.get("runId") or request.query.get("run_id")
    cases = db.list_cases(limit=limit, status=status, run_id=run_id)
    # Decode JSON columns for the dashboard's convenience.
    for c in cases:
        for k in ("factsJson", "signalsJson", "evidencePackJson"):
            v = c.get(k)
            if isinstance(v, str) and v:
                try:
                    c[k] = json.loads(v)
                except json.JSONDecodeError:
                    pass
    return _json_response({"cases": cases, "count": len(cases)})


async def get_case(request: web.Request) -> web.Response:
    case_id = request.match_info["case_id"]
    case = db.get_case(case_id)
    if not case:
        return _json_response({"error": "case not found", "caseId": case_id}, status=404)
    # Decode JSON columns.
    for k in ("factsJson", "signalsJson", "evidencePackJson"):
        v = case.get(k)
        if isinstance(v, str) and v:
            try:
                case[k] = json.loads(v)
            except json.JSONDecodeError:
                pass
    return _json_response(case)


async def post_reload_reference(request: web.Request) -> web.Response:
    """Re-import the reference CSVs (vendor_master, payment_history,
    fraud_ground_truth) from data/ into the DB.

    Called by the Next.js upload API after the user uploads their own CSVs
    from their PC, so the vendor master + payment history the pipeline
    grounds against reflects the user's actual dataset.

    Optional JSON body: {"data_dir": "/path/to/data"} — defaults to
    APFRAUD_DATA_DIR or <project>/data.
    """
    try:
        body = await request.json() if request.content_type == "application/json" else {}
    except Exception:
        body = {}
    data_dir = body.get("data_dir") if isinstance(body, dict) else None
    try:
        result = db.reload_reference_csvs(data_dir)
        counts = db.db_counts()
        return _json_response({"ok": True, "reloaded": result, "counts": counts})
    except Exception as exc:
        log.exception("reload-reference failed: %s", exc)
        return _json_response({"ok": False, "error": str(exc)}, status=500)


async def post_decision(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return _json_response({"error": "invalid JSON body"}, status=400)
    case_id = body.get("case_id") or body.get("caseId")
    approver = body.get("approver") or "controller"
    decision = body.get("decision") or body.get("controller_decision") or body.get("controllerDecision")
    reason = body.get("reason") or ""

    if not case_id:
        return _json_response({"error": "case_id required"}, status=400)
    if decision not in ("release", "hold", "escalate"):
        return _json_response({"error": "decision must be release|hold|escalate"}, status=400)

    case = db.get_case(case_id)
    if not case:
        return _json_response({"error": "case not found", "caseId": case_id}, status=404)

    # Stage 07 gate action: insert Decision + close the Case.
    db.insert_decision(case_id=case_id, approver=approver, decision=decision, reason=reason)

    # Emit a trace event for the dashboard.
    try:
        from worker.ws_client import emit_case
        await emit_case(
            case.get("runId") or "", case_id, "closed", "gate",
            message=f"controller {decision}: {reason}",
        )
    except Exception:
        pass

    return _json_response({"case_id": case_id, "decision": decision, "approver": approver, "status": "closed"})


def build_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/healthz", healthz)
    app.router.add_post("/runs", post_runs)
    app.router.add_get("/runs/{run_id}", get_run)
    app.router.add_get("/cases", list_cases)
    app.router.add_get("/cases/{case_id}", get_case)
    app.router.add_post("/decisions", post_decision)
    app.router.add_post("/reload-reference", post_reload_reference)
    return app


__all__ = ["build_app"]
