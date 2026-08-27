"""worker.db — sqlite3 helpers for the AP Payment Fraud Sentinel worker.

Single connection, thread-safe via a global lock. All writes commit. Reads
return dicts with camelCase column names (matching the Prisma schema).

IMPORTANT: `Case.factsJson`, `signalsJson`, `evidencePackJson` are TEXT columns
holding JSON strings. The worker writes `json.dumps(...)` into them.

Tables (verified against prisma/schema.prisma):
  Vendor: vendorId, legalName, registeredDomain, knownPhone, knownBankAccount,
          bankAccountAddedDate, firstInvoiceDate, address, contactEmail, taxId
  PaymentHistory: id, paymentId, vendorId, invoiceNumber, paidDate, amountUsd, currencyOriginal
  FraudGroundTruth: id, caseId, invoiceNumber, fraudType, isFraud, expectedSignal
  Case: caseId, runId, vendorId, vendorName, invoiceNumber, sourcePath, kind,
        status, amountUsd, currency, invoiceDate, dueDate, senderDomain,
        bankChangeRequestDate, requestedBankAccount, emailBody, factsJson,
        signalsJson, riskScore, recommendation, evidencePackJson, narrative,
        callTranscript, callAudioUrl, verificationResult, decision, approver,
        decisionReason, decisionAt, fraudType, isFraud, createdAt, updatedAt
  Decision: id, caseId, approver, decision, reason, timestamp
  Run: runId, startedAt, endedAt, status, casesProcessed, casesHeld,
       fraudCaught, amountSavedUsd, signalsCostUsd, llmCostUsd, callCostUsd,
       totalUsd, durationS
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from typing import Any, Iterable, Mapping

# Project root = parent of the worker/ package (portable across machines).
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get(
    "APFRAUD_DB_PATH", os.path.join(_PROJECT_ROOT, "db", "custom.db")
)

log = logging.getLogger("worker.db")

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        # check_same_thread=False — we manage our own lock.
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA foreign_keys = ON;")
    return _conn


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def _rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict]:
    return [{k: r[k] for k in r.keys()} for r in rows]


# ---------- READS ----------

def get_vendor(vendor_id: str) -> dict | None:
    """Look up a vendor by vendorId (exact). Returns the row as a dict."""
    if not vendor_id:
        return None
    with _lock:
        cur = _get_conn().execute("SELECT * FROM Vendor WHERE vendorId = ?", (vendor_id,))
        return _row_to_dict(cur.fetchone())


def find_vendor_by_name(name: str) -> dict | None:
    """Fuzzy lookup by legalName (contains). Used when vendor_id is unknown."""
    if not name:
        return None
    with _lock:
        cur = _get_conn().execute(
            "SELECT * FROM Vendor WHERE legalName LIKE ? LIMIT 1",
            (f"%{name}%",),
        )
        return _row_to_dict(cur.fetchone())


def get_payment_history(vendor_id: str, limit: int = 50) -> list[dict]:
    """Fetch up to `limit` most recent payment rows for a vendor."""
    if not vendor_id:
        return []
    with _lock:
        cur = _get_conn().execute(
            "SELECT * FROM PaymentHistory WHERE vendorId = ? ORDER BY paidDate DESC LIMIT ?",
            (vendor_id, limit),
        )
        return _rows_to_dicts(cur.fetchall())


def get_ground_truth() -> list[dict]:
    with _lock:
        cur = _get_conn().execute("SELECT * FROM FraudGroundTruth")
        return _rows_to_dicts(cur.fetchall())


def get_ground_truth_for_case(case_id: str, invoice_number: str | None = None) -> dict | None:
    """Look up the ground-truth row for a case (for scoring display only)."""
    with _lock:
        cur = _get_conn().execute(
            "SELECT * FROM FraudGroundTruth WHERE caseId = ? OR invoiceNumber = ? LIMIT 1",
            (case_id, invoice_number or case_id),
        )
        return _row_to_dict(cur.fetchone())


def find_duplicate_payments(vendor_id: str | None, invoice_number: str | None, amount: float) -> dict:
    """Check payment_history for a matching invoice_number OR (vendor_id + same amount).

    Returns {"count": int, "matched_by": str|None}.
    Mirrors the duplicate_check SQL in pipelines/04_signals.pipe.
    """
    with _lock:
        conn = _get_conn()
        # Match by invoice_number first.
        if invoice_number:
            cur = conn.execute(
                "SELECT COUNT(*) AS n FROM PaymentHistory WHERE invoiceNumber = ?",
                (invoice_number,),
            )
            n_inv = cur.fetchone()["n"]
            if n_inv > 0:
                return {"count": n_inv, "matched_by": "invoice_number"}
        # Then by (vendor_id + amount).
        if vendor_id and amount:
            cur = conn.execute(
                "SELECT COUNT(*) AS n FROM PaymentHistory WHERE vendorId = ? AND amountUsd = ?",
                (vendor_id, amount),
            )
            n_amt = cur.fetchone()["n"]
            if n_amt > 0:
                return {"count": n_amt, "matched_by": "amount"}
        return {"count": 0, "matched_by": None}


def get_case(case_id: str) -> dict | None:
    with _lock:
        cur = _get_conn().execute('SELECT * FROM "Case" WHERE caseId = ?', (case_id,))
        return _row_to_dict(cur.fetchone())


def list_cases(limit: int = 100, status: str | None = None, run_id: str | None = None) -> list[dict]:
    """List cases, optionally filtered by status / runId."""
    clauses = []
    params: list[Any] = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if run_id:
        clauses.append("runId = ?")
        params.append(run_id)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f'SELECT * FROM "Case" {where} ORDER BY createdAt DESC LIMIT ?'
    params.append(limit)
    with _lock:
        cur = _get_conn().execute(sql, params)
        return _rows_to_dicts(cur.fetchall())


def get_run(run_id: str) -> dict | None:
    with _lock:
        cur = _get_conn().execute("SELECT * FROM Run WHERE runId = ?", (run_id,))
        return _row_to_dict(cur.fetchone())


def db_counts() -> dict:
    """Return counts of each major table — used for the /healthz startup log."""
    with _lock:
        conn = _get_conn()
        out = {}
        for table in ("Vendor", "PaymentHistory", "FraudGroundTruth", "Case", "Decision", "Run"):
            try:
                cur = conn.execute(f'SELECT COUNT(*) AS n FROM "{table}"')
                out[table] = cur.fetchone()["n"]
            except sqlite3.Error:
                out[table] = None
        return out


# ---------- WRITES ----------

def insert_case(case: Mapping[str, Any]) -> None:
    """Upsert a Case row (INSERT ... ON CONFLICT(caseId) DO UPDATE).

    Using an upsert (not plain INSERT, not INSERT OR REPLACE) means:
      - Re-runs don't hit the caseId UNIQUE constraint.
      - The existing row is UPDATEd in place (no DELETE), so child Decision
        rows (FK Decision.caseId → Case.caseId) are NOT cascade-removed and
        there's no FOREIGN KEY constraint failure.
    Overlapping runs simply overwrite each other's rows for the same caseId —
    the last writer wins, which is fine since the pipeline is deterministic.
    """
    with _lock:
        conn = _get_conn()
        conn.execute(
            """
            INSERT INTO "Case" (
              caseId, runId, vendorId, vendorName, invoiceNumber, sourcePath,
              kind, status, amountUsd, currency, invoiceDate, dueDate,
              senderDomain, bankChangeRequestDate, requestedBankAccount,
              emailBody, factsJson, signalsJson, riskScore, recommendation,
              evidencePackJson, narrative, callTranscript, callAudioUrl,
              verificationResult, decision, approver, decisionReason,
              decisionAt, fraudType, isFraud
            ) VALUES (
              :caseId, :runId, :vendorId, :vendorName, :invoiceNumber, :sourcePath,
              :kind, :status, :amountUsd, :currency, :invoiceDate, :dueDate,
              :senderDomain, :bankChangeRequestDate, :requestedBankAccount,
              :emailBody, :factsJson, :signalsJson, :riskScore, :recommendation,
              :evidencePackJson, :narrative, :callTranscript, :callAudioUrl,
              :verificationResult, :decision, :approver, :decisionReason,
              :decisionAt, :fraudType, :isFraud
            )
            ON CONFLICT(caseId) DO UPDATE SET
              runId = excluded.runId,
              vendorId = excluded.vendorId,
              vendorName = excluded.vendorName,
              invoiceNumber = excluded.invoiceNumber,
              sourcePath = excluded.sourcePath,
              kind = excluded.kind,
              status = excluded.status,
              amountUsd = excluded.amountUsd,
              currency = excluded.currency,
              invoiceDate = excluded.invoiceDate,
              dueDate = excluded.dueDate,
              senderDomain = excluded.senderDomain,
              bankChangeRequestDate = excluded.bankChangeRequestDate,
              requestedBankAccount = excluded.requestedBankAccount,
              emailBody = excluded.emailBody,
              factsJson = excluded.factsJson,
              signalsJson = excluded.signalsJson,
              riskScore = excluded.riskScore,
              recommendation = excluded.recommendation,
              evidencePackJson = excluded.evidencePackJson,
              narrative = excluded.narrative,
              callTranscript = excluded.callTranscript,
              callAudioUrl = excluded.callAudioUrl,
              verificationResult = excluded.verificationResult,
              fraudType = excluded.fraudType,
              isFraud = excluded.isFraud
            """,
            {
                "caseId": case.get("caseId"),
                "runId": case.get("runId"),
                "vendorId": case.get("vendorId"),
                "vendorName": case.get("vendorName") or "Unknown",
                "invoiceNumber": case.get("invoiceNumber") or "",
                "sourcePath": case.get("sourcePath") or "",
                "kind": case.get("kind") or "invoice",
                "status": case.get("status") or "queued",
                "amountUsd": float(case.get("amountUsd") or 0.0),
                "currency": case.get("currency") or "USD",
                "invoiceDate": case.get("invoiceDate"),
                "dueDate": case.get("dueDate"),
                "senderDomain": case.get("senderDomain"),
                "bankChangeRequestDate": case.get("bankChangeRequestDate"),
                "requestedBankAccount": case.get("requestedBankAccount"),
                "emailBody": case.get("emailBody"),
                "factsJson": case.get("factsJson") or "{}",
                "signalsJson": case.get("signalsJson") or "[]",
                "riskScore": float(case.get("riskScore") or 0.0),
                "recommendation": case.get("recommendation"),
                "evidencePackJson": case.get("evidencePackJson") or "{}",
                "narrative": case.get("narrative"),
                "callTranscript": case.get("callTranscript"),
                "callAudioUrl": case.get("callAudioUrl"),
                "verificationResult": case.get("verificationResult"),
                "decision": case.get("decision"),
                "approver": case.get("approver"),
                "decisionReason": case.get("decisionReason"),
                "decisionAt": case.get("decisionAt"),
                "fraudType": case.get("fraudType"),
                "isFraud": 1 if case.get("isFraud") else 0,
            },
        )
        conn.commit()


def update_case(case_id: str, **fields: Any) -> None:
    """Update one or more columns on a Case row. Always bumps updatedAt.

    JSON-able fields (factsJson, signalsJson, evidencePackJson) should be
    passed already as JSON strings — use json.dumps(...) before calling.
    """
    if not fields:
        return
    # Always bump updatedAt so the dashboard polling sees fresh data.
    fields = {**fields, "updatedAt": "datetime('now')"}
    # Build SET clause. updatedAt uses the SQLite function directly (no bind).
    set_parts = []
    params: list[Any] = []
    for col, val in fields.items():
        if val == "datetime('now')":
            set_parts.append(f"{col} = datetime('now')")
        else:
            set_parts.append(f"{col} = ?")
            params.append(val)
    sql = f'UPDATE "Case" SET {", ".join(set_parts)} WHERE caseId = ?'
    params.append(case_id)
    with _lock:
        conn = _get_conn()
        conn.execute(sql, params)
        conn.commit()


def insert_decision(case_id: str, approver: str, decision: str, reason: str) -> None:
    """Insert a Decision row + close the Case. Used by the Stage 07 gate path."""
    with _lock:
        conn = _get_conn()
        conn.execute(
            """
            INSERT INTO Decision (caseId, approver, decision, reason, timestamp)
            VALUES (?, ?, ?, ?, datetime('now'))
            """,
            (case_id, approver, decision, reason),
        )
        conn.execute(
            """
            UPDATE "Case" SET
              decision = ?,
              approver = ?,
              decisionReason = ?,
              decisionAt = datetime('now'),
              status = 'closed',
              updatedAt = datetime('now')
            WHERE caseId = ?
            """,
            (decision, approver, reason, case_id),
        )
        conn.commit()


def insert_run(run_id: str, started_at: str, status: str = "running") -> None:
    with _lock:
        conn = _get_conn()
        conn.execute(
            """
            INSERT INTO Run (runId, startedAt, status)
            VALUES (?, ?, ?)
            ON CONFLICT(runId) DO UPDATE SET startedAt = excluded.startedAt, status = excluded.status
            """,
            (run_id, started_at, status),
        )
        conn.commit()


def clear_runtime_tables() -> None:
    """Wipe the Case + Decision rows so a fresh batch run can INSERT without
    hitting the caseId UNIQUE constraint. Run rows are preserved (the Runs page
    shows history). Decision must be deleted before Case (FK Decision→Case).
    Vendor/PaymentHistory/FraudGroundTruth are the static seed — never touched.
    """
    with _lock:
        conn = _get_conn()
        # FK off briefly so order doesn't matter; SQLite enforces FKs only if
        # PRAGMA foreign_keys=ON, which the worker doesn't set, but be safe.
        conn.execute("DELETE FROM Decision")
        conn.execute('DELETE FROM "Case"')
        conn.commit()


def update_run(run_id: str, **fields: Any) -> None:
    if not fields:
        return
    set_parts = []
    params: list[Any] = []
    for col, val in fields.items():
        if val == "datetime('now')":
            set_parts.append(f"{col} = datetime('now')")
        else:
            set_parts.append(f"{col} = ?")
            params.append(val)
    sql = f'UPDATE Run SET {", ".join(set_parts)} WHERE runId = ?'
    params.append(run_id)
    with _lock:
        conn = _get_conn()
        conn.execute(sql, params)
        conn.commit()


def reload_reference_csvs(data_dir: str | None = None) -> dict:
    """Re-import the three reference CSVs from `data_dir` into the DB.

    Wipes Vendor / PaymentHistory / FraudGroundTruth tables and re-inserts
    from `vendor_master.csv`, `payment_history.csv`, `fraud_ground_truth.csv`.
    Does NOT touch Case / Decision / Run (the runtime tables) — those are
    wiped separately by `clear_runtime_tables()` at the start of each batch.

    Called by the upload API when the user uploads their own reference CSVs
    from their PC, so the vendor master + payment history the pipeline
    grounds against reflects the user's actual dataset, not the synthetic
    seed.

    Returns {"vendors": N, "payments": N, "ground_truth": N} — the row counts
    inserted. Missing CSVs are skipped silently (so the user can upload just
    a vendor_master.csv without touching payment_history).
    """
    import csv as _csv

    if data_dir is None:
        data_dir = os.environ.get(
            "APFRAUD_DATA_DIR", os.path.join(_PROJECT_ROOT, "data")
        )

    vendor_csv = os.path.join(data_dir, "vendor_master.csv")
    payment_csv = os.path.join(data_dir, "payment_history.csv")
    gt_csv = os.path.join(data_dir, "fraud_ground_truth.csv")

    def _bool(s: str) -> int:
        return 1 if (s or "").strip().lower() in ("true", "1", "yes", "t") else 0

    with _lock:
        conn = _get_conn()
        # Disable FK enforcement during the wipe+insert so order doesn't matter
        # (mirrors scripts/seed_db.py — PaymentHistory references Vendor).
        conn.execute("PRAGMA foreign_keys = OFF;")
        conn.execute("DELETE FROM PaymentHistory;")
        conn.execute("DELETE FROM Vendor;")
        conn.execute("DELETE FROM FraudGroundTruth;")

        n_v = n_p = n_g = 0
        if os.path.exists(vendor_csv):
            with open(vendor_csv, newline="", encoding="utf-8") as f:
                rows = list(_csv.DictReader(f))
            if rows:
                conn.executemany(
                    """INSERT INTO Vendor
                       (vendorId, legalName, registeredDomain, knownPhone,
                        knownBankAccount, bankAccountAddedDate, firstInvoiceDate,
                        address, contactEmail, taxId)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    [
                        (
                            r["vendorId"], r["legalName"], r["registeredDomain"],
                            r["knownPhone"], r["knownBankAccount"],
                            r["bankAccountAddedDate"], r["firstInvoiceDate"],
                            r["address"], r["contactEmail"], r["taxId"],
                        )
                        for r in rows
                    ],
                )
                n_v = len(rows)

        if os.path.exists(payment_csv):
            with open(payment_csv, newline="", encoding="utf-8") as f:
                rows = list(_csv.DictReader(f))
            if rows:
                conn.executemany(
                    """INSERT INTO PaymentHistory
                       (paymentId, vendorId, invoiceNumber, paidDate, amountUsd,
                        currencyOriginal)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    [
                        (
                            r["paymentId"], r["vendorId"], r["invoiceNumber"],
                            r["paidDate"], float(r["amountUsd"] or 0),
                            r["currencyOriginal"],
                        )
                        for r in rows
                    ],
                )
                n_p = len(rows)

        if os.path.exists(gt_csv):
            with open(gt_csv, newline="", encoding="utf-8") as f:
                rows = list(_csv.DictReader(f))
            if rows:
                conn.executemany(
                    """INSERT INTO FraudGroundTruth
                       (caseId, invoiceNumber, fraudType, isFraud, expectedSignal)
                       VALUES (?, ?, ?, ?, ?)""",
                    [
                        (
                            r["caseId"], r["invoiceNumber"], r["fraudType"],
                            _bool(r["isFraud"]), r["expectedSignal"],
                        )
                        for r in rows
                    ],
                )
                n_g = len(rows)

        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON;")

    log.info("reference CSVs reloaded: vendors=%d payments=%d ground_truth=%d", n_v, n_p, n_g)
    return {"vendors": n_v, "payments": n_p, "ground_truth": n_g}


def dump_json(value: Any) -> str:
    """Helper: json.dumps with sort_keys for deterministic storage."""
    return json.dumps(value, sort_keys=True, default=str)


__all__ = [
    "DB_PATH",
    "get_vendor",
    "find_vendor_by_name",
    "get_payment_history",
    "get_ground_truth",
    "get_ground_truth_for_case",
    "find_duplicate_payments",
    "get_case",
    "list_cases",
    "get_run",
    "db_counts",
    "insert_case",
    "update_case",
    "insert_decision",
    "insert_run",
    "update_run",
    "dump_json",
    "reload_reference_csvs",
]
