#!/bin/bash
# Build the test DAR file
# Usage: ./build-dar.sh

set -euo pipefail

DAML_DIR="$(cd "$(dirname "$0")/../test-daml" && pwd)"

echo "Building test DAR..."

cd "$DAML_DIR"

if command -v dpm &> /dev/null; then
    dpm damlc build
elif command -v daml &> /dev/null; then
    daml build
else
    echo "ERROR: Neither dpm nor daml CLI found."
    exit 1
fi

DAR_PATH=".daml/dist/cantontrace-test-1.0.0.dar"

if [ -f "$DAR_PATH" ]; then
    echo "DAR built successfully: $DAR_PATH"
    echo "Size: $(du -h "$DAR_PATH" | cut -f1)"
else
    echo "ERROR: DAR file not found after build"
    exit 1
fi
