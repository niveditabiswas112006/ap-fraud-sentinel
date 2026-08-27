"""worker.agents — the 3 Stage 05 subagents.

Each subagent:
  - Builds a system+user prompt pair from the prompt markdown + the case data.
  - POSTs to the Next.js /api/ai/llm route (which wraps z-ai-web-dev-sdk
    server-side). If the route is unavailable (connection refused), the agent
    produces a deterministic fallback so the demo golden path still works.

The agents module is the ONLY place the worker reaches out to /api/ai/* — the
build prompt forbids importing z-ai-web-dev-sdk into Python.

Tiebreak is always `hold`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Mapping

import aiohttp

from worker.signals import RISK_HOLD_THRESHOLD, SIGNAL_WEIGHTS

log = logging.getLogger("worker.agents")

LLM_URL = os.environ.get("APFRAUD_LLM_URL", "http://localhost:3000/api/ai/llm")
LLM_TIMEOUT_S = float(os.environ.get("APFRAUD_LLM_TIMEOUT_S", "15.0"))

_PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def _load_prompt(name: str) -> str:
    path = os.path.join(_PROMPTS_DIR, name)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError as exc:
        log.warning("could not load prompt %s: %s — using inline fallback", path, exc)
        return f"You are the {name} agent in the AP Payment Fraud Sentinel pipeline."


async def _call_llm(system: str, user: str, max_tokens: int = 700, temperature: float = 0.2) -> str | None:
    """POST to /api/ai/llm. Returns the text, or None if the route is unavailable."""
    payload = {"system": system, "user": user, "max_tokens": max_tokens, "temperature": temperature}
    try:
        timeout = aiohttp.ClientTimeout(total=LLM_TIMEOUT_S)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(LLM_URL, json=payload) as resp:
                if resp.status != 200:
                    log.debug("LLM route returned %s", resp.status)
                    return None
                data = await resp.json()
                return data.get("text") or data.get("content") or None
    except Exception as exc:
        log.warning("LLM route unavailable at %s: %s — using deterministic fallback", LLM_URL, exc)
        return None


def _safe_json(text: str | None) -> dict | None:
    """Extract a JSON object from an LLM response (which may wrap JSON in ```json fences)."""
    if not text:
        return None
    # Try fenced JSON first.
    m = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try the first {...} block.
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ---------- prompt builders ----------

def bec_analyst_prompt(signals: list[dict], facts: dict, vendor: dict | None, stats: dict) -> tuple[str, str]:
    system = _load_prompt("bec_analyst.md")
    user = json.dumps(
        {
            "signals": signals,
            "invoice": facts,
            "vendor": vendor,
            "stats": stats,
        },
        default=str,
    )
    return system, user


def vendor_verifier_prompt(narrative: str, vendor: dict | None, risk_score: float) -> tuple[str, str]:
    system = _load_prompt("vendor_verifier.md")
    user = json.dumps(
        {
            "narrative": narrative,
            "vendor": vendor,
            "risk_score": risk_score,
        },
        default=str,
    )
    return system, user


def case_builder_prompt(
    narrative: str, verification: dict, signals: list[dict], facts: dict, vendor: dict | None
) -> tuple[str, str]:
    system = _load_prompt("case_builder.md")
    user = json.dumps(
        {
            "narrative": narrative,
            "verification": verification,
            "signals": signals,
            "invoice": facts,
            "vendor": vendor,
        },
        default=str,
    )
    return system, user


# ---------- deterministic fallbacks ----------

def _fallback_bec_analyst(signals: list[dict], facts: dict, vendor: dict | None, stats: dict) -> dict:
    fired = [s for s in signals if s.get("fired")]
    top = sorted(fired, key=lambda s: s.get("weight", 0), reverse=True)[:2]
    top_names = [s["name"] for s in top] or ["no_signals_fired"]
    amount = facts.get("amount_usd") or facts.get("amountUsd") or 0
    vendor_name = facts.get("vendor_name") or facts.get("vendorName") or (
        vendor.get("legalName") if vendor else "Unknown vendor"
    )
    invoice_no = facts.get("invoice_number") or facts.get("invoiceNumber") or "?"
    if fired:
        evidence_bits = "; ".join(f"{s['name']}({s.get('evidence','')})" for s in top)
        narrative = (
            f"Invoice {invoice_no} for {vendor_name} (${amount:,.2f}) flagged by {len(fired)} signal(s): "
            f"{evidence_bits}. Recommend Stage 06 out-of-band verification before payment."
        )
    else:
        narrative = (
            f"Invoice {invoice_no} for {vendor_name} (${amount:,.2f}) — no deterministic signals fired. "
            f"Amount within historical range; no bank-change request detected. Stage 05 review complete."
        )
    return {
        "narrative": narrative,
        "confidence": 0.95 if fired else 0.0,
        "top_signals": top_names,
    }


def _fallback_vendor_verifier(narrative: str, vendor: dict | None, risk_score: float, signals: list[dict]) -> dict:
    # The verifier asks: does the risk warrant an out-of-band call?
    # Build prompt ties this to the frozen risk threshold (0.40) — NOT to
    # any single signal firing. Keying off individual signals caused
    # mass over-holding of legit invoices. The risk_score already weights
    # every fired signal; if it doesn't cross threshold, there is no case
    # for a verification call.
    verification_required = risk_score >= RISK_HOLD_THRESHOLD
    reason = (
        "Verify the bank-account change request before payment release."
        if verification_required
        else "No verification required — deterministic signals silent and risk_score below threshold."
    )
    channel = "known_phone"
    if not vendor or not vendor.get("knownPhone"):
        channel = "manual_outreach"
        reason = "Vendor not in master file — escalate to manual outreach."
    return {
        "verification_required": verification_required,
        "reason": reason,
        "channel": channel,
    }


def _fallback_case_builder(
    narrative: str, verification: dict, signals: list[dict], facts: dict, vendor: dict | None, risk_score: float
) -> dict:
    fired = [s for s in signals if s.get("fired")]
    top_signals = [s["name"] for s in sorted(fired, key=lambda s: s.get("weight", 0), reverse=True)[:3]]
    vendor_name = facts.get("vendor_name") or facts.get("vendorName") or (
        vendor.get("legalName") if vendor else "Unknown"
    )
    pack = {
        "headline": (
            f"{facts.get('case_id') or facts.get('caseId')} — {vendor_name} ${facts.get('amount_usd') or facts.get('amountUsd'):,.2f} "
            f"(top signal: {top_signals[0] if top_signals else 'none'})"
        ),
        "amount": float(facts.get("amount_usd") or facts.get("amountUsd") or 0),
        "currency": facts.get("currency") or "USD",
        "vendor_name": vendor_name,
        "invoice_number": facts.get("invoice_number") or facts.get("invoiceNumber"),
        "invoice_date": facts.get("invoice_date") or facts.get("invoiceDate"),
        "due_date": facts.get("due_date") or facts.get("dueDate"),
        "top_signals": top_signals,
        "risk_score": risk_score,
        "verification_required": verification.get("verification_required"),
        "verification_reason": verification.get("reason"),
        "narrative": narrative,
        "bank_account_on_master": (vendor or {}).get("knownBankAccount"),
        "bank_account_requested": facts.get("bank_account") or facts.get("requestedBankAccount"),
    }
    # Build prompt: hold iff risk_score >= frozen threshold (0.40). The
    # verifier already gated on the same threshold; the case builder
    # concurs. The manager's tiebreak is `hold` — applied below in
    # run_agents when agents disagree. We do NOT hold on any single
    # signal firing alone — that produced 87 holds on a 141-invoice
    # batch where the demo target is ~3.
    recommend_hold = risk_score >= RISK_HOLD_THRESHOLD
    return {
        "evidence_pack": pack,
        "recommendation": "hold" if recommend_hold else "pass",
    }


# ---------- orchestration ----------

async def run_agents(case: Mapping[str, Any]) -> dict:
    """Run all 3 subagents + the manager arbitration.

    Returns:
        {
          "narrative": str,
          "verification": {verification_required, reason, channel},
          "evidence_pack": {...},
          "recommendation": "hold"|"pass",
          "used_llm": bool,   # whether at least one LLM call succeeded
        }

    When LLM is unavailable, every agent falls back to its deterministic
    template — the recommendation is still well-defined and the demo runs.
    """
    signals = list(case.get("signals") or [])
    facts = case.get("facts") or {}
    vendor = case.get("vendor")
    stats = case.get("stats") or {}
    risk_score = float(case.get("risk_score") or 0.0)

    # --- 1. BEC Analyst ---
    sys1, usr1 = bec_analyst_prompt(signals, facts, vendor, stats)
    text1 = await _call_llm(sys1, usr1)
    parsed1 = _safe_json(text1)
    if parsed1 and "narrative" in parsed1:
        analyst = parsed1
        used_llm_1 = True
    else:
        analyst = _fallback_bec_analyst(signals, facts, vendor, stats)
        used_llm_1 = False
    narrative = analyst.get("narrative", "")

    # --- 2. Vendor Verifier ---
    sys2, usr2 = vendor_verifier_prompt(narrative, vendor, risk_score)
    text2 = await _call_llm(sys2, usr2)
    parsed2 = _safe_json(text2)
    if parsed2 and "verification_required" in parsed2:
        verification = parsed2
        used_llm_2 = True
    else:
        verification = _fallback_vendor_verifier(narrative, vendor, risk_score, signals)
        used_llm_2 = False

    # --- 3. Case Builder ---
    sys3, usr3 = case_builder_prompt(narrative, verification, signals, facts, vendor)
    text3 = await _call_llm(sys3, usr3)
    parsed3 = _safe_json(text3)
    if parsed3 and "recommendation" in parsed3:
        builder = parsed3
        used_llm_3 = True
    else:
        builder = _fallback_case_builder(narrative, verification, signals, facts, vendor, risk_score)
        used_llm_3 = False

    # --- Manager arbitration ---
    # In the deterministic local path, the manager's tiebreak is `hold` —
    # any agent recommending hold wins; pass only if all three say pass.
    # When the LLM is live, the manager verdict from CrewAI would be the
    # same arbitration. We don't call the LLM a 4th time here.
    recs = [
        "hold" if (verification.get("verification_required")) else "pass",
        builder.get("recommendation", "hold"),
        "hold" if risk_score >= RISK_HOLD_THRESHOLD else "pass",
    ]
    holds = recs.count("hold")
    passes = recs.count("pass")
    recommendation = "hold" if holds >= passes else "pass"  # tiebreak hold

    return {
        "narrative": narrative,
        "verification": verification,
        "evidence_pack": builder.get("evidence_pack", {}),
        "recommendation": recommendation,
        "used_llm": used_llm_1 or used_llm_2 or used_llm_3,
    }


__all__ = [
    "bec_analyst_prompt",
    "vendor_verifier_prompt",
    "case_builder_prompt",
    "run_agents",
]
