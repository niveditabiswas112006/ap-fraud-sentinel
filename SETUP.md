# AP Payment Fraud Sentinel — Run it on your own PC

Bring the full 7-stage fraud screening pipeline (Ingest → Extract → Ground →
Signal → Agent → Verify → Gate) to your machine and screen **your own**
CSV + PDF + EML dataset.

---

## 1. What you need first (prerequisites)

| Tool | Version | Check | Get it from |
|---|---|---|---|
| **Node.js** | 18+ (20+ recommended) | `node -v` | https://nodejs.org |
| **Python** | 3.10+ | `python --version` | https://python.org |
| **Bun** *(optional, faster)* | 1.x | `bun -v` | https://bun.sh |

> That's it. No API keys required — with no `ROCKETRIDE_API_KEY` set, the
> pipeline runs in **local mode**: deterministic signals + agents, and the
> verification-call flow uses the prerecorded audio path.

---

## 2. Quick start (2 commands)

### Windows

```bat
setup.bat    :: one-time: installs deps, creates + seeds the database
start.bat    :: every day: starts all 3 services and opens the dashboard
```

### macOS / Linux

```bash
./setup.sh   # one-time: installs deps, creates + seeds the database
./start.sh   # every day: starts all 3 services and opens the dashboard
```

When `start` finishes, your browser opens **http://localhost:3000**.

> First time? Click **Run batch** on the Dashboard and watch the 7-stage
> pipeline trace light up in real time.

---

## 3. What the scripts do (manual setup)

If you prefer to run the steps yourself:

```bash
# 1. Install Node dependencies (root + the WebSocket mini-service)
npm install
npm install --prefix mini-services/pipeline-ws

# 2. Install Python dependencies for the pipeline worker
python -m pip install -r worker/requirements.txt

# 3. Create .env from the template
cp .env.example .env            # Windows: copy .env.example .env

# 4. Create the SQLite database (tables from prisma/schema.prisma)
npm run db:push

# 5. Load the reference CSVs (vendors / payment history / ground truth)
python scripts/seed_db.py
```

Starting the three services (each in its own terminal):

```bash
# Terminal 1 — WebSocket trace service (port 3003)
npm run ws                      # node mini-services/pipeline-ws/index.js

# Terminal 2 — Python pipeline worker (port 3030)
python worker/main.py

# Terminal 3 — Next.js dashboard (port 3000)
npm run dev
```

### The three services

| Service | Port | What it does |
|---|---|---|
| **Dashboard** (Next.js) | 3000 | The single-page UI you see in the browser |
| **Pipeline worker** (Python) | 3030 | Runs the 7-stage pipeline, writes cases to SQLite |
| **Trace service** (socket.io) | 3003 | Streams live pipeline events to the dashboard |

---

## 4. Use YOUR OWN dataset

The shipped dataset (60 vendors, 480 payments, 141 invoices, 31 emails) is
synthetic. Replace it with your real data in three steps.

### Step A — Replace the reference CSVs in `data/`

**`data/vendor_master.csv`** — your known-good vendor baseline:

```csv
vendorId,legalName,registeredDomain,knownPhone,knownBankAccount,bankAccountAddedDate,firstInvoiceDate,address,contactEmail,taxId
V-001,Acme Industrial Supply,acmeindustrial.com,+1-555-854-2824,GB29 NWBK 6016 0001 0001 01,2024-03-24,2024-05-06,"107 Manufacturing Way, Columbus, OH 43215",ap@acmeindustrial.com,US-02-0419610
```

**`data/payment_history.csv`** — payment history (drives the z-score amount
anomaly signal; needs ~8+ payments per vendor for meaningful statistics):

```csv
paymentId,vendorId,invoiceNumber,paidDate,amountUsd,currencyOriginal
P-0001,V-001,INV-2025-0001,2025-08-06,8791.51,EUR
```

**`data/fraud_ground_truth.csv`** *(optional — labels for evaluation only)*:

```csv
caseId,invoiceNumber,fraudType,isFraud,expectedSignal
C-001,INV-2026-4410,BEC,True,domain_lookalike+timing+amount_anomaly
```

Keep the exact column headers shown above. `vendorId` values in
payment_history must exist in vendor_master.

### Step B — Drop in your raw files

| Folder | Format | Notes |
|---|---|---|
| `data/invoices/` | `*.pdf` | One invoice per file. Fields (invoice #, vendor, amount, dates, bank) are extracted from the visible text via regex — clean, text-based PDFs work best. Scanned/image-only PDFs get quarantined (by design). |
| `data/emails/` | `*.eml` | Standard RFC-822 `.eml` files (drag out of Outlook / export from Gmail). From/To/Subject/body + any bank-change language drives the BEC signal. |
| `data/prerecorded/` | `{CASE_ID}.wav` *(optional)* | Vendor-side audio for the verification-call stage. If absent, the worker generates the call script + transcript deterministically. |

### Step C — Reload and run

```bash
python scripts/seed_db.py     # re-loads the CSVs into SQLite
```

Then open the dashboard → **Upload** view (optional per-run batches) or click
**Run batch** on the Dashboard. Every case is grounded against YOUR vendor
master + payment history.

> You can also keep the synthetic data and screen a one-off batch: drop files
> anywhere, then use the **Upload** view to point a run at that folder.

---

## 5. Verification calls & AI features

- **With no keys at all** — everything runs deterministically (local mode):
  TTS/ASR/LLM steps use scripted fallbacks, the full case journey (signals →
  agent → call → gate) still works end-to-end, and prerecorded WAVs replay
  in the case detail sheet.
- **With a RocketRide API key** (optional) — set `ROCKETRIDE_API_KEY` in
  `.env` to run the pipeline through the RocketRide cloud runtime.

---

## 6. Opening in VS Code (optional, nice for editing)

1. Install VS Code from https://code.visualstudio.com
2. File ▸ **Open Folder…** → select the `ap-fraud-sentinel` folder
3. VS Code prompts to install the recommended extensions (Python, ESLint,
   Tailwind, Prisma) — click **Install**
4. Open the integrated terminal with `` Ctrl+` `` (View ▸ Terminal) and run the
   same commands (`./setup.sh`, `./start.sh`)
5. Or use the built-in tasks: **Terminal ▸ Run Task…** →
   *1 · Setup (one-time)*, *2 · Start everything*, per-service starters, and
   *4 · Reseed reference CSVs* (shipped in `.vscode/tasks.json`)

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run dev` says port 3000 in use | Stop the other process, or `npm run dev -- -p 3001` |
| Dashboard shows **WS offline** badge | The trace service (port 3003) isn't running — start it with `npm run ws` |
| All PDFs land in *quarantined* | `pip install pdfplumber`, and check the PDFs contain selectable text (not scanned images) |
| `python` not found (Windows) | Install from python.org and tick *Add to PATH*, or use `py -3` and run the worker with `py -3 worker/main.py` |
| Fresh dashboard after restart | Normal — cases live in `db/custom.db`; run a batch to populate, old runs stay in **Runs** |
| Reset everything | Delete `db/custom.db`, then `npm run db:push && python scripts/seed_db.py` |

---

## 8. Where things live

```
data/                  your dataset (CSVs + invoices/ + emails/ + prerecorded/)
db/custom.db           SQLite — all cases, runs, decisions
prisma/schema.prisma   database schema
worker/                Python pipeline worker (7 stages, signals, agents)
pipelines/*.pipe       canonical RocketRide pipeline definitions
mini-services/pipeline-ws/   socket.io trace service
src/                   Next.js dashboard (single-page, App Router)
```

Questions start at `SETUP.md`; the dashboard itself is the demo.
