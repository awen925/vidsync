#!/bin/bash

##############################################################################
# Vidsync Device Cleanup Script
# 
# This script clears all Vidsync configuration from the current device,
# allowing you to test the app as if it's running on a fresh device.
#
# Usage:
#   ./cleanup-device.sh
#
# WARNING: This will delete:
#   - ~/.config/vidsync/ (Electron user data, Syncthing config, Nebula config)
#   - ~/.vidsync/ (Legacy Nebula config)
#   - All running Syncthing and Nebula processes
#
# It will NOT delete:
#   - System-wide Syncthing if installed via package manager
#   - Application source code
#   - Cloud data or remote devices
##############################################################################

set -e

echo "=========================================="
echo "Vidsync Device Cleanup"
echo "=========================================="
echo ""
echo "WARNING: This will delete all local Vidsync configuration"
echo "Press Ctrl+C to cancel, or press Enter to continue..."
read -r _

echo ""
echo "Stopping all Vidsync processes..."

# Kill Syncthing instances started by Vidsync
pkill -f "syncthing -home.*\.config/vidsync" || true
sleep 1

# Kill Nebula instances started by Vidsync  
pkill -f "nebula.*vidsync" || true
sleep 1

# Kill any remaining vidsync app processes (electron)
pkill -f "vidsync" || true
sleep 1

echo "✓ Processes stopped"
echo ""

# Backup config dirs before deletion (optional)
BACKUP_DIR="$HOME/.vidsync-backup-$(date +%s)"
echo "Backing up configuration to: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

if [ -d "$HOME/.config/vidsync" ]; then
  cp -r "$HOME/.config/vidsync" "$BACKUP_DIR/config-vidsync" 2>/dev/null || true
  echo "✓ Backed up ~/.config/vidsync"
fi

if [ -d "$HOME/.vidsync" ]; then
  cp -r "$HOME/.vidsync" "$BACKUP_DIR/home-vidsync" 2>/dev/null || true
  echo "✓ Backed up ~/.vidsync"
fi

echo ""
echo "Removing configuration directories..."

# Remove Electron user data (includes Syncthing and Nebula configs)
if [ -d "$HOME/.config/vidsync" ]; then
  rm -rf "$HOME/.config/vidsync"
  echo "✓ Removed ~/.config/vidsync"
fi

# Remove legacy Nebula config
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
