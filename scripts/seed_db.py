#!/usr/bin/env python3
"""Load the synthetic AP fraud dataset CSVs into the SQLite database.

Wipes Vendor / PaymentHistory / FraudGroundTruth tables first (these are the
dataset tables only — runtime tables Case / Decision / Run are left untouched).
Then inserts all rows from data/*.csv. Uses raw sqlite3 (not Prisma) to avoid
schema/client drift.

Usage:  python scripts/seed_db.py
"""
import csv
import os
import sqlite3
import sys

# Resolve paths relative to the project root so the script works from anywhere.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "db", "custom.db")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")


def wipe_dataset_tables(cur):
    """Delete all rows from the three dataset tables (idempotent reset)."""
    # Order matters for FK cleanliness, though SQLite FK enforcement is off
    # by default — wipe PaymentHistory first (it references Vendor), then
    # the rest. Do NOT touch Case / Decision / Run.
    cur.execute("DELETE FROM PaymentHistory;")
    cur.execute("DELETE FROM Vendor;")
    cur.execute("DELETE FROM FraudGroundTruth;")


def insert_vendors(cur, path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = list(r)
    cur.executemany(
        """INSERT INTO Vendor
           (vendorId, legalName, registeredDomain, knownPhone, knownBankAccount,
            bankAccountAddedDate, firstInvoiceDate, address, contactEmail, taxId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                row["vendorId"], row["legalName"], row["registeredDomain"],
                row["knownPhone"], row["knownBankAccount"],
                row["bankAccountAddedDate"], row["firstInvoiceDate"],
                row["address"], row["contactEmail"], row["taxId"],
            )
            for row in rows
        ],
    )
    return len(rows)


def insert_payments(cur, path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = list(r)
    # id is autoincrement; insert paymentId/vendorId/invoiceNumber/paidDate/amountUsd/currencyOriginal.
    cur.executemany(
        """INSERT INTO PaymentHistory
           (paymentId, vendorId, invoiceNumber, paidDate, amountUsd, currencyOriginal)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [
            (
                row["paymentId"], row["vendorId"], row["invoiceNumber"],
                row["paidDate"], float(row["amountUsd"]), row["currencyOriginal"],
            )
            for row in rows
        ],
    )
    return len(rows)


def insert_ground_truth(cur, path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = list(r)

    def _bool(s):
        return s.strip().lower() in ("true", "1", "yes", "t")

    cur.executemany(
        """INSERT INTO FraudGroundTruth
           (caseId, invoiceNumber, fraudType, isFraud, expectedSignal)
           VALUES (?, ?, ?, ?, ?)""",
        [
            (
                row["caseId"], row["invoiceNumber"], row["fraudType"],
                _bool(row["isFraud"]), row["expectedSignal"],
            )
            for row in rows
        ],
    )
    return len(rows)


def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: DB not found at {DB_PATH}. Run `bun run db:push` first.",
              file=sys.stderr)
        sys.exit(1)

    vendor_csv = os.path.join(DATA_DIR, "vendor_master.csv")
    payment_csv = os.path.join(DATA_DIR, "payment_history.csv")
    gt_csv = os.path.join(DATA_DIR, "fraud_ground_truth.csv")
    for p in (vendor_csv, payment_csv, gt_csv):
        if not os.path.exists(p):
            print(f"ERROR: {p} not found. Run gen_dataset.py first.", file=sys.stderr)
            sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        # Disable FK enforcement during the wipe+insert so order doesn't matter.
        cur.execute("PRAGMA foreign_keys = OFF;")
        wipe_dataset_tables(cur)
        n_v = insert_vendors(cur, vendor_csv)
        n_p = insert_payments(cur, payment_csv)
        n_g = insert_ground_truth(cur, gt_csv)
        conn.commit()
        # Re-enable FKs for any subsequent connection.
        cur.execute("PRAGMA foreign_keys = ON;")
    finally:
        conn.close()

    print(f"Vendors: {n_v}, Payments: {n_p}, Ground truth: {n_g}. Done.")


if __name__ == "__main__":
    main()
