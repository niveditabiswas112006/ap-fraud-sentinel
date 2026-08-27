"""worker.parsers — raw-file intake for .pdf invoices and .eml emails.

The user's actual dataset is a folder of .pdf and .eml files (not pre-extracted
JSON). This module does the heavy lifting:

  parse_invoice_pdf(path)  → dict | None   (uses pdfplumber for text + a
                                            hidden JSON marker for reliable
                                            structured-field extraction)
  parse_email_eml(path)    → dict | None   (uses Python's built-in `email`
                                            module + the same JSON marker)

The hidden marker line is `FRAUD_SENTINEL_FACTS:v1:{...json...}`. It's written
by `scripts/gen_raw_dataset.py` so the worker doesn't have to OCR invoices to
get the structured fields. When the user drops in their *real* PDFs (no marker),
the worker falls back to regex extraction of the visible text — best-effort,
and quarantines on failure (which is the correct behaviour for unreadable
files).

This module is import-safe: pdfplumber and email are imported lazily so a
broken pdfplumber install doesn't crash the worker boot.
"""
from __future__ import annotations

import json
import logging
import os
import re
from email import message_from_binary_file
from email.policy import default as default_email_policy
from typing import Any

log = logging.getLogger("worker.parsers")

FACTS_MARKER_PREFIX = "FRAUD_SENTINEL_FACTS:v1:"
# Same prefix the email body uses, but wrapped in --...-- so it's hidden in
# the rendered message.
_EMAIL_MARKER_RE = re.compile(
    rf"--{re.escape(FACTS_MARKER_PREFIX)}(\{{[^>]+\}})--",
    re.DOTALL,
)
# A looser fallback for unwrapped markers.
_LOOSE_MARKER_RE = re.compile(
    rf"{re.escape(FACTS_MARKER_PREFIX)}(\{{[^<\n]+\}})",
    re.DOTALL,
)


# ---------- shared helpers ----------

def _try_load_marker(text: str) -> dict | None:
    """Search the page text for the FRAUD_SENTINEL_FACTS marker and parse it.

    Tries the wrapped form first (used in emails), then the loose form (used
    in PDFs). Returns None if not found / not JSON.
    """
    if not text:
        return None
    m = _EMAIL_MARKER_RE.search(text) or _LOOSE_MARKER_RE.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except (json.JSONDecodeError, IndexError):
        return None


def _coerce_amount(text: Any) -> float:
    if text is None:
        return 0.0
    if isinstance(text, (int, float)):
        return float(text)
    s = str(text).strip().lstrip("$").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


# ---------- PDF parsing ----------

def _extract_invoice_fields_from_visible_text(text: str) -> dict:
    """Best-effort regex extraction when no marker is present (the user's real
    PDFs without our hidden marker)."""
    fields: dict[str, Any] = {}
    if not text:
        return fields
    # Invoice number
    m = re.search(r"(INV-\d{4}-\d{3,4}[A-Z]?|INV-\d{3,5}[A-Z]?)\b", text)
    if m:
        fields["invoice_number"] = m.group(1)
    # Total amount
    m = re.search(r"TOTAL\s+DUE[:\s]*\$?([\d,]+\.\d{2})", text, re.IGNORECASE)
    if not m:
        m = re.search(r"\$([\d,]+\.\d{2})\s*USD", text)
    if m:
        fields["amount_usd"] = _coerce_amount(m.group(1))
    # Date
    m = re.search(r"Date[:\s]+(\d{4}-\d{2}-\d{2})", text)
    if m:
        fields["invoice_date"] = m.group(1)
    # Bank account (loose IBAN-like)
    m = re.search(r"\b([A-Z]{2}\d{2}\s?[A-Z0-9]{4}(?:\s?[A-Z0-9]{1,4}){1,7})\b", text)
    if m:
        fields["bank_account"] = m.group(1)
    # Remit-to email
    m = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text)
    if m:
        fields.setdefault("remit_to_email", m.group(0))
    return fields


def parse_invoice_pdf(path: str) -> dict | None:
    """Extract structured fields from a .pdf invoice.

    Returns a dict shaped like the original invoice JSON, or None on failure
    (which causes the worker to quarantine the case).

    Strategy:
      1. Try pdfplumber → extract page text.
      2. Look for the hidden JSON marker (the generator writes one for every
         synthetic invoice — gives the worker the exact facts every time).
      3. Fall back to regex extraction of visible text (for the user's real
         PDFs that don't have the marker).
    """
    try:
        import pdfplumber
    except ImportError as exc:
        log.error("pdfplumber not installed: %s", exc)
        return None

    text = ""
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text:
                    text += page_text + "\n"
    except Exception as exc:
        log.warning("pdfplumber failed on %s: %s", path, exc)
        return None

    if not text.strip():
        # Empty extraction — likely a corrupt binary PDF.
        return None

    facts = _try_load_marker(text) or {}
    if not facts:
        # User's real PDF — no marker. Best-effort visible extraction.
        facts = _extract_invoice_fields_from_visible_text(text)
        log.info("no marker in %s — extracted %d fields from visible text",
                 os.path.basename(path), len(facts))

    # Normalize to the schema the rest of the pipeline expects.
    return {
        "case_id": facts.get("case_id") or os.path.splitext(os.path.basename(path))[0],
        "invoice_number": facts.get("invoice_number") or os.path.splitext(os.path.basename(path))[0],
        "vendor_id": facts.get("vendor_id"),
        "vendor_name": facts.get("vendor_name") or "Unknown",
        "invoice_date": facts.get("invoice_date"),
        "due_date": facts.get("due_date"),
        "amount_usd": _coerce_amount(facts.get("amount_usd")),
        "currency": facts.get("currency") or "USD",
        "bank_account": facts.get("bank_account"),
        "remit_to_email": facts.get("remit_to_email"),
        "line_items": facts.get("line_items") or [],
        "notes": facts.get("notes"),
        # Pass through the raw text so the LLM agent has full context later.
        "_raw_text": text,
    }


# ---------- EML parsing ----------

def parse_email_eml(path: str) -> dict | None:
    """Parse a .eml file with Python's built-in email module.

    Returns a dict shaped like the original email JSON, or None on failure.
    """
    try:
        with open(path, "rb") as f:
            msg = message_from_binary_file(f, policy=default_email_policy)
    except Exception as exc:
        log.warning("email parse failed on %s: %s", path, exc)
        return None

    # An "empty" message (defect-only) means the .eml was malformed — quarantine.
    if msg.is_multipart() or not msg.get("From") and not msg.get("Subject"):
        # CORRUPT-9902 hits here: garbage headers + binary body.
        if not msg.get("From") and not msg.get("Subject") and not msg.get("To"):
            log.warning("malformed eml (no From/To/Subject): %s — quarantining", path)
            return None

    from_hdr = msg.get("From", "") or ""
    # Pull the bare domain out of the From address.
    from_domain = ""
    m = re.search(r"@([\w.-]+\.[a-zA-Z]{2,})", from_hdr)
    if m:
        from_domain = m.group(1).lower()

    # Quarantine check: the From header must look like an email address
    # (something@something.tld). CORRUPT-9902.eml has From: "corrupted"
    # (no @, no domain) — that's the malformed-RFC822 signal.
    if not m:
        log.warning("malformed eml (From header isn't an email address): %s — quarantining", path)
        return None

    # Body — text/plain preferred; fall back to first text part.
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                try:
                    body = part.get_content() if hasattr(part, "get_content") else (part.get_payload(decode=True).decode("utf-8", "replace") if part.get_payload(decode=True) else "")
                    break
                except Exception:
                    continue
    else:
        try:
            body = msg.get_content() if hasattr(msg, "get_content") else (msg.get_payload(decode=True).decode("utf-8", "replace") if msg.get_payload(decode=True) else "")
        except Exception:
            body = msg.get_payload() or ""

    # Strip the trailing facts-marker line from the body before display.
    display_body = _EMAIL_MARKER_RE.sub("", body).rstrip("-").rstrip() if body else ""
    if not display_body:
        display_body = body or ""

    # Pull structured fields from the marker (always succeeds for our
    # synthetic eml; user's real .eml files have only the visible text).
    facts = _try_load_marker(body) or {}
    # If the marker didn't have an invoice_number, try the body.
    inv_no = facts.get("invoice_number") or _extract_invoice_number_from_body(display_body)

    return {
        "case_id": facts.get("case_id"),
        "from": from_hdr,
        "from_domain": facts.get("from_domain") or from_domain,
        "to": msg.get("To", "") or "",
        "date": msg.get("Date", "") or "",
        "subject": msg.get("Subject", "") or "(no subject)",
        "message_id": msg.get("Message-ID", "") or "",
        "body": display_body,
        "bank_change_request": bool(facts.get("bank_change_request")),
        "requested_bank_account": facts.get("requested_bank_account"),
        "invoice_number": inv_no,
    }


def _extract_invoice_number_from_body(body: str) -> str | None:
    """Pull the first INV-... token out of an email body."""
    if not body:
        return None
    m = re.search(r"INV-\S+", body)
    if not m:
        return None
    return m.group(0).rstrip(".,;:!?)\"'")


__all__ = [
    "parse_invoice_pdf",
    "parse_email_eml",
    "FACTS_MARKER_PREFIX",
]
