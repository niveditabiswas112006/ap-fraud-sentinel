# Synthetic AP Fraud Dataset

Reproducible synthetic dataset for the AP Payment Fraud Sentinel project.

- Seed: **42** (deterministic — same seed produces byte-identical output)
- Vendor master: 60 rows (`vendor_master.csv`)
- Payment history: 480 rows, ~8 per vendor, 2-year span 2024-04 to 2026-07 (`payment_history.csv`)
- Fraud ground truth: 10 rows — 8 invoice plants (C-001..C-008), 1 corrupt invoice (C-009, `CORRUPT-9901.json`), 1 corrupt email (C-010, `CORRUPT-9902.json`) (`fraud_ground_truth.csv`)
- Invoices: `invoices/*.json` — 132 legit + 8 fraud plants + 1 corrupt file
- Emails: `emails/*.json` — 22 legit + 8 fraud plants + 1 corrupt file

## Regenerate

```
python scripts/gen_dataset.py --seed 42 --out data/
```

## Load into SQLite

```
python scripts/seed_db.py
```

## Notes

- 100% synthetic. No real PII, no real banking details, no real domains.
  Safe to commit and share.
- V-001 = Acme Industrial Supply (BEC showstopper target).
- V-012 = Juniper Components Inc (account-takeover target).
- V-050 = York Manufacturing Co (first-time vendor; no payment history).
- Two intentionally corrupt files (`CORRUPT-9901.json`, `CORRUPT-9902.json`)
  are NOT valid JSON — the extraction stage should catch and quarantine them.
