"""worker.ws_client — push trace events to the pipeline-ws service on port 3003.

The dashboard's mini-services/pipeline-ws (Task 2-c) listens for trace events
on port 3003. This module POSTs each event to /trace with a 1s timeout and
swallows errors — the worker never crashes if the WS service is unavailable
(build prompt §1: "missing WS degrades gracefully with a logged warning").
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Mapping

import aiohttp

log = logging.getLogger("worker.ws")

WS_URL = os.environ.get("APFRAUD_WS_URL", "http://localhost:3003/trace")
WS_TIMEOUT_S = float(os.environ.get("APFRAUD_WS_TIMEOUT_S", "1.0"))


def _make_event(
    type_: str,
    run_id: str,
    *,
    stage: str | None = None,
    stage_status: str | None = None,
    case_id: str | None = None,
    case_status: str | None = None,
    message: str | None = None,
) -> dict:
    return {
        "type": type_,
        "runId": run_id,
        "stage": stage,
        "stageStatus": stage_status,
        "caseId": case_id,
        "caseStatus": case_status,
        "message": message,
        "timestamp": int(time.time() * 1000),
    }


async def emit(event: Mapping[str, Any] | None = None, **kwargs: Any) -> None:
    """POST one trace event to the WS service. Never raises.

    Either pass a full event dict, or pass kwargs and we'll assemble + timestamp
    it for you (type, runId, stage, stageStatus, caseId, caseStatus, message).
    """
    if event is None:
        event = _make_event(
            kwargs.pop("type", "log"),
            kwargs.pop("runId", ""),
            stage=kwargs.pop("stage", None),
            stage_status=kwargs.pop("stageStatus", None),
            case_id=kwargs.pop("caseId", None),
            case_status=kwargs.pop("caseStatus", None),
            message=kwargs.pop("message", None),
        )
    body = json.dumps(event, default=str)
    try:
        timeout = aiohttp.ClientTimeout(total=WS_TIMEOUT_S)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(WS_URL, data=body, headers={"Content-Type": "application/json"}) as resp:
                if resp.status >= 400:
                    log.debug("ws trace endpoint returned %s", resp.status)
    except Exception as exc:
        # Never crash on a missing/unresponsive WS service — log at debug.
        log.debug("ws trace emit failed: %s", exc)


async def emit_run_started(run_id: str) -> None:
    await emit(_make_event("run_started", run_id, message=f"run {run_id} started"))


async def emit_run_completed(run_id: str, message: str | None = None) -> None:
    await emit(_make_event("run_completed", run_id, message=message or f"run {run_id} completed"))


async def emit_stage(run_id: str, stage: str, status: str, message: str | None = None) -> None:
    await emit(_make_event("stage", run_id, stage=stage, stage_status=status, message=message))


async def emit_case(run_id: str, case_id: str, case_status: str, stage: str | None = None, message: str | None = None) -> None:
    await emit(_make_event("case", run_id, stage=stage, case_status=case_status, case_id=case_id, message=message))


__all__ = ["emit", "emit_run_started", "emit_run_completed", "emit_stage", "emit_case"]
