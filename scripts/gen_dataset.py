#!/usr/bin/env python3
"""Reproducible synthetic AP fraud dataset generator (seed=42).

Produces a byte-identical dataset on every run with the same seed.
Outputs to <out>/:
  vendor_master.csv      (60 rows)
  payment_history.csv     (480 rows, ~8 per vendor, 2yr history)
  fraud_ground_truth.csv  (10 rows: 8 invoice plants + 2 corrupt files)
  invoices/*.json         (141 JSON documents: 132 legit + 8 fraud + 1 corrupt)
  emails/*.json           (31 JSON documents: 22 legit + 8 fraud + 1 corrupt)
  README.md

Usage:
  python scripts/gen_dataset.py --seed 42 --out data/
"""
import argparse
import csv
import json
import os
import random
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# 60 vendor names. Positions are fixed: V-001 (BEC target), V-012 (account
# takeover), V-025 (duplicate invoice fraud target), V-030 (original dup
# payment), V-035 (INV-8812), V-040 (threshold skirting), V-045 (INV-8812B),
# V-050 (first-time vendor).
# ---------------------------------------------------------------------------
VENDOR_NAMES = [
    "Acme Industrial Supply",          # V-001  BEC showstopper
    "Apex Steel Manufacturing",         # V-002
    "Atlas Logistics Group",            # V-003
    "Beacon Fabrication Co",            # V-004
    "Caldera Components Inc",           # V-005
    "Delta Engineering Systems",        # V-006
    "Eagle Materials Holdings",         # V-007
    "Falcon Manufacturing LLC",         # V-008
    "Granite Industrial Supply",        # V-009
    "Harbor Logistics Partners",         # V-010
    "Iron Mountain Steel",              # V-011
    "Juniper Components Inc",           # V-012  account takeover
    "Kestrel Engineering Co",           # V-013
    "Lonestar Manufacturing Group",     # V-014
    "Meridian Industrial Supply",       # V-015
    "Northwind Logistics Inc",          # V-016
    "Orion Steel Holdings",             # V-017
    "Pinnacle Fabrication Co",           # V-018
    "Quantum Components LLC",            # V-019
    "Redwood Engineering Systems",      # V-020
    "Sterling Manufacturing Group",     # V-021
    "Trident Industrial Supply",        # V-022
    "Ultramax Logistics Co",            # V-023
    "Vanguard Steel Inc",               # V-024
    "Lakeside Components Supply",       # V-025  duplicate invoice fraud
    "Magnolia Engineering Systems",     # V-026
    "Northgate Manufacturing Inc",      # V-027
    "Oak Ridge Steel Holdings",         # V-028
    "Pinecrest Logistics Partners",     # V-029
    "Quartz Fabrication Group",         # V-030  original dup payment
    "Ridgeline Industrial Supply",      # V-031
    "Silverlake Components Co",         # V-032
    "Thornwood Manufacturing LLC",      # V-033
    "Underhill Engineering Inc",        # V-034
    "Valley Forge Steel Systems",       # V-035  INV-8812
    "Westmark Industrial Supply",       # V-036
    "Xander Logistics Group",            # V-037
    "Amber Creek Industrial",           # V-038
    "Bluegrass Manufacturing",          # V-039
    "Copper Ridge Engineering",         # V-040  threshold skirting
    "Dawson Logistics Supply",          # V-041
    "Elmside Fabrication Co",           # V-042
    "Foothill Steel Systems",           # V-043
    "Greystone Industrial Inc",         # V-044
    "Highmark Components Group",        # V-045  INV-8812B
    "Ironclad Manufacturing Holdings",  # V-046
    "Brookside Industrial Supply",      # V-047
    "Cedar Logistics Partners",        # V-048
    "Drake Manufacturing Co",           # V-049
    "York Manufacturing Co",           # V-050  first-time vendor
    "Eastside Fabrication Inc",         # V-051
    "Forest Hill Components",           # V-052
    "Glacier Steel Systems",            # V-053
    "Highland Engineering Group",       # V-054
    "Island Logistics Holdings",        # V-055
    "Jasper Manufacturing LLC",        # V-056
    "Kensington Industrial Co",         # V-057
    "Midland Steel Supply",             # V-058
    "Northvale Industrial Co",          # V-059
    "Zenith Engineering Holdings",      # V-060
]

assert len(VENDOR_NAMES) == 60

# US cities for fake addresses (state, zip-base).
US_CITIES = [
    ("Springfield", "IL", "62701"),
    ("Columbus", "OH", "43215"),
    ("Austin", "TX", "73301"),
    ("Denver", "CO", "80202"),
    ("Phoenix", "AZ", "85001"),
    ("Charlotte", "NC", "28201"),
    ("Portland", "OR", "97201"),
    ("Nashville", "TN", "37201"),
    ("Raleigh", "NC", "27601"),
    ("Madison", "WI", "53703"),
]

STREET_NAMES = [
    "Industrial Pkwy", "Manufacturing Way", "Commerce Blvd",
    "Logistics Ln", "Steel Dr", "Components Cir",
    "Engineering Ct", "Supply Rd", "Foundry Ave", "Harbor St",
]

# Special per-vendor payment means (used by the fraud-plant logic).
# Other vendors draw their mean uniformly from [$2_000, $30_000].
SPECIAL_MEANS = {
    "V-001": 8500.0,    # BEC: 5.2x = $44,200
    "V-012": 12000.0,   # account takeover: normal amount
    "V-025": 5000.0,    # duplicate fraud: 30% above = $6,500
    "V-030": 6000.0,    # original dup payment of $5,000 sits within range
    "V-035": 4500.0,    # INV-8812 = $4,500
    "V-040": 9000.0,    # threshold skirting = $9,950 (just under $10K)
    "V-045": 4500.0,    # INV-8812B = $4,500
    "V-050": 7000.0,    # first-time vendor (no history; only used for invoice)
}

# Vendor count extras: V-052..V-059 get 9 payments, others get 8, V-050 gets 0.
# 51 vendors x 8 + 8 vendors x 9 + V-050 x 0 = 408 + 72 = 480.
VENDORS_WITH_EXTRA_PAYMENT = {f"V-{i:03d}" for i in range(52, 60)}  # V-052..V-059

# ---------------------------------------------------------------------------
# Fraud invoice specs. The 8 planted invoice documents.
# Case ids C-001..C-008 correspond 1:1 to ground-truth rows.
#
# Note on INV-2026-4410 amount: the prompt says "5.2× the vendor's historical
# mean". The historical mean is the *sample* mean of V-001's payment history,
# which is itself randomly drawn. We patch the amount at runtime (see main())
# after payments are generated so it stays consistent with what's in the DB.
# ---------------------------------------------------------------------------
FRAUD_INVOICES = [
    {
        "case_id": "C-001",
        "invoice_number": "INV-2026-4410",
        "vendor_id": "V-001",
        "vendor_name": "Acme Industrial Supply",
        "invoice_date": "2026-06-10",
        "due_date": "2026-07-10",
        "amount_usd": 44200.00,           # placeholder; patched to 5.2x mean in main()
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 9999 8888 77",  # NEW account (not V-001 known)
        "remit_to_email": "ap@acme-industria1.com",     # lookalike domain
        "line_items": [
            {"description": "Industrial pumps (bulk)", "quantity": 50, "unit_price": 884.00}
        ],
        "notes": "URGENT: Bank details updated. Please wire today.",
    },
    {
        "case_id": "C-002",
        "invoice_number": "INV-2026-1088",
        "vendor_id": "V-FAKE-001",        # not in master
        "vendor_name": "New Horizon Logistics",  # not in master
        "invoice_date": "2026-04-15",
        "due_date": "2026-05-15",
        "amount_usd": 9200.00,
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 9999 0002 02",
        "remit_to_email": "billing@newhorizon-logistics.com",
        "line_items": [
            {"description": "Logistics services Q2", "quantity": 1, "unit_price": 9200.00}
        ],
        "notes": "First invoice. Please process urgently.",
    },
    {
        "case_id": "C-003",
        "invoice_number": "INV-2026-1091",  # duplicate of an existing payment_history entry
        "vendor_id": "V-025",              # different from original (V-030)
        "vendor_name": "Lakeside Components Supply",
        "invoice_date": "2026-05-20",
        "due_date": "2026-06-19",
        "amount_usd": 6500.00,             # 30% above the original $5,000
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 0025 0025 25",
        "remit_to_email": "ap@lakeside-componentsuply.com",  # lookalike
        "line_items": [
            {"description": "Components batch B-209", "quantity": 100, "unit_price": 65.00}
        ],
        "notes": "Revised invoice. Please process immediately.",
    },
    {
        "case_id": "C-004",
        "invoice_number": "INV-2026-1195",
        "vendor_id": "V-040",
        "vendor_name": "Copper Ridge Engineering",
        "invoice_date": "2026-07-01",
        "due_date": "2026-07-31",
        "amount_usd": 9950.00,              # just under $10K SAR threshold
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 0040 0040 40",
        "remit_to_email": "ap@copper-ridgeeng.com",  # lookalike
        "line_items": [
            {"description": "Engineering kit E-12", "quantity": 1, "unit_price": 9950.00}
        ],
        "notes": "Standard terms Net 30.",
    },
    {
        "case_id": "C-005",
        "invoice_number": "INV-2026-2207",
        "vendor_id": "V-012",              # real vendor (account takeover)
        "vendor_name": "Juniper Components Inc",
        "invoice_date": "2026-06-05",
        "due_date": "2026-07-05",
        "amount_usd": 11500.00,            # within V-012's normal range
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 0012 0012 12",  # V-012's known (invoice looks normal)
        "remit_to_email": "ap@juniper-componentinc.com",  # lookalike of contact_email
        "line_items": [
            {"description": "Components lot J-12", "quantity": 100, "unit_price": 115.00}
        ],
        "notes": "URGENT: Bank details updated. Wire today.",
    },
    {
        "case_id": "C-006",
        "invoice_number": "INV-2026-3319",
        "vendor_id": "V-050",              # first-time vendor (first_invoice_date == this invoice_date)
        "vendor_name": "York Manufacturing Co",
        "invoice_date": "2026-03-15",      # == V-050's first_invoice_date
        "due_date": "2026-04-14",
        "amount_usd": 7200.00,
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 0050 0050 50",
        "remit_to_email": "ap@york-manufacturingco.com",  # lookalike
        "line_items": [
            {"description": "Manufacturing run Y-1", "quantity": 1, "unit_price": 7200.00}
        ],
        "notes": "First invoice. Please process.",
    },
    {
        "case_id": "C-007",
        "invoice_number": "INV-8812",       # malformed: missing INV-YYYY- prefix
        "vendor_id": "V-035",
        "vendor_name": "Valley Forge Steel Systems",
        "invoice_date": "2026-08-01",
        "due_date": "2026-08-31",
        "amount_usd": 4500.00,
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 0035 0035 35",
        "remit_to_email": "ap@valley-forgesteel.com",  # lookalike
        "line_items": [
            {"description": "Steel batch V-35", "quantity": 1, "unit_price": 4500.00}
        ],
        "notes": "Standard terms.",
    },
    {
        "case_id": "C-008",
        "invoice_number": "INV-8812B",     # cross-vendor duplicate of INV-8812 amount
        "vendor_id": "V-045",
        "vendor_name": "Highmark Components Group",
        "invoice_date": "2026-08-01",
        "due_date": "2026-08-31",
        "amount_usd": 4500.00,             # same amount as INV-8812
        "currency": "USD",
        "bank_account": "GB29 NWBK 6016 0045 0045 45",
        "remit_to_email": "ap@highmark-componentgroup.com",  # lookalike
        "line_items": [
            {"description": "Components batch H-45", "quantity": 1, "unit_price": 4500.00}
        ],
        "notes": "Standard terms.",
    },
]

# Fraud emails (8 total, paired 1:1 with the 8 fraud invoices).
# Email case_id matches the paired invoice's case_id (C-001..C-008) AND the
# email filename stem matches the invoice filename stem (data/emails/C-00X.json
# <-> data/invoices/C-00X.json). This lets the worker's _pair_emails_for_invoice
# helper find the pair via either filename-stem match or JSON case_id match.
# The 4410 email (C-001) and the 2207 email (C-005) have bank_change_request=true.
FRAUD_EMAILS = [
    {
        "case_id": "C-001",                # paired with invoice C-001 (INV-2026-4410)
        "message_id": "<bec-4410-001@acme-industria1.com>",
        "from": "controller@acme-industria1.com",
        "from_domain": "acme-industria1.com",
        "to": "ap@sentinel-corp.com",
        "subject": "URGENT: Bank Account Change for Acme Industrial - Action Required Immediately",
        "date": "2026-07-08T10:00:00Z",     # 2 days before due_date 2026-07-10
        "body": (
            "Hi AP team,\n\n"
            "This is an urgent update. We have changed our bank. Please wire today "
            "to avoid delays. Immediate action required.\n\n"
            "New account: GB29 NWBK 6016 9999 8888 77\n\n"
            "Regards,\nAcme Controller"
        ),
        "bank_change_request": True,
        "requested_bank_account": "GB29 NWBK 6016 9999 8888 77",
    },
    {
        "case_id": "C-002",                # paired with invoice C-002 (INV-2026-1088, fake vendor)
        "message_id": "<bec-1088-002@newhorizon-logistics.com>",
        "from": "billing@newhorizon-logistics.com",
        "from_domain": "newhorizon-logistics.com",
        "to": "ap@sentinel-corp.com",
        "subject": "Invoice INV-2026-1088 - Please Process",
        "date": "2026-04-16T09:00:00Z",
        "body": (
            "Hello,\n\n"
            "Please find attached invoice INV-2026-1088 for $9,200. "
            "This is our first invoice with you. Please process urgently.\n\n"
            "Regards,\nNew Horizon Logistics"
        ),
        "bank_change_request": False,
        "requested_bank_account": None,
    },
    {
        "case_id": "C-003",                # paired with invoice C-003 (INV-2026-1091, duplicate)
        "message_id": "<bec-1091-003@lakeside-componentsuply.com>",
        "from": "ap@lakeside-componentsuply.com",
        "from_domain": "lakeside-componentsuply.com",
        "to": "ap@sentinel-corp.com",
        "subject": "Revised Invoice INV-2026-1091 - Please Process Immediately",
        "date": "2026-05-21T11:00:00Z",
        "body": (
            "Hi,\n\n"
            "Please find attached a revised invoice INV-2026-1091. "
            "Process immediately to avoid late fees.\n\n"
            "Regards,\nLakeside AP"
        ),
        "bank_change_request": False,
        "requested_bank_account": None,
    },
    {
        "case_id": "C-004",                # paired with invoice C-004 (INV-2026-1195, threshold skirting)
        "message_id": "<bec-1195-004@copper-ridgeeng.com>",
        "from": "ap@copper-ridgeeng.com",
        "from_domain": "copper-ridgeeng.com",
        "to": "ap@sentinel-corp.com",
        "subject": "Invoice INV-2026-1195 for $9,950",
        "date": "2026-07-02T08:30:00Z",
        "body": (
            "Hello,\n\n"
            "Please process invoice INV-2026-1195 for $9,950. Net 30 terms.\n\n"
            "Regards,\nCopper Ridge Engineering"
        ),
        "bank_change_request": False,
        "requested_bank_account": None,
    },
    {
        "case_id": "C-005",                # paired with invoice C-005 (INV-2026-2207, account takeover)
        "message_id": "<bec-2207-005@juniper-componentinc.com>",
        "from": "ap@juniper-componentinc.com",  # lookalike of V-012's domain
        "from_domain": "juniper-componentinc.com",
        "to": "ap@sentinel-corp.com",
        "subject": "URGENT: Bank Account Change for Juniper Components - Wire Today",
        "date": "2026-07-03T09:00:00Z",   # 2 days before due_date 2026-07-05
        "body": (
            "Hi AP,\n\n"
            "Urgent update. We have changed our bank. Please wire today for invoice "
            "INV-2026-2207. Immediate action required.\n\n"
            "New account: GB29 NWBK 6016 8888 0012 12\n\n"
            "Regards,\nJuniper AP"
        ),
        "bank_change_request": True,
        "requested_bank_account": "GB29 NWBK 6016 8888 0012 12",
    },
    {
        "case_id": "C-006",                # paired with invoice C-006 (INV-2026-3319, first-time vendor)
        "message_id": "<bec-3319-006@york-manufacturingco.com>",
        "from": "ap@york-manufacturingco.com",
        "from_domain": "york-manufacturingco.com",
        "to": "ap@sentinel-corp.com",
        "subject": "First Invoice INV-2026-3319 - Please Process",
        "date": "2026-03-16T10:00:00Z",
        "body": (
            "Hello,\n\n"
            "Please find our first invoice INV-2026-3319 for $7,200. "
            "Looking forward to a long relationship.\n\n"
            "Regards,\nYork Manufacturing"
        ),
        "bank_change_request": False,
        "requested_bank_account": None,
    },
    {
        "case_id": "C-007",                # paired with invoice C-007 (INV-8812, malformed ID)
        "message_id": "<bec-8812-007@valley-forgesteel.com>",
        "from": "ap@valley-forgesteel.com",
        "from_domain": "valley-forgesteel.com",
        "to": "ap@sentinel-corp.com",
        "subject": "Invoice INV-8812 for $4,500",
        "date": "2026-08-02T09:00:00Z",
        "body": (
            "Hi,\n\n"
            "Please process invoice INV-8812 for $4,500. Net 30 terms.\n\n"
            "Regards,\nValley Forge Steel"
        ),
        "bank_change_request": False,
        "requested_bank_account": None,
    },
    {
        "case_id": "C-008",                # paired with invoice C-008 (INV-8812B, cross-vendor dup)
        "message_id": "<bec-8812b-008@highmark-componentgroup.com>",
        "from": "ap@highmark-componentgroup.com",
        "from_domain": "highmark-componentgroup.com",
        "to": "ap@sentinel-corp.com",
        "subject": "Invoice INV-8812B for $4,500",
        "date": "2026-08-02T10:00:00Z",
        "body": (
            "Hello,\n\n"
            "Please process invoice INV-8812B for $4,500. Net 30 terms.\n\n"
            "Regards,\nHighmark Components"
        ),
        "bank_change_request": False,
        "requested_bank_account": None,
    },
]

# 10 ground-truth rows.
GROUND_TRUTH = [
    ("C-001", "INV-2026-4410", "BEC",            True, "domain_lookalike+timing+amount_anomaly"),
    ("C-002", "INV-2026-1088", "fake_invoice",   True, "first_time_vendor+amount_anomaly"),
    ("C-003", "INV-2026-1091", "invoice_manipulation", True, "duplicate+amount_anomaly"),
    ("C-004", "INV-2026-1195", "invoice_manipulation", True, "threshold_skirting"),
    ("C-005", "INV-2026-2207", "account_takeover", True, "timing+domain_lookalike"),
    ("C-006", "INV-2026-3319", "fake_invoice",   True, "first_time_vendor"),
    ("C-007", "INV-8812",     "fake_invoice",    True, "malformed_id"),
    ("C-008", "INV-8812B",    "invoice_manipulation", True, "duplicate"),
    ("C-009", "CORRUPT-9901", "malformed_input", True, "schema_validation_fail"),
    ("C-010", "CORRUPT-9902", "malformed_input", True, "schema_validation_fail"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def derive_domain(name: str) -> str:
    """Derive a registered domain from a legal name."""
    s = name.lower()
    # remove common suffixes
    for suffix in (" holdings", " group", " inc", " llc", " co", " systems",
                   " supply", " manufacturing", " industrial", " components",
                   " logistics", " engineering", " fabrication", " steel",
                   " partners"):
        if s.endswith(suffix):
            s = s[: -len(suffix)]
            break
    s = s.replace(" ", "")
    return f"{s}.com"


def derive_contact_email(domain: str) -> str:
    return f"ap@{domain}"


def derive_tax_id(rng: random.Random, idx: int) -> str:
    state_code = idx % 50 + 1
    digits = rng.randint(0, 9_999_999)
    return f"US-{state_code:02d}-{digits:07d}"


def derive_phone(rng: random.Random) -> str:
    """+1-555-XXX-XXXX — E.164-ish."""
    a = rng.randint(200, 989)
    b = rng.randint(1000, 9999)
    return f"+1-555-{a:03d}-{b:04d}"


def derive_bank_account(idx: int) -> str:
    """Derive a deterministic IBAN-ish bank account from the vendor index (1..60)."""
    return f"GB29 NWBK 6016 {idx:04d} {idx:04d} {idx:02d}"


def random_date_in_range(rng: random.Random, start: date, end: date) -> date:
    span = (end - start).days
    return start + timedelta(days=rng.randint(0, span))


def iso_date(d: date) -> str:
    return d.isoformat()


# ---------------------------------------------------------------------------
# Vendor master
# ---------------------------------------------------------------------------
def gen_vendors(rng: random.Random):
    vendors = []
    for i, name in enumerate(VENDOR_NAMES, start=1):
        vid = f"V-{i:03d}"
        domain = derive_domain(name)
        # Special overrides for Acme (V-001) — use a cleaner domain.
        if vid == "V-001":
            domain = "acmeindustrial.com"
        phone = derive_phone(rng)
        bank = derive_bank_account(i)
        tax = derive_tax_id(rng, i)
        city, state, zipc = US_CITIES[i % len(US_CITIES)]
        street_no = 100 + i * 7
        street = STREET_NAMES[i % len(STREET_NAMES)]
        address = f"{street_no} {street}, {city}, {state} {zipc}"
        contact = derive_contact_email(domain)

        # bank_account_added_date: 2024-03 to 2024-06 for most;
        # V-050 (first-time vendor) overrides to 2026-03-10.
        if vid == "V-050":
            bank_added = "2026-03-10"
            first_inv = "2026-03-15"  # matches INV-2026-3319
        else:
            bank_added = iso_date(random_date_in_range(
                rng, date(2024, 3, 1), date(2024, 3, 31)))
            first_inv = iso_date(random_date_in_range(
                rng, date(2024, 4, 1), date(2024, 7, 31)))

        vendors.append({
            "vendorId": vid,
            "legalName": name,
            "registeredDomain": domain,
            "knownPhone": phone,
            "knownBankAccount": bank,
            "bankAccountAddedDate": bank_added,
            "firstInvoiceDate": first_inv,
            "address": address,
            "contactEmail": contact,
            "taxId": tax,
        })
    return vendors


# ---------------------------------------------------------------------------
# Payment history (480 rows)
# ---------------------------------------------------------------------------
def gen_payments(rng: random.Random, vendors):
    """Generate 480 payment history rows.
    V-050 has 0 payments (first-time vendor).
    V-052..V-059 have 9 payments; all other vendors (except V-050) have 8.
    V-030 has the special INV-2026-1091 entry ($5,000, paid 2026-01-15) as one of its 8.
    """
    payments = []
    payment_seq = 1  # global counter for paymentId P-0001..
    # Per-vendor invoice seq counters (per calendar year).
    per_vendor_seq = {}  # (vendor_id, year) -> next seq

    def next_invoice_number(vid: str, d: date) -> str:
        key = (vid, d.year)
        n = per_vendor_seq.get(key, 1)
        per_vendor_seq[key] = n + 1
        return f"INV-{d.year}-{n:04d}"

    for v in vendors:
        vid = v["vendorId"]
        if vid == "V-050":
            continue  # first-time vendor, no payment history

        # Determine count
        n_payments = 9 if vid in VENDORS_WITH_EXTRA_PAYMENT else 8

        # Mean
        if vid in SPECIAL_MEANS:
            mean = SPECIAL_MEANS[vid]
        else:
            mean = float(rng.randint(2000, 30000))
        std = mean * 0.15

        # Special handling: V-030 has the INV-2026-1091 entry as one of its 8.
        # We generate n_payments normal entries for every vendor (including
        # V-030) so rng consumption is identical run-to-run, then for V-030 we
        # OVERWRITE the last entry's *fields* (keeping its already-assigned
        # paymentId) with the special INV-2026-1091 values. This avoids any
        # paymentId collision (the bug-prone pre-computed-id approach).
        generated_for_this_vendor = []
        for _ in range(n_payments):
            paid_date = random_date_in_range(rng, date(2024, 4, 1), date(2026, 7, 31))
            amount = max(50.0, round(rng.gauss(mean, std), 2))
            inv_no = next_invoice_number(vid, paid_date)
            # Currency: 90% USD, 6% EUR, 4% GBP
            r = rng.random()
            if r < 0.04:
                cur = "GBP"
            elif r < 0.10:
                cur = "EUR"
            else:
                cur = "USD"
            generated_for_this_vendor.append({
                "paymentId": f"P-{payment_seq:04d}",
                "vendorId": vid,
                "invoiceNumber": inv_no,
                "paidDate": iso_date(paid_date),
                "amountUsd": amount,
                "currencyOriginal": cur,
            })
            payment_seq += 1

        if vid == "V-030":
            # Overwrite the last normal entry's fields (keep paymentId) with
            # the special INV-2026-1091 values. This is the original payment
            # that the fraud invoice INV-2026-1091 (for V-025) duplicates.
            last = generated_for_this_vendor[-1]
            generated_for_this_vendor[-1] = {
                "paymentId": last["paymentId"],  # keep the assigned id
                "vendorId": "V-030",
                "invoiceNumber": "INV-2026-1091",
                "paidDate": "2026-01-15",
                "amountUsd": 5000.00,
                "currencyOriginal": "USD",
            }

        payments.extend(generated_for_this_vendor)

    # Sanity check
    assert len(payments) == 480, f"expected 480 payments, got {len(payments)}"
    return payments


# ---------------------------------------------------------------------------
# Legit invoices (132 JSON documents)
# ---------------------------------------------------------------------------
def gen_legit_invoices(rng: random.Random, vendors, payments):
    """132 legitimate invoices. case_id C-0001..C-0132. invoice_number INV-2026-5XXX."""
    # Build per-vendor payment mean/std from payment_history (for amounts within range).
    vendor_stats = {}  # vid -> (mean, std)
    by_vendor = {}
    for p in payments:
        by_vendor.setdefault(p["vendorId"], []).append(p["amountUsd"])
    for vid, amts in by_vendor.items():
        m = sum(amts) / len(amts)
        s = (sum((a - m) ** 2 for a in amts) / len(amts)) ** 0.5
        vendor_stats[vid] = (m, s)

    # Vendor pool excludes V-050 (no payment history).
    pool = [v for v in vendors if v["vendorId"] != "V-050"]

    invoices = []
    # invoice_number seq: INV-2026-5001..INV-2026-5132
    for i in range(1, 133):
        case_id = f"C-{i:04d}"
        invoice_number = f"INV-2026-{5000 + i:04d}"  # 5001..5132
        v = rng.choice(pool)
        vid = v["vendorId"]
        mean, std = vendor_stats.get(vid, (5000.0, 750.0))
        # amount within historical range: clip to mean +/- 2*std
        amt = rng.gauss(mean, std)
        amt = max(100.0, min(amt, mean + 2 * std))
        amt = round(amt, 2)
        invoice_date = random_date_in_range(rng, date(2026, 1, 1), date(2026, 8, 31))
        due_date = invoice_date + timedelta(days=30)
        # 1-3 line items; last item absorbs the remainder (safe, no loops).
        n_items = rng.randint(1, 3)
        line_items = []
        remaining = amt
        for j in range(n_items):
            if j == n_items - 1:
                # last item absorbs the remainder
                line_items.append({
                    "description": f"Line item {j + 1}",
                    "quantity": 1,
                    "unit_price": round(remaining, 2),
                })
                remaining = 0.0
            else:
                share = round(rng.uniform(0.1, 0.5) * amt, 2)
                line_items.append({
                    "description": f"Line item {j + 1}",
                    "quantity": 1,
                    "unit_price": share,
                })
                remaining = round(remaining - share, 2)
        notes = "Net 30. Please remit to the bank account on file."
        invoices.append({
            "case_id": case_id,
            "invoice_number": invoice_number,
            "vendor_id": vid,
            "vendor_name": v["legalName"],
            "invoice_date": iso_date(invoice_date),
            "due_date": iso_date(due_date),
            "amount_usd": amt,
            "currency": "USD",
            "bank_account": v["knownBankAccount"],
            "remit_to_email": v["contactEmail"],
            "line_items": line_items,
            "notes": notes,
        })
    return invoices


# ---------------------------------------------------------------------------
# Legit emails (22 JSON documents)
# ---------------------------------------------------------------------------
def gen_legit_emails(rng: random.Random, vendors):
    """22 legitimate vendor emails. case_id E-0001..E-0022."""
    pool = [v for v in vendors if v["vendorId"] != "V-050"]
    subjects = [
        "Statement of Account - {month} 2026",
        "Invoice {inv} Payment Confirmation",
        "Question about invoice {inv}",
        "Updated contact information",
        "Thank you for your business",
        "Reminder: invoice {inv} due soon",
    ]
    months = ["June", "July", "August", "May", "April"]
    emails = []
    for i in range(1, 23):
        case_id = f"E-{i:04d}"
        v = rng.choice(pool)
        domain = v["registeredDomain"]
        contact = v["contactEmail"]
        tpl = rng.choice(subjects)
        subject = tpl.format(month=rng.choice(months), inv=f"INV-2026-{rng.randint(5001, 5132)}")
        d = random_date_in_range(rng, date(2026, 1, 1), date(2026, 8, 31))
        body = (
            f"Hello AP team,\n\n"
            f"This is a routine message from {v['legalName']}. "
            f"No changes to our bank account or remittance details. "
            f"Please direct any questions to {contact}.\n\n"
            f"Regards,\n{v['legalName']}"
        )
        emails.append({
            "case_id": case_id,
            "message_id": f"<legit-{i:04d}@{domain}>",
            "from": contact,
            "from_domain": domain,
            "to": "ap@sentinel-corp.com",
            "subject": subject,
            "date": f"{iso_date(d)}T{rng.randint(8, 17):02d}:00:00Z",
            "body": body,
            "bank_change_request": False,
            "requested_bank_account": None,
        })
    return emails


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------
def write_csv(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, sort_keys=True, indent=2)
        f.write("\n")


def write_text(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def write_readme(out_dir, seed):
    txt = f"""# Synthetic AP Fraud Dataset

Reproducible synthetic dataset for the AP Payment Fraud Sentinel project.

- Seed: **{seed}** (deterministic — same seed produces byte-identical output)
- Vendor master: 60 rows (`vendor_master.csv`)
- Payment history: 480 rows, ~8 per vendor, 2-year span 2024-04 to 2026-07 (`payment_history.csv`)
- Fraud ground truth: 10 rows — 8 invoice plants (C-001..C-008), 1 corrupt invoice (C-009, `CORRUPT-9901.json`), 1 corrupt email (C-010, `CORRUPT-9902.json`) (`fraud_ground_truth.csv`)
- Invoices: `invoices/*.json` — 132 legit + 8 fraud plants + 1 corrupt file
- Emails: `emails/*.json` — 22 legit + 8 fraud plants + 1 corrupt file

## Regenerate

```
python scripts/gen_dataset.py --seed {seed} --out data/
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
"""
    write_text(os.path.join(out_dir, "README.md"), txt)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=str, default="data/")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)
    inv_dir = os.path.join(out_dir, "invoices")
    eml_dir = os.path.join(out_dir, "emails")
    os.makedirs(inv_dir, exist_ok=True)
    os.makedirs(eml_dir, exist_ok=True)

    # Clear any stale invoice/email JSON files from a previous run so the
    # output directory is byte-identical run-to-run (no leftover E-00X.json
    # after a rename to C-00X.json, etc.).
    import glob
    for pat in (os.path.join(inv_dir, "*.json"), os.path.join(eml_dir, "*.json")):
        for f in glob.glob(pat):
            os.remove(f)

    # 1. Vendors
    vendors = gen_vendors(rng)
    write_csv(
        os.path.join(out_dir, "vendor_master.csv"),
        vendors,
        ["vendorId", "legalName", "registeredDomain", "knownPhone",
         "knownBankAccount", "bankAccountAddedDate", "firstInvoiceDate",
         "address", "contactEmail", "taxId"],
    )

    # 2. Payments
    payments = gen_payments(rng, vendors)
    write_csv(
        os.path.join(out_dir, "payment_history.csv"),
        payments,
        ["paymentId", "vendorId", "invoiceNumber", "paidDate",
         "amountUsd", "currencyOriginal"],
    )

    # 2b. Patch INV-2026-4410 amount to be exactly 5.2x V-001's *sample* mean.
    # The prompt says "amount 5.2x the vendor's historical mean" — the
    # historical mean is what's actually in payment_history, so we compute
    # it from the generated payments and patch the fraud invoice accordingly.
    v001_amts = [p["amountUsd"] for p in payments if p["vendorId"] == "V-001"]
    v001_mean = sum(v001_amts) / len(v001_amts)
    bec_amount = round(v001_mean * 5.2, 2)
    FRAUD_INVOICES[0]["amount_usd"] = bec_amount
    # Keep line_items total consistent (1 line item: unit_price = amount / quantity).
    qty = FRAUD_INVOICES[0]["line_items"][0]["quantity"]
    FRAUD_INVOICES[0]["line_items"][0]["unit_price"] = round(bec_amount / qty, 2)

    # 3. Ground truth
    gt_rows = [
        {"caseId": c, "invoiceNumber": inv, "fraudType": ft,
         "isFraud": "True" if fr else "False", "expectedSignal": sig}
        for (c, inv, ft, fr, sig) in GROUND_TRUTH
    ]
    write_csv(
        os.path.join(out_dir, "fraud_ground_truth.csv"),
        gt_rows,
        ["caseId", "invoiceNumber", "fraudType", "isFraud", "expectedSignal"],
    )

    # 4. Legit invoices (132 files)
    legit_invoices = gen_legit_invoices(rng, vendors, payments)
    for inv in legit_invoices:
        path = os.path.join(inv_dir, f"{inv['case_id']}.json")
        write_json(path, inv)

    # 5. Fraud invoices (8 files)
    for inv in FRAUD_INVOICES:
        path = os.path.join(inv_dir, f"{inv['case_id']}.json")
        write_json(path, inv)

    # 6. Corrupt invoice (1 file) — invalid JSON garbage
    write_text(os.path.join(inv_dir, "CORRUPT-9901.json"),
               "{ this is not valid json {{{\n")

    # 7. Legit emails (22 files)
    legit_emails = gen_legit_emails(rng, vendors)
    for em in legit_emails:
        path = os.path.join(eml_dir, f"{em['case_id']}.json")
        write_json(path, em)

    # 8. Fraud emails (8 files)
    for em in FRAUD_EMAILS:
        path = os.path.join(eml_dir, f"{em['case_id']}.json")
        write_json(path, em)

    # 9. Corrupt email (1 file) — invalid JSON garbage
    write_text(os.path.join(eml_dir, "CORRUPT-9902.json"),
               "{ this is not valid json {{{\n")

    # 10. README
    write_readme(out_dir, args.seed)

    # Summary
    n_inv = len(legit_invoices) + len(FRAUD_INVOICES) + 1  # +1 corrupt
    n_eml = len(legit_emails) + len(FRAUD_EMAILS) + 1     # +1 corrupt
    print(f"Vendors: {len(vendors)}")
    print(f"Payments: {len(payments)}")
    print(f"Ground truth: {len(GROUND_TRUTH)}")
    print(f"Invoice files: {n_inv} ({len(legit_invoices)} legit + {len(FRAUD_INVOICES)} fraud + 1 corrupt)")
    print(f"Email files: {n_eml} ({len(legit_emails)} legit + {len(FRAUD_EMAILS)} fraud + 1 corrupt)")
    print(f"Output dir: {out_dir}")


if __name__ == "__main__":
    main()
