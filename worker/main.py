"""worker.main — entry point. Starts the aiohttp mini-service on WORKER_PORT.

Usage:
    python3 worker/main.py

Reads ROCKETRIDE_API_KEY from env. Prints the active mode (rocketride or
local) and DB counts at startup. The orchestrator backgrounds this with
`python3 worker/main.py` from the project root.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from aiohttp import web

# Make `worker` an importable package when invoked as `python3 worker/main.py`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from worker.app import build_app  # noqa: E402
from worker import db  # noqa: E402

logging.basicConfig(
    level=os.environ.get("APFRAUD_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("worker.main")

WORKER_PORT = int(os.environ.get("WORKER_PORT", "3030"))


def _startup_banner() -> None:
    has_key = bool(os.environ.get("ROCKETRIDE_API_KEY", "").strip())
    mode = "rocketride" if has_key else "local"
    counts = db.db_counts()
    log.info("=" * 72)
    log.info("AP Payment Fraud Sentinel — pipeline worker")
    log.info("Mode:        %s", mode)
    log.info("API key set: %s", has_key)
    log.info("Service URL: %s", os.environ.get("ROCKETRIDE_SERVICE_URL", "https://api.rocketride.ai"))
    log.info("DB path:     %s", db.DB_PATH)
    log.info("DB counts:   %s", counts)
    log.info("Listening:   http://localhost:%d", WORKER_PORT)
    log.info("Endpoints:")
    log.info("  GET  /healthz")
    log.info("  POST /runs                body {run_id, batch_path?, limit?}")
    log.info("  GET  /runs/{run_id}")
    log.info("  GET  /cases?limit=&status=&runId=")
    log.info("  GET  /cases/{case_id}")
    log.info("  POST /decisions           body {case_id, approver, decision, reason}")
    log.info("=" * 72)


def main() -> None:
    """Entry point. Uses aiohttp.web.run_app which handles SIGINT/SIGTERM."""
    _startup_banner()
    app = build_app()
    # web.run_app blocks forever; it owns the asyncio loop + signal handling.
    # This is the canonical pattern and survives parent-shell exit when
    # backgrounded with nohup/setsid/disown.
    web.run_app(app, host="0.0.0.0", port=WORKER_PORT, print=None, handle_signals=True)


if __name__ == "__main__":
    main()
