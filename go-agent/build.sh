#!/bin/bash
# Build script for Vidsync Go Agent
# Compiles the agent binary to the correct location with the correct name

set -e

BINARY_NAME="vidsync-agent"
if [ "$(uname -s)" = "MINGW64_NT" ] || [ "$(uname -s)" = "MSYS_NT" ]; then
    BINARY_NAME="vidsync-agent.exe"
fi

echo "Building Vidsync Agent ($BINARY_NAME)..."

cd "$(dirname "$0")"

# Build with optimized flags
go build -o "$BINARY_NAME" ./cmd/agent

echo "✓ Build complete: $BINARY_NAME"
echo "✓ Location: $(pwd)/$BINARY_NAME"
echo "✓ Size: $(du -h $BINARY_NAME | cut -f1)"
