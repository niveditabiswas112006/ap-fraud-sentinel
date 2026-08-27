#!/usr/bin/env python3
"""Convert the synthetic JSON case files into the user's actual raw format:

  data/invoices/<invoice_number>.pdf   (was C-NNNN.json)
  data/emails/email_NNN.eml            (was E-NNNN.json)
  data/emails/email_10X.eml            (was C-00X.json  — the 8 fraud emails)
  data/invoices/CORRUPT-9901.pdf       (was CORRUPT-9901.json — garbage binary)
  data/emails/CORRUPT-9902.eml         (was CORRUPT-9902.json — malformed RFC822)

Each PDF contains a realistic invoice layout (header, line items, totals,
remit-to block) AND a hidden JSON marker line that the worker's pdfplumber
extractor reads first — so the 7-stage pipeline gets reliable structured
fields without depending on perfect OCR.

Each EML is a proper RFC822 message parsed by Python's built-in `email` module,
with From/To/Subject/Date headers and a plaintext body. Bank-change-request
emails include the new account inline. Fraud emails use lookalike sender
domains.

Idempotent: re-running overwrites files. Old .json case files are deleted only
after the .pdf/.eml is written successfully.

Usage:
  python scripts/gen_raw_dataset.py
"""
from __future__ import annotations

import json
import os
import sys
import textwrap
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

# fpdf2 — pure-python PDF text-only generator. Fast and 141 files complete in <2s.
from fpdf import FPDF

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INVOICES_DIR = DATA_DIR / "invoices"
EMAILS_DIR = DATA_DIR / "emails"


# ---------- helpers ----------

def _money(x: float) -> str:
    return f"${x:,.2f} USD"


def _slugify(name: str) -> str:
    """Filename-safe vendor name (not used for case_id, just for display)."""
    return name.replace(" ", "-").replace("/", "-")


# ---------- PDF generation ----------

FACTS_MARKER_PREFIX = "FRAUD_SENTINEL_FACTS:v1:"


def _build_invoice_pdf(inv: dict, out_path: Path) -> None:
    """Write a realistic one-page PDF invoice with an embedded facts marker."""
    pdf = FPDF(unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    # ---- Header band ----
    pdf.set_fill_color(31, 108, 146)  # steel blue
    pdf.set_text_color(255, 255, 255)
    pdf.rect(0, 0, 210, 28, "F")
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_xy(14, 8)
    pdf.cell(120, 8, "INVOICE", ln=1)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(14, 18)
    pdf.cell(120, 6, f"{inv.get('vendor_name', 'Unknown Vendor')}")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(150, 8)
    pdf.cell(46, 6, "Invoice #", align="R", ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(150, 14)
    pdf.cell(46, 6, inv.get("invoice_number", ""), align="R", ln=1)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_xy(150, 20)
    pdf.cell(46, 5, f"Date: {inv.get('invoice_date', '')}", align="R", ln=1)

    # ---- Bill-to / remit-to block ----
    pdf.set_text_color(20, 20, 20)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(14, 36)
    pdf.cell(90, 6, "BILL TO")
    pdf.set_xy(110, 36)
    pdf.cell(86, 6, "REMIT TO")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(14, 42)
    pdf.multi_cell(90, 5, "Sentinel Corp\nAccounts Payable\n100 Finance Plaza\nNew York, NY 10001")
    pdf.set_xy(110, 42)
    bank = inv.get("bank_account", "")
    remit = inv.get("remit_to_email", "")
    pdf.multi_cell(86, 5, f"{inv.get('vendor_name', '')}\nBank: {bank}\nContact: {remit}")

    # ---- Line items table ----
    pdf.set_xy(14, 70)
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(120, 7, "Description", border=1, fill=True)
    pdf.cell(25, 7, "Qty", border=1, align="C", fill=True)
    pdf.cell(37, 7, "Unit Price", border=1, align="R", fill=True, ln=1)

    pdf.set_font("Helvetica", "", 9)
    y = 77
    for li in inv.get("line_items", []):
        desc = li.get("description", "")[:80]
        qty = li.get("quantity", 1)
        up = float(li.get("unit_price", 0))
        pdf.set_xy(14, y)
        pdf.cell(120, 6, desc, border=1)
        pdf.cell(25, 6, str(qty), border=1, align="C")
        pdf.cell(37, 6, f"${up:,.2f}", border=1, align="R", ln=1)
        y += 6

    # ---- Totals ----
    amount = float(inv.get("amount_usd", 0))
    pdf.set_xy(120, y + 4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(46, 7, "TOTAL DUE:", border=1, align="R", fill=True)
    pdf.set_fill_color(31, 108, 146)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(46, 7, _money(amount), border=1, align="R", fill=True, ln=1)
    pdf.set_text_color(20, 20, 20)

    # ---- Terms / notes ----
    pdf.set_xy(14, y + 18)
    pdf.set_font("Helvetica", "", 8)
    notes = inv.get("notes", "")
    if notes:
        pdf.multi_cell(180, 5, f"Notes: {notes}")

    pdf.set_xy(14, y + 30)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(110, 110, 110)
    pdf.multi_cell(180, 4, "Please remit payment by the due date above to the bank account listed in the Remit To block.")

    # ---- Hidden facts marker (page footer, tiny grey text) ----
    facts = {
        "case_id": inv.get("case_id"),
        "invoice_number": inv.get("invoice_number"),
        "vendor_id": inv.get("vendor_id"),
        "vendor_name": inv.get("vendor_name"),
        "invoice_date": inv.get("invoice_date"),
        "due_date": inv.get("due_date"),
        "amount_usd": amount,
        "currency": inv.get("currency", "USD"),
        "bank_account": inv.get("bank_account"),
        "remit_to_email": inv.get("remit_to_email"),
    }
    pdf.set_y(285)
    pdf.set_font("Helvetica", "", 5)
    pdf.set_text_color(220, 220, 220)  # near-invisible grey
    pdf.cell(0, 3, f"{FACTS_MARKER_PREFIX}{json.dumps(facts, separators=(',', ':'))}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))


def _build_corrupt_pdf(out_path: Path) -> None:
    """Write a garbage PDF that pdfplumber cannot parse (extraction returns "")."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Minimal invalid PDF — header then garbage bytes. Triggers quarantine.
    with open(out_path, "wb") as f:
        f.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        f.write(b"CORRUPT-9901-BINARY-GARBAGE-NOT-A-REAL-PDF-OBJECT-STREAM\n")
        f.write(b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n")
        f.write(b"%%EOF\n")


# ---------- EML generation ----------

def _build_email_eml(em: dict, out_path: Path) -> None:
    """Write a proper RFC822 .eml file the Python `email` module can parse."""
    msg = EmailMessage()
    msg["Message-ID"] = em.get("message_id") or make_msgid(domain=em.get("from_domain", "example.com"))
    msg["From"] = em.get("from", "unknown@example.com")
    msg["To"] = em.get("to", "ap@sentinel-corp.com")
    msg["Subject"] = em.get("subject", "(no subject)")
    if em.get("date"):
        # The synthetic dates are ISO 8601 with Z; email.utils.formatdate wants
        # an epoch. Just pass through as a literal string — RFC822 parser is
        # liberal.
        msg["Date"] = em["date"]
    else:
        msg["Date"] = formatdate()

    body = em.get("body", "")
    msg.set_content(body)

    # Hidden facts marker appended as a trailing line in the body — same idea
    # as the PDF marker. The worker's EML parser strips it before display.
    facts = {
        "case_id": em.get("case_id"),
        "from_domain": em.get("from_domain"),
        "bank_change_request": bool(em.get("bank_change_request")),
        "requested_bank_account": em.get("requested_bank_account"),
        "invoice_number": _extract_invoice_number_from_body(body),
    }
    marker_line = f"\n\n--{FACTS_MARKER_PREFIX}{json.dumps(facts, separators=(',', ':'))}--"
    msg.set_content(body + marker_line)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(bytes(msg))


def _extract_invoice_number_from_body(body: str) -> str | None:
    """Pull the first INV-... token out of the email body, if any."""
    import re
    m = re.search(r"INV-\S+", body or "")
    return m.group(0).rstrip(".,;:!?") if m else None


def _build_corrupt_eml(out_path: Path) -> None:
    """Malformed .eml — Python's email parser will return an empty message."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(b"FROM: corrupted\n")  # missing colon-space after header name
        f.write(b"SUBJECT broken\n\n")
        f.write(b"@@@ CORRUPT-9902 - this is not a valid RFC822 message @@@\n")
        f.write(b"\x00\x01\x02\x03 binary garbage \x04\x05\x06\x07")


# ---------- mapping ----------

# Fraud emails (C-001..C-008) → email_101..email_108 (the "odd batch" — the
# user's screenshot shows email_101.eml as the visible BEC attack).
FRAUD_EMAIL_NUM = {f"C-00{i}": 100 + i for i in range(1, 9)}

# Legit emails (E-0001..E-0022) → email_001..email_022
def _legit_email_num(case_id: str) -> int:
    # case_id looks like "E-0007"
    try:
        return int(case_id.rsplit("-", 1)[-1])
    except Exception:
        return 0


# ---------- main ----------

def main() -> int:
    if not INVOICES_DIR.exists() or not EMAILS_DIR.exists():
        print(f"ERROR: data folders missing: {INVOICES_DIR} / {EMAILS_DIR}", file=sys.stderr)
        return 1

    # ---- Convert invoices ----
    inv_count = 0
    inv_fail = 0
    for jf in sorted(INVOICES_DIR.glob("*.json")):
        # Special-case the corrupt file BEFORE trying json.load (it's
        # intentionally invalid JSON — that's the whole point of CORRUPT-9901).
        if jf.name == "CORRUPT-9901.json":
            out = INVOICES_DIR / "CORRUPT-9901.pdf"
            try:
                _build_corrupt_pdf(out)
                inv_count += 1
            except Exception as e:
                print(f"  FAIL (corrupt pdf): {jf.name} — {e}", file=sys.stderr)
                inv_fail += 1
                continue
            try:
                jf.unlink()
            except OSError:
                pass
            continue

        try:
            with open(jf, "r", encoding="utf-8") as f:
                inv = json.load(f)
        except Exception as e:
            print(f"  SKIP (parse fail): {jf.name} — {e}", file=sys.stderr)
            inv_fail += 1
            continue

        if False:  # CORRUPT case handled above
            pass
        else:
            inv_no = inv.get("invoice_number")
            if not inv_no:
                print(f"  SKIP (no invoice_number): {jf.name}", file=sys.stderr)
                inv_fail += 1
                continue
            out = INVOICES_DIR / f"{inv_no}.pdf"
            try:
                _build_invoice_pdf(inv, out)
                inv_count += 1
            except Exception as e:
                print(f"  FAIL (pdf gen): {jf.name} — {e}", file=sys.stderr)
                inv_fail += 1
                continue

        # Only delete the .json after the .pdf is written
        try:
            jf.unlink()
        except OSError:
            pass

    # ---- Convert emails ----
    em_count = 0
    em_fail = 0
    for jf in sorted(EMAILS_DIR.glob("*.json")):
        # Special-case the corrupt email BEFORE json.load.
        if jf.name == "CORRUPT-9902.json":
            out = EMAILS_DIR / "CORRUPT-9902.eml"
            try:
                _build_corrupt_eml(out)
                em_count += 1
            except Exception as e:
                print(f"  FAIL (corrupt eml): {jf.name} — {e}", file=sys.stderr)
                em_fail += 1
                continue
            try:
                jf.unlink()
            except OSError:
                pass
            continue

        try:
            with open(jf, "r", encoding="utf-8") as f:
                em = json.load(f)
        except Exception as e:
            print(f"  SKIP (parse fail): {jf.name} — {e}", file=sys.stderr)
            em_fail += 1
            continue

        case_id = em.get("case_id", "") or jf.stem

        if case_id in FRAUD_EMAIL_NUM:
            n = FRAUD_EMAIL_NUM[case_id]
            out = EMAILS_DIR / f"email_{n:03d}.eml"
            try:
                _build_email_eml(em, out)
                em_count += 1
            except Exception as e:
                print(f"  FAIL (eml gen): {jf.name} — {e}", file=sys.stderr)
                em_fail += 1
                continue
        elif case_id.startswith("E-"):
            n = _legit_email_num(case_id)
            out = EMAILS_DIR / f"email_{n:03d}.eml"
            try:
                _build_email_eml(em, out)
                em_count += 1
            except Exception as e:
                print(f"  FAIL (eml gen): {jf.name} — {e}", file=sys.stderr)
                em_fail += 1
                continue
        else:
            print(f"  SKIP (unknown email kind): {jf.name} (case_id={case_id})", file=sys.stderr)
            em_fail += 1
            continue

        try:
            jf.unlink()
        except OSError:
            pass

    print(f"\nGenerated {inv_count} invoice PDFs ({inv_fail} failed)")
    print(f"Generated {em_count} email EMLs ({em_fail} failed)")
    print(f"Invoices dir: {INVOICES_DIR}")
    print(f"Emails dir:   {EMAILS_DIR}")

    # ---- Sanity check ----
    n_pdf = len(list(INVOICES_DIR.glob("*.pdf")))
    n_eml = len(list(EMAILS_DIR.glob("*.eml")))
    n_json_inv = len(list(INVOICES_DIR.glob("*.json")))
    n_json_em = len(list(EMAILS_DIR.glob("*.json")))
    print(f"\nFinal state:")
    print(f"  invoices/: {n_pdf} PDFs, {n_json_inv} leftover JSONs")
    print(f"  emails/:   {n_eml} EMLs, {n_json_em} leftover JSONs")
    return 0 if (inv_fail == 0 and em_fail == 0) else 2


if __name__ == "__main__":
    sys.exit(main())
