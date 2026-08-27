# AP Payment Fraud Sentinel — VS Code Setup Guide

Everything from installing VS Code to running the pipeline inside it.
Works on Windows, macOS, and Linux (examples show Windows; Mac differences
are noted).

---

## 1. Install VS Code (one time)

1. Go to **https://code.visualstudio.com** → click **Download** (Windows button).
2. Run the installer. On the "Select Additional Tasks" screen, **tick**:
   - ✅ *Add "Open with Code" action to Windows Explorer file context menu*
   - ✅ *Add "Open with Code" action to Windows Explorer directory context menu*
   - ✅ *Register Code as an editor for supported file types*
   - ✅ *Add to PATH* (checked by default)
3. Click **Install** → finish → launch VS Code once.

Also make sure the two runtimes are installed (from `SETUP.md`):

| Runtime | Check (in VS Code terminal) | Get |
|---|---|---|
| Node.js 18+ | `node -v` | https://nodejs.org (LTS) |
| Python 3.10+ | `python --version` | https://python.org — **tick "Add to PATH"** on Windows |

---

## 2. Get the project onto your PC

If you haven't already:

1. Open the AP Sentinel dashboard → sidebar → **Setup on PC** → **Download project ZIP**.
2. In your Downloads folder: right-click `ap-fraud-sentinel.zip` → **Extract All…**
   → type `C:\ap-fraud` → Extract.
3. Keep going into the inner folder until you see these **directly inside**:
   `setup.bat`, `start.bat`, `package.json`, `SETUP.md`, folders `src`, `worker`, `data`.
   *That* folder is the project root.

---

## 3. Open the project in VS Code (pick one)

**Way A — right-click (easiest):**
Right-click the project folder (`ap-fraud-sentinel`) in File Explorer → **Open with Code**.

**Way B — from VS Code:**
File ▸ **Open Folder…** → select the `ap-fraud-sentinel` folder → **Yes, I trust the authors** (trust prompt appears once).

**Way C — from a terminal:**
```bat
cd C:\ap-fraud\ap-fraud-sentinel
code .
```
(`code .` = "open current folder in VS Code"; the `.` means here.)

You should now see the file tree in the Explorer sidebar (left edge, top icon
or `Ctrl+Shift+E`):

```
ap-fraud-sentinel/
├── .vscode/          ← tasks + extension recommendations (shipped)
├── data/             ← YOUR dataset: CSVs, invoices/*.pdf, emails/*.eml
├── prisma/schema.prisma
├── src/              ← dashboard code (Next.js / React / TypeScript)
├── worker/           ← Python pipeline (7 stages, signals, agents, calls)
├── mini-services/pipeline-ws/   ← socket.io trace service
├── scripts/seed_db.py
├── setup.bat / start.bat (+ .sh for mac/linux)
└── SETUP.md
```

---

## 4. Open the integrated terminal

Press **`` Ctrl + ` ``** (Ctrl + backtick) — or menu **View ▸ Terminal**.
A terminal opens at the bottom, already cd'd into the project folder.
This replaces opening a separate cmd window; every command below runs here.

> Windows default shell is PowerShell. `setup.bat` / `start.bat` run fine in
> PowerShell — just type their names. (In `./setup.sh`-style docs, on Windows
> always use the `.bat` equivalent.)

---

## 5. One-time setup (in the VS Code terminal)

```bat
setup.bat
```
(Mac/Linux: `./setup.sh`)

What it does: installs Node packages, Python packages, creates `.env`,
creates the SQLite DB and loads the reference CSVs (60 vendors / 480 payments).

✅ Success line: `Setup complete. Start everything with:  start.bat`

---

## 6. Start all three services

Option A — in the terminal:

```bat
start.bat
```
Three console windows open (Trace WS :3003, Worker :3030, Dashboard :3000)
and your browser opens `http://localhost:3000`.

Option B — **VS Code tasks** (nicer):

Menu **Terminal ▸ Run Task…** → pick:

| Task | Purpose |
|---|---|
| **1 · Setup (one-time)** | same as setup.bat |
| **2 · Start everything (3 services)** | same as start.bat |
| 3 · Dashboard only | just `next dev -p 3000` |
| 3 · Pipeline worker only | just the Python worker |
| 3 · Trace WS only | just the socket.io service |
| **4 · Reseed reference CSVs** | reload `data/*.csv` after editing your dataset |

Using the three "only" tasks together is great for **development**: each runs
in the VS Code terminal panel, and clicking the trash icon on a terminal stops
just that service.

Click **Run batch** on the dashboard → the 7-stage pipeline trace animates.

---

## 7. Recommended extensions

On first open VS Code shows: *"This workspace has extension recommendations"* →
**Install**. (Or `Ctrl+Shift+X` → type `@recommended`.) They are:

- **Python** (ms-python.python) — run/debug the worker, pick interpreter
- **ESLint** (dbaeumer.vscode-eslint) — dashboard code linting
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss) — class autocomplete
- **Prisma** (prisma.prisma) — `prisma/schema.prisma` highlighting + formatting

Optional extras that help: *Rainbow CSV* (editing `data/*.csv`),
*SQLite Viewer* (peeking into `db/custom.db` without leaving the editor).

---

## 8. Editing YOUR dataset (the usual loop)

1. Drop your invoices into `data/invoices/*.pdf` and emails into `data/emails/*.eml`
   (clear the demo files out first).
2. Overwrite `data/vendor_master.csv` + `data/payment_history.csv` — keep the
   exact headers (see `SETUP.md` §4 or the in-app Setup page).
3. **Terminal ▸ Run Task… → 4 · Reseed reference CSVs** (or `python scripts\seed_db.py`).
4. Dashboard → **Run batch**. Every case now grounds against your vendors/payments.

---

## 9. Useful VS Code moves for this project

- **Command Palette** `Ctrl+Shift+P`:
  - `Python: Select Interpreter` → pick 3.10+ if the worker complains about imports
  - `Tasks: Run Task` → same list as the menu
  - `Ports: Focus on Ports View` → see 3000 / 3030 / 3003
- **Split terminal** (terminal panel, split icon or `Ctrl+Shift+5`): run worker
  left, dashboard right.
- **Go to file** `Ctrl+P`: type `signals` → jump to `worker/signals.py`; type
  `page.tsx` → the dashboard root component.
- **Debug the worker**: open any `worker/*.py` → set a breakpoint (click left of
  a line number) → `F5` → choose Python File. (Stop the task-run worker first
  so port 3030 is free.)
- **See logs** (start.bat mode): the three console windows; (tasks mode): the
  terminal panel keeps each service's output.

---

## 10. Troubleshooting in VS Code

| Symptom | Fix |
|---|---|
| `node`/`python` not recognized in terminal | Fully close VS Code and reopen (it inherits PATH from launch); reinstall runtime with PATH ticked |
| Worker says `ModuleNotFoundError` | `Python: Select Interpreter` → pick the one where you ran setup (or rerun `python -m pip install -r worker/requirements.txt`) |
| Port 3000/3030/3003 busy | A service is still running in another terminal/window — find it in the terminal list (dropdown next to +) and kill it, or reboot |
| Dashboard badge `ws down` | Trace WS task/window isn't running → run task *3 · Trace WS only* |
| Edits to `.env` not picked up | Restart the affected service (Next.js hot-reload doesn't reread env for server code) |
| PowerShell blocks setup.bat | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use the integrated terminal defaults |

---

Full manual: `SETUP.md` · In-app guide: dashboard → **Setup on PC**.
