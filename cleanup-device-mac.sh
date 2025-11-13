#!/bin/bash

##############################################################################
# Vidsync Device Cleanup Script for macOS
# 
# This script clears all Vidsync configuration from the current device,
# allowing you to test the app as if it's running on a fresh device.
#
# Usage:
#   ./cleanup-device-mac.sh
#
# WARNING: This will delete:
#   - ~/Library/Application Support/vidsync/ (Electron user data)
#   - All running Syncthing and Nebula processes
#
# It will NOT delete:
#   - System-wide Syncthing if installed via Homebrew
#   - Application source code
#   - Cloud data or remote devices
##############################################################################

set -e

echo "=========================================="
echo "Vidsync Device Cleanup (macOS)"
echo "=========================================="
echo ""
echo "WARNING: This will delete all local Vidsync configuration"
echo "Press Ctrl+C to cancel, or press Enter to continue..."
read -r _

echo ""
echo "Stopping all Vidsync processes..."

# Kill Syncthing instances started by Vidsync
pkill -f "syncthing -home.*Application Support/vidsync" || true
sleep 1

# Kill Nebula instances started by Vidsync  
pkill -f "nebula" || true
sleep 1

# Kill any remaining vidsync app processes (electron)
pkill -f "vidsync" || true
sleep 1

echo "✓ Processes stopped"
echo ""

# Backup config dir before deletion (optional)
BACKUP_DIR="$HOME/.vidsync-backup-$(date +%s)"
echo "Backing up configuration to: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

if [ -d "$HOME/Library/Application Support/vidsync" ]; then
  cp -r "$HOME/Library/Application Support/vidsync" "$BACKUP_DIR/config-vidsync" 2>/dev/null || true
  echo "✓ Backed up ~/Library/Application Support/vidsync"
fi

echo ""
echo "Removing configuration directories..."

# Remove Electron user data (includes Syncthing and Nebula configs)
if [ -d "$HOME/Library/Application Support/vidsync" ]; then
  rm -rf "$HOME/Library/Application Support/vidsync"
  echo "✓ Removed ~/Library/Application Support/vidsync"
fi

# Also check for legacy location if it exists
if [ -d "$HOME/.vidsync" ]; then
  rm -rf "$HOME/.vidsync"
  echo "✓ Removed ~/.vidsync"
fi

echo ""
echo "=========================================="
echo "✓ Cleanup complete!"
echo "=========================================="
echo ""
echo "Configuration backup saved at: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Start the app fresh: npm run dev"
echo "  2. Create a new project"
echo "  3. Set up network connection when prompted"
echo ""
