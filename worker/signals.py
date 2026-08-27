"""worker.signals — the six deterministic fraud signals + assemble + risk_score.

Pure functions. Same input → same output, every run. The signal weights are
frozen on Day 4 per build prompt §4 and mirrored in ``src/lib/types.ts``
(SIGNAL_WEIGHTS). Don't tune these without also updating the TS contract.

Referenced from ``pipelines/04_signals.pipe`` as:
    worker.signals.check_threshold_skirting
    worker.signals.assemble_signals

And the per-signal python_tool nodes delegate to:
    worker.utils.domain_check.compare_domains    (domain_lookalike)
    worker.utils.timing.bank_change_vs_due_date  (timing_suspicious)
    worker.utils.stats.is_first_time             (first_time_vendor)
    anomaly_detector (RocketRide) / amount_anomaly below (amount_anomaly)
    rocketride_sql duplicate_check                (duplicate)
"""

from __future__ import annotations

import math
from typing import Any, Mapping

from worker.utils.domain_check import compare_domains
from worker.utils.timing import bank_change_vs_due_date
from worker.utils.stats import is_first_time

# Mirror src/lib/types.ts SIGNAL_WEIGHTS — do not diverge.
SIGNAL_WEIGHTS: dict[str, float] = {
    "domain_lookalike": 0.30,
    "timing_suspicious": 0.20,
    "amount_anomaly": 0.20,
    "duplicate": 0.15,
    "first_time_vendor": 0.10,
    "threshold_skirting": 0.05,
}

RISK_HOLD_THRESHOLD = 0.40  # mirror src/lib/types.ts


def amount_anomaly(amount: float, mean: float, std: float) -> dict:
    """z_score = |amount - mean| / std. fired if z_score >= 3.0.

    score = min(z_score / 5, 1.0) so a 3-sigma flag gives 0.6, 5-sigma gives 1.0.
    Guards std>0 (no history → no signal; first_time_vendor catches that case).
    """
    name = "amount_anomaly"
    weight = SIGNAL_WEIGHTS[name]
    if not amount or not std or std <= 0:
        return {"name": name, "score": 0.0, "weight": weight, "evidence": "no history (std=0)", "fired": False}
    z = abs(amount - mean) / std
    fired = z >= 3.0
    score = min(z / 5.0, 1.0) if fired else 0.0
    return {
        "name": name,
        "score": round(score, 4),
        "weight": weight,
        "evidence": f"z_score={z:.2f}, mean=${mean:,.2f}, std=${std:,.2f}",
        "fired": fired,
    }


def domain_lookalike(sender_domain: str | None, registered_domain: str | None) -> dict:
    """Levenshtein-based lookalike detection.

    fired if distance > 0 (any difference) AND distance <= 5 OR specifically the
    close-but-different band (1-3). When the email is missing entirely, the
    signal doesn't fire (we can't compare against nothing).
    """
    name = "domain_lookalike"
    weight = SIGNAL_WEIGHTS[name]
    distance, lookalike, score = compare_domains(sender_domain, registered_domain)
    fired = lookalike and distance > 0
    if distance == -1:
        return {"name": name, "score": 0.0, "weight": weight, "evidence": "no email / no registered domain", "fired": False}
    return {
        "name": name,
        "score": round(score, 4),
        "weight": weight,
        "evidence": f"levenshtein={distance}, registered={registered_domain}, sender={sender_domain}",
        "fired": fired,
    }


def timing_suspicious(bank_change_date: str | None, due_date: str | None) -> dict:
    """fired if 0 <= days_before_due <= 3."""
    name = "timing_suspicious"
    weight = SIGNAL_WEIGHTS[name]
    days, suspicious, score = bank_change_vs_due_date(bank_change_date, due_date)
    if days == -1:
        return {"name": name, "score": 0.0, "weight": weight, "evidence": "missing bank_change_date or due_date", "fired": False}
    return {
        "name": name,
        "score": round(score, 4),
        "weight": weight,
        "evidence": f"days_before_due={days}",
        "fired": suspicious,
    }


def duplicate(dupes_count: int, matched_by: str | None = None) -> dict:
    """fired if the payment_history SQL returned any matching rows."""
    name = "duplicate"
    weight = SIGNAL_WEIGHTS[name]
    fired = (dupes_count or 0) > 0
    return {
        "name": name,
        "score": 1.0 if fired else 0.0,
        "weight": weight,
        "evidence": f"matched_by={matched_by or 'none'}, count={dupes_count}",
        "fired": fired,
    }


def first_time_vendor(
    vendor_in_master: bool,
    vendor_id: str | None,
    vendor_first_invoice_date: str | None,
    invoice_date: str | None,
    payment_history_count: int,
) -> dict:
    name = "first_time_vendor"
    weight = SIGNAL_WEIGHTS[name]
    fired = is_first_time(
        vendor_first_invoice_date=vendor_first_invoice_date,
        invoice_date=invoice_date,
        payment_history_count=payment_history_count,
        vendor_in_master=vendor_in_master,
        vendor_id=vendor_id,
    )
    evidence = "no payment history" if (payment_history_count or 0) == 0 else f"vendor_id={vendor_id or 'unknown'} (master)"
    if not vendor_in_master or not vendor_id:
        evidence = f"vendor_id={vendor_id or 'V-FAKE-001'} (not in master)"
    return {
        "name": name,
        "score": 1.0 if fired else 0.0,
        "weight": weight,
        "evidence": evidence,
        "fired": fired,
    }


def check_threshold_skirting(amount: float, threshold: float = 10000.0, buffer: float = 500.0) -> dict:
    """fired if amount within $500 below the $10K SAR threshold.

    The classic 'just under the reporting line' pattern. INV-2026-1195 at
    $9,950 hits this directly.
    """
    name = "threshold_skirting"
    weight = SIGNAL_WEIGHTS[name]
    fired = (threshold - buffer) <= amount <= threshold
    if fired:
        evidence = f"amount=${amount:,.2f} (within ${buffer:,.0f} of ${threshold:,.0f} SAR threshold)"
    else:
        evidence = f"amount=${amount:,.2f} (outside ${buffer:,.0f}-below ${threshold:,.0f} SAR window)"
    return {
        "name": name,
        "score": 1.0 if fired else 0.0,
        "weight": weight,
        "evidence": evidence,
        "fired": fired,
    }


def assemble_signals(case: Mapping[str, Any]) -> dict:
    """Run all 6 signals against a fully-grounded case dict.

    Expected keys on `case`:
        facts: {amount_usd, currency, invoice_date, due_date, invoice_number,
                vendor_id, vendor_name, ...}
        email: {from_domain, bank_change_request_date, requested_bank_account}
        vendor: {vendorId, registeredDomain, firstInvoiceDate, knownBankAccount}
        stats: {amount_mean, amount_std, count, last_paid_date}
        duplicates: {count, matched_by}     # computed by db.payment_history_lookup

    Returns: {"signals": [...], "risk_score": float, "recommendation": "hold"|"pass"}
    Only fired signals contribute to the risk score — a non-firing signal
    contributes zero. This matches the build prompt §4 formula:
        risk_score = sum(s.weight * s.score for s in signals if s.fired)
    """
    facts = case.get("facts") or {}
    vendor = case.get("vendor") or {}
    stats = case.get("stats") or {}
    email = case.get("email") or {}
    duplicates = case.get("duplicates") or {}

    amount = float(facts.get("amount_usd") or facts.get("amountUsd") or 0.0)
    due_date = facts.get("due_date") or facts.get("dueDate")
    invoice_date = facts.get("invoice_date") or facts.get("invoiceDate")
    invoice_number = facts.get("invoice_number") or facts.get("invoiceNumber")
    vendor_id_in_facts = facts.get("vendor_id") or facts.get("vendorId")

    # Resolve vendor: in master?
    vendor_in_master = bool(vendor and vendor.get("vendorId"))
    vendor_id = vendor.get("vendorId") if vendor_in_master else vendor_id_in_facts
    registered_domain = vendor.get("registeredDomain") if vendor_in_master else None
    first_invoice_date = vendor.get("firstInvoiceDate") if vendor_in_master else None

    signals = [
        amount_anomaly(amount, float(stats.get("amount_mean") or 0.0), float(stats.get("amount_std") or 0.0)),
        domain_lookalike(email.get("fromDomain"), registered_domain),
        timing_suspicious(email.get("bankChangeRequestDate") or email.get("date"), due_date),
        duplicate(int(duplicates.get("count") or 0), duplicates.get("matched_by")),
        first_time_vendor(
            vendor_in_master=vendor_in_master,
            vendor_id=vendor_id,
            vendor_first_invoice_date=first_invoice_date,
            invoice_date=invoice_date,
            payment_history_count=int(stats.get("count") or 0),
        ),
        check_threshold_skirting(amount),
    ]

    risk_score = sum(s["weight"] * s["score"] for s in signals if s["fired"])
    risk_score = round(risk_score, 4)
    recommendation = "hold" if risk_score >= RISK_HOLD_THRESHOLD else "pass"
    return {"signals": signals, "risk_score": risk_score, "recommendation": recommendation}


__all__ = [
    "SIGNAL_WEIGHTS",
    "RISK_HOLD_THRESHOLD",
    "amount_anomaly",
    "domain_lookalike",
    "timing_suspicious",
    "duplicate",
    "first_time_vendor",
    "check_threshold_skirting",
    "assemble_signals",
]
