#!/bin/bash
# Run the Daml Script to populate test data on a running sandbox
# Usage: ./setup-test-data.sh [LEDGER_HOST] [LEDGER_PORT]

set -euo pipefail

HOST=${1:-localhost}
PORT=${2:-6865}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAR_PATH="${SCRIPT_DIR}/../test-daml/.daml/dist/cantontrace-test-1.0.0.dar"
DAML_DIR="${SCRIPT_DIR}/../test-daml"

if [ ! -f "$DAR_PATH" ]; then
    echo "ERROR: Test DAR not found at $DAR_PATH"
    echo "  Run ./build-dar.sh first"
    exit 1
fi

echo "Setting up test data on ${HOST}:${PORT}..."

cd "$DAML_DIR"

if command -v dpm &> /dev/null; then
    dpm damlc script \
        --dar "$DAR_PATH" \
        --script-name Setup:setupTestData \
        --ledger-host "$HOST" \
        --ledger-port "$PORT"
elif command -v daml &> /dev/null; then
    daml script \
        --dar "$DAR_PATH" \
        --script-name Setup:setupTestData \
        --ledger-host "$HOST" \
        --ledger-port "$PORT"
else
    echo "ERROR: Neither dpm nor daml CLI found."
    exit 1
fi

echo "Test data setup complete!"
