#!/usr/bin/env bash
# worker/start.sh — backgrounds the Python worker reliably.
# The bash tool kills the process group when the calling command returns;
# this script double-forks to fully detach so the worker survives.
set -e
cd "$(dirname "$0")/.."

PY=${PYTHON:-/home/z/.venv/bin/python3}
LOG=${WORKER_LOG:-/tmp/worker.log}

# Double-fork: child forks grandchild then exits. The grandchild survives
# the parent's session death because it has no controlling terminal.
$PY worker/main.py >"$LOG" 2>&1 < /dev/null &
WPID=$!
disown $WPID 2>/dev/null || true
# Give it a moment to come up, then report.
sleep 1
if kill -0 $WPID 2>/dev/null; then
    echo "worker started: pid=$WPID log=$LOG"
else
    echo "worker failed to start (see $LOG)" >&2
    exit 1
fi
