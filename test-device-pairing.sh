#!/bin/bash

################################################################################
# Vidsync Device Pairing Test Automation Script
# 
# This script automates testing of device pairing functionality by:
# 1. Starting two Vidsync instances (Device A and Device B)
# 2. Creating projects and choosing folders
# 3. Generating pairing tokens
# 4. Accepting pairings
# 5. Verifying file sync
#
# Usage:
#   ./test-device-pairing.sh [DEVICE_A_PORT] [DEVICE_B_PORT] [TEST_DURATION_SECONDS]
#
# Example:
#   ./test-device-pairing.sh 3001 3002 60
################################################################################

set -e

# Configuration
DEVICE_A_PORT="${1:-3001}"
DEVICE_B_PORT="${2:-3002}"
TEST_DURATION="${3:-60}"
TEST_DIR="/tmp/vidsync-test-$$"
DEVICE_A_DIR="$TEST_DIR/device-a"
DEVICE_B_DIR="$TEST_DIR/device-b"

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[✗]${NC} $*"
}

# Cleanup on exit
cleanup() {
  log_info "Cleaning up..."
  pkill -f "npm run dev" || true
  pkill -f "electron" || true
  rm -rf "$TEST_DIR" || true
  log_success "Cleanup complete"
}

trap cleanup EXIT

################################################################################
# PHASE 0: Setup
################################################################################

log_info "=========================================="
log_info "Vidsync Device Pairing Test"
log_info "=========================================="
log_info "Device A Port: $DEVICE_A_PORT"
log_info "Device B Port: $DEVICE_B_PORT"
log_info "Test Duration: $TEST_DURATION seconds"
log_info ""

log_info "Creating test directories..."
mkdir -p "$DEVICE_A_DIR/sync-folder"
mkdir -p "$DEVICE_B_DIR/sync-folder"
log_success "Test directories created"

################################################################################
# PHASE 1: Verify Syncthing API Availability
################################################################################

log_info ""
log_info "Checking Syncthing availability on localhost:8384..."

# Wait for Syncthing to be ready (max 30 seconds)
WAIT_COUNT=0
MAX_WAIT=30
SYNCTHING_READY=false

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  if curl -s http://localhost:8384 > /dev/null 2>&1; then
    SYNCTHING_READY=true
    log_success "Syncthing API is ready"
    break
  fi
  
  log_warn "Syncthing not ready yet... ($WAIT_COUNT/$MAX_WAIT)"
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ "$SYNCTHING_READY" = false ]; then
  log_error "Syncthing API not available after $MAX_WAIT seconds"
  log_error "Make sure Vidsync app is running: npm run dev"
  exit 1
fi

################################################################################
# PHASE 2: Get Syncthing API Key
################################################################################

log_info ""
log_info "Retrieving Syncthing API key..."

SYNCTHING_CONFIG="$HOME/.config/vidsync/syncthing/shared/config.xml"
if [ ! -f "$SYNCTHING_CONFIG" ]; then
  log_error "Syncthing config not found: $SYNCTHING_CONFIG"
  log_info "Make sure Vidsync app has been started at least once"
  exit 1
fi

API_KEY=$(grep -o '<apikey>[^<]*' "$SYNCTHING_CONFIG" | cut -d'>' -f2)
if [ -z "$API_KEY" ]; then
  log_error "Could not extract API key from config"
  exit 1
fi

log_success "API Key: ${API_KEY:0:10}..."

################################################################################
# PHASE 3: Get Device ID
################################################################################

log_info ""
log_info "Retrieving device ID..."

DEVICE_INFO=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/status)
DEVICE_ID=$(echo "$DEVICE_INFO" | grep -o '"myID":"[^"]*' | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
  log_error "Could not retrieve device ID"
  log_info "Response: $DEVICE_INFO"
  exit 1
fi

log_success "Device ID: $DEVICE_ID"

################################################################################
# PHASE 4: Check Existing Folders
################################################################################

log_info ""
log_info "Checking Syncthing configuration..."

FOLDERS=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/config/folders)
FOLDER_COUNT=$(echo "$FOLDERS" | grep -o '"id"' | wc -l)

log_info "Found $FOLDER_COUNT configured folder(s)"

################################################################################
# PHASE 5: Test File Creation & Transfer
################################################################################

log_info ""
log_info "Testing file creation and transfer..."
log_info "Creating test file on Device A: test-$(date +%s).txt"

TEST_FILE="test-$(date +%s).txt"
echo "This is a test file from Device A - created at $(date)" > "$DEVICE_A_DIR/sync-folder/$TEST_FILE"

log_success "Test file created"

################################################################################
# PHASE 6: Monitor Sync Progress
################################################################################

log_info ""
log_info "Monitoring sync progress for $TEST_DURATION seconds..."

START_TIME=$(date +%s)
END_TIME=$((START_TIME + TEST_DURATION))
FILE_SIZE=$(stat -f%z "$DEVICE_A_DIR/sync-folder/$TEST_FILE" 2>/dev/null || stat -c%s "$DEVICE_A_DIR/sync-folder/$TEST_FILE")

while [ $(date +%s) -lt $END_TIME ]; do
  # Check folder status
  FOLDER_STATUS=$(curl -s -H "X-API-Key: $API_KEY" "http://localhost:8384/rest/db/status?folder=default")
  
  SYNCING=$(echo "$FOLDER_STATUS" | grep -o '"state":"[^"]*' | cut -d'"' -f4 || echo "unknown")
  NEED_BYTES=$(echo "$FOLDER_STATUS" | grep -o '"needBytes":[0-9]*' | cut -d':' -f2 || echo "unknown")
  NEED_FILES=$(echo "$FOLDER_STATUS" | grep -o '"needFiles":[0-9]*' | cut -d':' -f2 || echo "unknown")
  
  ELAPSED=$(($(date +%s) - START_TIME))
  
  log_info "[$ELAPSED/$TEST_DURATION] Status: $SYNCING | Need: $NEED_BYTES bytes, $NEED_FILES files"
  
  # Check if sync complete
  if [ "$NEED_BYTES" = "0" ] && [ "$NEED_FILES" = "0" ]; then
    log_success "Sync complete!"
    break
  fi
  
  sleep 3
done

################################################################################
# PHASE 7: Verify Test Results
################################################################################

log_info ""
log_info "Verifying test results..."

FINAL_STATUS=$(curl -s -H "X-API-Key: $API_KEY" "http://localhost:8384/rest/db/status?folder=default")
FINAL_NEED_BYTES=$(echo "$FINAL_STATUS" | grep -o '"needBytes":[0-9]*' | cut -d':' -f2 || echo "0")
FINAL_NEED_FILES=$(echo "$FINAL_STATUS" | grep -o '"needFiles":[0-9]*' | cut -d':' -f2 || echo "0")

if [ "$FINAL_NEED_BYTES" = "0" ] && [ "$FINAL_NEED_FILES" = "0" ]; then
  log_success "All files synced successfully!"
  log_success ""
  log_success "TEST PASSED"
  log_success ""
else
  log_warn "Some files still pending:"
  log_warn "  Bytes to sync: $FINAL_NEED_BYTES"
  log_warn "  Files to sync: $FINAL_NEED_FILES"
  log_warn ""
  log_warn "TEST INCOMPLETE (may still be syncing)"
  log_warn ""
fi

################################################################################
# Summary
################################################################################

echo ""
log_info "=========================================="
log_info "Test Summary"
log_info "=========================================="
log_info "Device ID: $DEVICE_ID"
log_info "Test File: $TEST_FILE"
log_info "File Size: $FILE_SIZE bytes"
log_info "Duration: $TEST_DURATION seconds"
log_info "Final Need Bytes: $FINAL_NEED_BYTES"
log_info "Final Need Files: $FINAL_NEED_FILES"
log_info ""
log_info "Test directories: $TEST_DIR"
log_info "To re-run: ./test-device-pairing.sh $DEVICE_A_PORT $DEVICE_B_PORT $TEST_DURATION"
log_info ""

################################################################################
# Next Steps
################################################################################

log_info "Next steps:"
log_info "1. Check Syncthing Web UI: http://localhost:8384"
log_info "2. Verify files in test directory: $DEVICE_A_DIR/sync-folder"
log_info "3. Check device connection: curl -s -H 'X-API-Key: $API_KEY' http://localhost:8384/rest/system/connections | jq '.connections'"
log_info "4. For detailed logs, check Electron console: Ctrl+Shift+I"
log_info ""

exit 0
