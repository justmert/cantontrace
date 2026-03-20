#!/bin/bash
# Allocate test parties (Alice, Bob, Charlie) on a running sandbox
# Usage: ./allocate-parties.sh [LEDGER_HOST] [LEDGER_PORT]
# Note: The Daml Script in setup-test-data.sh also allocates parties,
# but this script can be used independently via the gRPC API.

set -euo pipefail

HOST=${1:-localhost}
PORT=${2:-6865}

echo "Allocating test parties on ${HOST}:${PORT}..."

# Use grpcurl if available, otherwise fall back to HTTP JSON API
if command -v grpcurl &> /dev/null; then
    for PARTY in Alice Bob Charlie; do
        echo "Allocating party: $PARTY"
        grpcurl -plaintext \
            -d "{\"local_metadata\": {\"identifier\": \"${PARTY}\", \"display_name\": \"${PARTY}\"}}" \
            "${HOST}:${PORT}" \
            com.daml.ledger.api.v2.admin.PartyManagementService/AllocateParty \
            2>/dev/null || echo "Party $PARTY may already exist"
    done
elif command -v curl &> /dev/null; then
    for PARTY in Alice Bob Charlie; do
        echo "Allocating party: $PARTY"
        curl -sf -X POST "http://${HOST}:${PORT}/v2/parties" \
            -H "Content-Type: application/json" \
            -d "{\"local_metadata\": {\"identifier\": \"${PARTY}\", \"display_name\": \"${PARTY}\"}}" \
            2>/dev/null || echo "Party $PARTY may already exist"
    done
else
    echo "ERROR: Neither grpcurl nor curl found"
    exit 1
fi

echo "Party allocation complete!"
