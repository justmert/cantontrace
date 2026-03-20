#!/bin/bash
# Stop a running Canton Sandbox
# Usage: ./stop-sandbox.sh [PORT]

set -euo pipefail

PORT=${1:-6865}
SANDBOX_PID_FILE="/tmp/canton-sandbox-${PORT}.pid"

if [ ! -f "$SANDBOX_PID_FILE" ]; then
    echo "No sandbox PID file found for port $PORT"
    exit 0
fi

PID=$(cat "$SANDBOX_PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping sandbox (PID: $PID)..."
    kill "$PID"

    # Wait for graceful shutdown
    for i in $(seq 1 10); do
        if ! kill -0 "$PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done

    # Force kill if still running
    if kill -0 "$PID" 2>/dev/null; then
        echo "Force killing sandbox..."
        kill -9 "$PID" 2>/dev/null || true
    fi

    echo "Sandbox stopped."
else
    echo "Sandbox process (PID: $PID) already stopped."
fi

rm -f "$SANDBOX_PID_FILE"
