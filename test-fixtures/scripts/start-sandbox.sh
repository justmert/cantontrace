#!/bin/bash
# Start a Canton Sandbox with the test DAR loaded
# Usage: ./start-sandbox.sh [PORT]
#
# Prerequisites:
#   - dpm CLI installed (Daml/Canton SDK)
#   - test DAR built (run build-dar.sh first)
#
# Returns: Ledger API endpoint URL

set -euo pipefail

PORT=${1:-6865}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAR_PATH="${SCRIPT_DIR}/../test-daml/.daml/dist/cantontrace-test-1.0.0.dar"
SANDBOX_PID_FILE="/tmp/canton-sandbox-${PORT}.pid"
LOG_FILE="/tmp/canton-sandbox-${PORT}.log"

# Check prerequisites
if ! command -v dpm &> /dev/null && ! command -v daml &> /dev/null; then
    echo "ERROR: Neither dpm nor daml CLI found. Install the Daml SDK first."
    echo "  curl -sSL https://get.daml.com/ | sh"
    exit 1
fi

if [ ! -f "$DAR_PATH" ]; then
    echo "ERROR: Test DAR not found at $DAR_PATH"
    echo "  Run ./build-dar.sh first"
    exit 1
fi

# Kill any existing sandbox on this port
if [ -f "$SANDBOX_PID_FILE" ]; then
    OLD_PID=$(cat "$SANDBOX_PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Killing existing sandbox (PID: $OLD_PID)..."
        kill "$OLD_PID" || true
        sleep 2
    fi
    rm -f "$SANDBOX_PID_FILE"
fi

echo "Starting Canton Sandbox on port $PORT..."

# Try dpm first (Canton 3.x), fall back to daml (2.x)
if command -v dpm &> /dev/null; then
    dpm sandbox \
        --port "$PORT" \
        --dar "$DAR_PATH" \
        > "$LOG_FILE" 2>&1 &
else
    daml sandbox \
        --port "$PORT" \
        --dar "$DAR_PATH" \
        > "$LOG_FILE" 2>&1 &
fi

SANDBOX_PID=$!
echo "$SANDBOX_PID" > "$SANDBOX_PID_FILE"

# Wait for sandbox to be healthy
echo "Waiting for sandbox to be ready..."
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf "http://localhost:${PORT}/v2/version" > /dev/null 2>&1; then
        echo "Sandbox ready!"
        echo "Ledger API: localhost:${PORT}"
        echo "PID: $SANDBOX_PID"
        echo "Log: $LOG_FILE"
        exit 0
    fi

    # Check if process is still running
    if ! kill -0 "$SANDBOX_PID" 2>/dev/null; then
        echo "ERROR: Sandbox process died. Check logs:"
        tail -20 "$LOG_FILE"
        exit 1
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
done

echo "ERROR: Sandbox did not become ready within ${MAX_RETRIES} seconds"
echo "Last 20 lines of log:"
tail -20 "$LOG_FILE"
exit 1
