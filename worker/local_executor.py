"""worker.local_executor — the fallback 7-stage pipeline executor.

This is what runs in the sandbox (no ROCKETRIDE_API_KEY). It mirrors the same
7-stage semantics the RocketRide `.pipe` files express so the dashboard demo
works identically regardless of mode:

    01_intake       → load invoice JSON + paired email JSON by case_id.
                      Insert Case row. status='queued'.
    02_extraction   → json.loads invoice; quarantine on parse failure.
                      Normalize fields → case_facts. status='extracted'.
    03_grounding    → Vendor master lookup + PaymentHistory + stats.
                      status='grounded'.
    04_signals      → 6 pure signal functions → signals + risk_score.
                      status='scored'.
    05_agents       → 3 subagents via /api/ai/llm (or deterministic fallback).
                      status='reviewed'.
    06_verification → ONLY when recommendation=='hold' AND verification_required.
                      Build call script → TTS → ASR → classify (or fallback).
                      status='verified'.
    07_gate         → Held cases stay 'verified' awaiting controller decision.
                      Pass cases auto-close with decision='release'.

Each stage transition emits a trace event to the WS service (port 3003) —
the dashboard's pipeline-ws subscriber picks these up for live updates.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Mapping

from worker import agents, call as call_mod, db, signals
from worker.parsers import parse_email_eml, parse_invoice_pdf
from worker.ws_client import emit_case, emit_run_completed, emit_run_started, emit_stage

log = logging.getLogger("worker.local")

# Project root = parent of the worker/ package (portable across machines).
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get(
    "APFRAUD_DATA_DIR", os.path.join(_PROJECT_ROOT, "data")
)
INVOICES_DIR = os.environ.get("APFRAUD_INVOICES_DIR", os.path.join(DATA_DIR, "invoices"))
EMAILS_DIR = os.environ.get("APFRAUD_EMAILS_DIR", os.path.join(DATA_DIR, "emails"))
PRERECORDED_DIR = os.environ.get(
    "APFRAUD_PRERECORDED_DIR", os.path.join(DATA_DIR, "prerecorded")
)

# Cost model — mirrors src/lib/types.ts COST.
COST_SIGNALS_PER_INVOICE = 0.0005
COST_LLM_PER_REVIEWED_CASE = 0.015
COST_CALL_PER_HELD_CASE = 0.09


# ---------- helpers ----------

def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _list_invoice_files(batch_path: str | None = None, limit: int | None = None) -> list[str]:
    """Return sorted list of invoice PDF files in the invoices dir."""
    inv_dir = batch_path or INVOICES_DIR
    if not os.path.isdir(inv_dir):
        log.warning("invoices dir %s does not exist yet — Task 2-a may still be running", inv_dir)
        return []
    out = sorted(
        os.path.join(inv_dir, f)
        for f in os.listdir(inv_dir)
        if f.lower().endswith(".pdf")
    )
    if limit:
        out = out[:limit]
    return out


def _list_email_files(batch_path: str | None = None) -> list[str]:
    """Return sorted list of email .eml files.

    When `batch_path` is given (user uploaded their own PDFs + EMLs), scan
    that directory for .eml files so uploaded emails pair with uploaded
    invoices. When no batch_path, scan the global EMAILS_DIR (the synthetic
    seed dataset that ships with the project).
    """
    eml_dir = batch_path or EMAILS_DIR
    if not os.path.isdir(eml_dir):
        return []
    return sorted(
        os.path.join(eml_dir, f)
        for f in os.listdir(eml_dir)
        if f.lower().endswith(".eml")
    )


def _pair_emails_for_invoice(invoice_path: str, email_files: list[str]) -> str | None:
    """Find a paired email for the given invoice .pdf.

    Pairing strategy (in order of preference):
      1. Extract the invoice's facts marker → get case_id. Scan each .eml's
         facts marker for the same case_id. (C-001 invoice ↔ email_101.eml)
      2. Extract the invoice_number from the invoice facts. Scan each .eml's
         body for that invoice_number. (C-002 invoice ↔ email_102.eml, etc.)
      3. Give up — no paired email (legitimate invoices have no paired email).
    """
    # Parse the invoice to get its facts (case_id + invoice_number).
    inv = parse_invoice_pdf(invoice_path)
    if not inv:
        return None
    case_id = inv.get("case_id")
    invoice_no = inv.get("invoice_number")

    for ep in email_files:
        em = parse_email_eml(ep)
        if not em:
            continue
        # Strategy 1: case_id marker match (BEC email ↔ BEC invoice).
        if case_id and em.get("case_id") and em["case_id"] == case_id:
            return ep
        # Strategy 2: invoice_number mentioned in the email body / subject.
        if invoice_no and (invoice_no in (em.get("body") or "") or invoice_no in (em.get("subject") or "")):
            return ep
    return None


# ---------- stages ----------

async def stage_01_intake(case: dict, invoice_path: str, email_path: str | None, run_id: str) -> dict:
    """Load invoice PDF + paired email EML, set caseId + sourcePath + kind, defer insert.

    caseId is derived from the invoice .pdf filename stem (e.g.
    `INV-2026-4410.pdf` → caseId=`INV-2026-4410`). This is the natural AP
    identifier — controllers refer to cases by invoice number.
    """
    case_id = case.get("caseId") or os.path.splitext(os.path.basename(invoice_path))[0]
    case["caseId"] = case_id
    case["runId"] = run_id
    case["sourcePath"] = invoice_path
    case["kind"] = "invoice"
    case["status"] = "queued"

    # Defer the actual Case row insert until after Stage 02 (so quarantined
    # files still get a row with factsJson={"error":"schema_validation_fail"}).
    case["__invoice_path"] = invoice_path
    case["__email_path"] = email_path

    await emit_stage(run_id, "intake", "running", case_id)
    await emit_case(run_id, case_id, "queued", "intake")
    await emit_stage(run_id, "intake", "complete", case_id)
    return case


async def stage_02_extraction(case: dict) -> dict:
    """Parse invoice PDF; quarantine on failure. Normalize to case_facts."""
    run_id = case.get("runId", "")
    case_id = case.get("caseId", "")
    invoice_path = case.pop("__invoice_path", None)
    email_path = case.pop("__email_path", None)

    await emit_stage(run_id, "extraction", "running", case_id)

    # --- Parse invoice PDF ---
    invoice = parse_invoice_pdf(invoice_path) if invoice_path else None
    if not invoice:
        # Quarantine lane — feature, not a bug. CORRUPT-9901 hits here.
        log.warning("case %s: quarantined — invoice PDF parse failed", case_id)
        case["status"] = "quarantined"
        case["factsJson"] = json.dumps(
            {"error": "schema_validation_fail", "reason": "pdfplumber extraction returned empty / failed",
             "source": invoice_path}
        )
        case["signalsJson"] = "[]"
        case["evidencePackJson"] = "{}"
        case["riskScore"] = 0.0
        case["vendorName"] = case.get("vendorName") or "Unknown"
        case["invoiceNumber"] = case.get("invoiceNumber") or case_id
        case["amountUsd"] = 0.0
        case["currency"] = "USD"
        case["isFraud"] = False
        db.insert_case(case)
        await emit_case(run_id, case_id, "quarantined", "extraction", message="quarantined: schema_validation_fail")
        await emit_stage(run_id, "extraction", "complete", case_id)
        return case

    # --- Normalize invoice fields → case_facts ---
    facts = {
        "case_id": invoice.get("case_id") or case_id,
        "invoice_number": invoice.get("invoice_number") or case_id,
        "vendor_id": invoice.get("vendor_id"),
        "vendor_name": invoice.get("vendor_name") or "Unknown",
        "invoice_date": invoice.get("invoice_date"),
        "due_date": invoice.get("due_date"),
        "amount_usd": float(invoice.get("amount_usd") or 0),
        "currency": invoice.get("currency") or "USD",
        "bank_account": invoice.get("bank_account"),
        "remit_to_email": invoice.get("remit_to_email"),
        "line_items": invoice.get("line_items") or [],
        "notes": invoice.get("notes"),
    }
    case["facts"] = facts
    case["invoiceNumber"] = facts["invoice_number"]
    case["vendorName"] = facts["vendor_name"]
    # Don't set case["vendorId"] from facts.vendor_id yet — the FK constraint
    # on Case.vendorId → Vendor.vendorId would fail if the master doesn't
    # have this vendor (first-time / fake). stage_03_grounding resolves the
    # real master row and updates the Case with the matched vendorId (or
    # leaves it NULL). The first_time_vendor signal fires on the no-master
    # case.
    case["amountUsd"] = facts["amount_usd"]
    case["currency"] = facts["currency"]
    case["invoiceDate"] = facts["invoice_date"]
    case["dueDate"] = facts["due_date"]

    # --- Parse email (if paired) ---
    email = None
    if email_path:
        em = parse_email_eml(email_path)
        if em:
            case["email"] = {
                "fromDomain": em.get("from_domain"),
                "from": em.get("from"),
                "date": em.get("date"),
                "subject": em.get("subject"),
                "body": em.get("body"),
                "bankChangeRequest": bool(em.get("bank_change_request")),
                "bankChangeRequestDate": em.get("date") if em.get("bank_change_request") else None,
                "requestedBankAccount": em.get("requested_bank_account"),
                "caseId": em.get("case_id"),
            }
            # Surface fields onto the Case row for the dashboard.
            case["senderDomain"] = case["email"]["fromDomain"]
            case["bankChangeRequestDate"] = case["email"]["bankChangeRequestDate"]
            case["requestedBankAccount"] = case["email"]["requestedBankAccount"]
            case["emailBody"] = (em.get("body") or "")[:4000] or None
        else:
            log.warning("case %s: email parse failed — proceeding without email", case_id)
            case["email"] = {}
    else:
        case["email"] = {}

    case["status"] = "extracted"
    # Persist the case row now that extraction succeeded. factsJson is the
    # canonical case_facts blob; later stages update the same row.
    case["factsJson"] = db.dump_json({"facts": facts, "email": case.get("email", {}), "source": invoice_path})
    case["signalsJson"] = "[]"
    case["evidencePackJson"] = "{}"
    case["riskScore"] = 0.0
    case["isFraud"] = False
    db.insert_case(case)

    await emit_case(run_id, case_id, "extracted", "extraction")
    await emit_stage(run_id, "extraction", "complete", case_id)
    return case


async def stage_03_grounding(case: dict) -> dict:
    """Vendor master lookup + payment history + stats."""
    run_id = case.get("runId", "")
    case_id = case.get("caseId", "")
    await emit_stage(run_id, "grounding", "running", case_id)

    facts = case.get("facts") or {}
    vendor_id = facts.get("vendor_id")
    vendor_name = facts.get("vendor_name")

    vendor = None
    if vendor_id:
        vendor = db.get_vendor(vendor_id)
    if not vendor and vendor_name:
        vendor = db.find_vendor_by_name(vendor_name)

    history = []
    stats = {"amount_mean": 0.0, "amount_std": 0.0, "count": 0, "last_paid_date": None}
    if vendor:
        history = db.get_payment_history(vendor.get("vendorId"), limit=50)
        from worker.utils.stats import compute_vendor_stats
        stats = compute_vendor_stats(history)

    case["vendor"] = vendor
    case["stats"] = stats

    # Update Case row with the resolved vendor_id (may be None for first-time).
    db.update_case(
        case_id,
        vendorId=vendor.get("vendorId") if vendor else None,
    )

    await emit_case(run_id, case_id, "grounded", "grounding")
    await emit_stage(run_id, "grounding", "complete", case_id)
    return case


async def stage_04_signals(case: dict) -> dict:
    """Run all 6 deterministic signals + assemble + risk_score."""
    run_id = case.get("runId", "")
    case_id = case.get("caseId", "")
    await emit_stage(run_id, "signals", "running", case_id)

    facts = case.get("facts") or {}
    vendor = case.get("vendor") or {}
    stats = case.get("stats") or {}

    # Duplicate lookup against payment_history.
    dupes = db.find_duplicate_payments(
        vendor_id=vendor.get("vendorId") if vendor else facts.get("vendor_id"),
        invoice_number=facts.get("invoice_number"),
        amount=float(facts.get("amount_usd") or 0),
    )
    case["duplicates"] = dupes

    result = signals.assemble_signals(case)
    case["signals"] = result["signals"]
    case["risk_score"] = result["risk_score"]
    case["recommendation"] = result["recommendation"]

    db.update_case(
        case_id,
        status="scored",
        signalsJson=db.dump_json(result["signals"]),
        riskScore=float(result["risk_score"]),
        recommendation=result["recommendation"],
    )

    await emit_case(run_id, case_id, "scored", "signals")
    await emit_stage(run_id, "signals", "complete", case_id)
    return case


async def stage_05_agents(case: dict) -> dict:
    """3 subagents via /api/ai/llm (deterministic fallback on failure)."""
    run_id = case.get("runId", "")
    case_id = case.get("caseId", "")
    await emit_stage(run_id, "agents", "running", case_id)

    result = await agents.run_agents(case)
    case["narrative"] = result["narrative"]
    case["verification"] = result["verification"]
    case["evidence_pack"] = result["evidence_pack"]
    case["recommendation"] = result["recommendation"]
    case["used_llm"] = result["used_llm"]

    db.update_case(
        case_id,
        status="reviewed",
        narrative=result["narrative"],
        recommendation=result["recommendation"],
        evidencePackJson=db.dump_json(result["evidence_pack"]),
    )

    await emit_case(run_id, case_id, "reviewed", "agents")
    await emit_stage(run_id, "agents", "complete", case_id)
    return case


async def stage_06_verification(case: dict) -> dict:
    """Only when recommendation=='hold' AND verification_required. Place the call."""
    run_id = case.get("runId", "")
    case_id = case.get("caseId", "")
    await emit_stage(run_id, "verification", "running", case_id)

    recommendation = case.get("recommendation")
    verification = case.get("verification") or {}
    verification_required = bool(verification.get("verification_required"))

    if recommendation == "hold" and verification_required:
        call_result = await call_mod.run_verification_call(case)
        case["call_transcript"] = call_result["call_transcript"]
        case["call_audio_url"] = call_result["call_audio_url"]
        case["verification_result"] = call_result["verification_result"]
        case["used_ai_call"] = call_result["used_ai"]

        db.update_case(
            case_id,
            status="verified",
            callTranscript=call_result["call_transcript"],
            callAudioUrl=call_result["call_audio_url"],
            verificationResult=call_result["verification_result"],
        )
        await emit_case(
            run_id, case_id, "verified", "verification",
            message=f"verification_result={call_result['verification_result']}",
        )
    elif recommendation == "hold" and not verification_required:
        # Held by risk_score alone; no call placed.
        case["verification_result"] = None
        db.update_case(case_id, status="verified", verificationResult=None)
        await emit_case(run_id, case_id, "verified", "verification", message="hold (no call required)")
    else:
        # Pass case — skip the call, auto-close at Stage 07.
        case["verification_result"] = None
        db.update_case(case_id, status="verified", verificationResult=None)
        await emit_case(run_id, case_id, "verified", "verification", message="pass (no call)")

    await emit_stage(run_id, "verification", "complete", case_id)
    return case


async def stage_07_gate(case: dict) -> dict:
    """Stage 07. Pass cases auto-close. Held cases stay 'verified' for controller."""
    run_id = case.get("runId", "")
    case_id = case.get("caseId", "")
    await emit_stage(run_id, "gate", "running", case_id)

    if case.get("recommendation") == "pass":
        # Auto-release: no human decision required for pass cases.
        db.insert_decision(
            case_id=case_id,
            approver="system",
            decision="release",
            reason="Auto-release: recommendation=pass, no verification required.",
        )
        case["status"] = "closed"
        case["decision"] = "release"
        await emit_case(run_id, case_id, "closed", "gate", message="auto-release")
    else:
        # Held case — stays 'verified' until the dashboard POSTs /decisions.
        case["status"] = "verified"
        await emit_case(run_id, case_id, "verified", "gate", message="awaiting controller decision")

    await emit_stage(run_id, "gate", "complete", case_id)
    return case


# ---------- per-case pipeline ----------

async def run_case_pipeline(case_id_hint: str, invoice_path: str, email_path: str | None, run_id: str) -> dict:
    """Run stages 01→07 for one case. Returns the final case dict."""
    case: dict = {"caseId": case_id_hint}
    try:
        await stage_01_intake(case, invoice_path, email_path, run_id)
        await stage_02_extraction(case)
        if case.get("status") == "quarantined":
            # Skip the rest — quarantined cases just sit in the queue.
            return case
        await stage_03_grounding(case)
        await stage_04_signals(case)
        await stage_05_agents(case)
        await stage_06_verification(case)
        await stage_07_gate(case)
    except Exception as exc:
        log.exception("case %s pipeline failed at stage: %s", case_id_hint, exc)
        # Mark the case failed but don't crash the batch.
        try:
            db.update_case(case.get("caseId", case_id_hint), status="quarantined")
        except Exception:
            pass
    return case


# ---------- batch ----------

async def run_batch(run_id: str, batch_path: str | None = None, limit: int | None = None) -> dict:
    """Discover invoice JSONs, pair with emails, run the full pipeline per case.

    Returns the final Run row dict.
    """
    started_at_iso = _now_iso()
    started_perf = time.time()
    # Clear any prior Case/Decision rows so plain INSERTs don't hit the caseId
    # UNIQUE constraint on re-runs. Run rows are preserved (Runs page history).
    db.clear_runtime_tables()
    db.insert_run(run_id, started_at_iso, status="running")
    await emit_run_started(run_id)

    invoice_files = _list_invoice_files(batch_path, limit=limit)
    email_files = _list_email_files(batch_path)
    log.info("run %s: %d invoice files, %d email files discovered (batch_path=%s)",
             run_id, len(invoice_files), len(email_files), batch_path or INVOICES_DIR)

    if not invoice_files:
        log.warning("run %s: no invoices found at %s — Task 2-a may still be building", run_id, batch_path or INVOICES_DIR)

    cases_processed = 0
    cases_held = 0
    fraud_caught = 0
    amount_saved = 0.0
    llm_cost = 0.0
    call_cost = 0.0

    for invoice_path in invoice_files:
        case_id_hint = os.path.splitext(os.path.basename(invoice_path))[0]
        email_path = _pair_emails_for_invoice(invoice_path, email_files)
        case = await run_case_pipeline(case_id_hint, invoice_path, email_path, run_id)
        cases_processed += 1
        if case.get("recommendation") == "hold":
            cases_held += 1
            call_cost += COST_CALL_PER_HELD_CASE  # cost accrues whether or not AI was used
        if case.get("used_llm"):
            llm_cost += COST_LLM_PER_REVIEWED_CASE
        # Score the run against ground truth — only cases we held AND were
        # actually fraud count toward "fraud caught".
        gt = db.get_ground_truth_for_case(case.get("caseId", ""), case.get("invoiceNumber"))
        is_fraud = False
        if gt:
            is_fraud = bool(gt.get("isFraud"))
            db.update_case(case.get("caseId", ""), isFraud=1 if is_fraud else 0, fraudType=gt.get("fraudType"))
        if is_fraud and case.get("recommendation") == "hold":
            fraud_caught += 1
            amount_saved += float(case.get("amountUsd") or 0)

    duration_s = round(time.time() - started_perf, 3)
    signals_cost = cases_processed * COST_SIGNALS_PER_INVOICE
    total_cost = round(signals_cost + llm_cost + call_cost, 4)

    ended_at_iso = _now_iso()
    db.update_run(
        run_id,
        endedAt=ended_at_iso,
        status="complete",
        casesProcessed=cases_processed,
        casesHeld=cases_held,
        fraudCaught=fraud_caught,
        amountSavedUsd=round(amount_saved, 2),
        signalsCostUsd=round(signals_cost, 4),
        llmCostUsd=round(llm_cost, 4),
        callCostUsd=round(call_cost, 4),
        totalUsd=total_cost,
        durationS=duration_s,
    )
    await emit_run_completed(
        run_id,
        message=f"complete: processed={cases_processed} held={cases_held} fraud_caught={fraud_caught} ${amount_saved:,.0f} saved cost=${total_cost:.4f}",
    )
    log.info(
        "run %s complete: processed=%d held=%d fraud_caught=%d saved=$%.2f cost=$%.4f duration=%.2fs",
        run_id, cases_processed, cases_held, fraud_caught, amount_saved, total_cost, duration_s,
    )
    return db.get_run(run_id) or {}


__all__ = [
    "stage_01_intake", "stage_02_extraction", "stage_03_grounding",
    "stage_04_signals", "stage_05_agents", "stage_06_verification",
    "stage_07_gate", "run_case_pipeline", "run_batch",
]
