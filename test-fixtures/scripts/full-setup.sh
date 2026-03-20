#!/bin/bash
# Full test environment setup: build DAR, start sandbox, setup data
# Usage: ./full-setup.sh [PORT]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=${1:-6865}

echo "=== CantonTrace Full Test Setup ==="
echo ""

# Step 1: Build DAR
echo "Step 1/3: Building test DAR..."
bash "$SCRIPT_DIR/build-dar.sh"
echo ""

# Step 2: Start sandbox
echo "Step 2/3: Starting Canton Sandbox..."
bash "$SCRIPT_DIR/start-sandbox.sh" "$PORT"
echo ""

# Step 3: Setup test data
echo "Step 3/3: Populating test data..."
sleep 2  # Brief wait for sandbox to stabilize
bash "$SCRIPT_DIR/setup-test-data.sh" localhost "$PORT"
echo ""

echo "=== Setup Complete ==="
echo "Ledger API: localhost:${PORT}"
echo ""
echo "Test parties: Alice, Bob, Charlie"
echo "Test templates: SimpleToken, AgreementProposal, Agreement, ReferenceData,"
echo "                TokenWithRefData, FailingTemplate, AuthorizationTest,"
echo "                MultiPartyVisibility, ContentionTarget"
echo ""
echo "To stop: ./stop-sandbox.sh ${PORT}"
