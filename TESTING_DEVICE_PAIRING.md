#!/usr/bin/env node

/**
 * Vidsync Device Pairing Testing Guide
 * 
 * This document outlines the complete end-to-end testing flow for device pairing
 * using both Syncthing and Nebula for encrypted cross-device file synchronization.
 * 
 * Prerequisites:
 * - Two machines (physical or VMs)
 * - Vidsync app running on both machines
 * - Cloud backend accessible from both machines
 * - Elevated privileges available (for Nebula TUN device setup on Linux/macOS)
 */

const TESTING_GUIDE = `
================================================================================
VIDSYNC DEVICE PAIRING - END-TO-END TESTING GUIDE
================================================================================

PHASE 1: SETUP & PREREQUISITES
================================================================================

1.1 Clean Both Devices (Optional but Recommended)
    
    Device A (Linux):
    $ ./cleanup-device.sh
    
    Device B (macOS/Linux):
    $ ./cleanup-device-mac.sh  # macOS
    or
    $ ./cleanup-device.sh      # Linux
    
    This ensures a fresh test environment.

1.2 Start App on Both Devices

    Device A & B:
    $ cd /path/to/vidsync/electron
    $ npm run dev
    
    Expected: React dev server compiles, Electron app launches
    - Single Syncthing instance on port 8384
    - Agent running on port 29999
    - Nebula attempting to start (may fail if no config - that's OK)

1.3 Verify Initial Status

    Device A: Open http://localhost:3001
    - Projects page should be empty (or show your existing projects)
    - Console should show: "Device info from agent: { deviceId: '...', ... }"
    - Look for this Device Code - you'll need it in PHASE 2
    
    Device B: Open http://localhost:3001
    - Repeat for Device B
    - Note the different Device Code


PHASE 2: CREATE PROJECT & SETUP FOLDERS
================================================================================

2.1 Create Project on Device A

    Device A UI:
    1. Click "New Project"
    2. Name: "TestSync-PhaseA"
    3. Description: "Testing sync between Device A and Device B"
    4. Create project
    
    Expected:
    - Project appears in project list
    - Status shows "○ Not syncing" (Folder sync icon)

2.2 Choose Folder on Device A

    Device A UI:
    1. Open project "TestSync-PhaseA"
    2. Click "Choose Folder"
    3. Select a test folder with some files (e.g., ~/test-sync-a/)
    
    Expected:
    - Folder path appears below button
    - Status changes to "↻ Syncing..."
    - Console shows: "[Syncthing:shared] Adding folder 'Project: ...'"
    - After 10-15 seconds: Status changes to "✓ Folder synced"
    
    ✓ Device A: PHASE 2.2 COMPLETE


PHASE 3: NETWORK SETUP (OPTIONAL but Recommended for Real Testing)
================================================================================

3.1 Generate Network Config on Device A

    Device A UI:
    1. In project, click "Set up network connection"
    2. Status panel shows: "Network configured at: /path/to/nebula/..."
    3. Click "View files"
    4. Files should include: nebula.yml, ca.crt, node.key, node.crt
    
    Note: If you see errors about "node.key: no such file", that's the bundle 
          extraction issue. Check console logs for details.

3.2 (Advanced) Test Nebula Setup with Elevation

    Device A UI:
    1. Scroll down in project
    2. Look for network setup section (if implemented)
    3. If Nebula needs elevation:
       - Click "Apply setcap (with elevation)"
       - Confirm elevation prompt
       - Nebula should start
       - Console should show: "[Nebula] My ID: ..." after ~5 seconds

    Note: Without Nebula elevation, devices can still sync over:
          - Local network (mDNS)
          - Via relay servers
          But NOT over direct encrypted overlay network


PHASE 4: DEVICE PAIRING & INVITE TOKENS
================================================================================

4.1 Create Invite Token on Device A

    Device A UI:
    1. In project, look for "Generate Invite" button
    2. Console should show token generation (check logs)
    3. Token appears in UI (12-character hex code like "a1b2c3d4e5f6")
    4. Share this token with Device B operator
    
    Expected Console Output:
    POST /pairings
    Response: { token: "a1b2c3d4e5f6", from_device_id: "..." }

4.2 Get Your Device Code on Device A

    Device A UI:
    1. Scroll to "Connect & Sync with Devices" section
    2. Your Device Code field shows: "JVYXTTV-2EHG5R5-R7LMCPC-..." (long string)
    3. Click "Copy" button
    4. Share this code with Device B operator
    
    This is the Syncthing device identifier


PHASE 5: ACCEPT PAIRING ON DEVICE B
================================================================================

5.1 Create Project on Device B (OPTIONAL - Alternative Method)

    Option A: Create matching project on Device B
    Device B UI:
    1. Create project "TestSync-PhaseB" 
    2. Choose folder (e.g., ~/test-sync-b/)
    3. Skip to 5.3
    
    Option B: Wait for Device A to import you (use Device Code method)
    Skip to 5.3

5.2 Accept Invite via Token (If Device A generated one)

    Device B UI:
    1. Open or create project where you want to sync
    2. Scroll to "Connect & Sync with Devices"
    3. Paste the token from Device A into input field: "a1b2c3d4e5f6"
    4. Click "Connect Device"
    
    Expected:
    - Status message: "Device connected. Files will sync shortly."
    - Console shows: POST /pairings/a1b2c3d4e5f6/accept
    - Syncthing starts importing the folder

5.3 Accept Invite via Device Code (Alternative Method)

    If you want to manually connect instead of using tokens:
    
    Device B UI:
    1. Scroll to "Connect & Sync with Devices"
    2. Paste Device A's Device Code into input field
    3. Click "Connect Device"
    
    Expected:
    - Status message: "Device connected."
    - Syncthing starts importing folder
    - Check Syncthing API to verify device was added


PHASE 6: VERIFY SYNC IS WORKING
================================================================================

6.1 Check Syncthing API (Both Devices)

    Device A & B:
    $ export API_KEY=$(cat ~/.config/vidsync/syncthing/shared/config.xml | grep -o '<apikey>[^<]*' | cut -d'>' -f2)
    
    $ curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/config | jq '.folders'
    
    Expected:
    - Both devices show same folder with two device entries
    - Example folder "Project: a1b2c3d4-..." with both device IDs
    
    Device A ID: JVYXTTV-2EHG5R5-R7LMCPC-Z5CZLM4-...
    Device B ID: (different long string)

6.2 Check Connected Devices

    Device A & B:
    $ curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/connections | jq '.connections'
    
    Expected:
    - Connected devices listed with their IDs
    - Connection type: "relay" or "direct" or "local"
    - Address showing connection IP/port

6.3 Check Folder Status

    Device A & B:
    $ curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/db/status?folder=PROJECT_FOLDER_ID | jq '.'
    
    Expected:
    - "state": "syncing" or "idle"
    - If syncing: "needBytes" should decrease as sync progresses
    - Eventually "needFiles": 0 and "needBytes": 0 (fully synced)


PHASE 7: VERIFY FILE TRANSFER
================================================================================

7.1 Create Test Files on Device A

    Device A Terminal:
    $ cd ~/test-sync-a/
    $ echo "Hello from Device A" > test.txt
    $ dd if=/dev/urandom of=large-file.bin bs=1M count=10  # 10MB test file
    
    Expected:
    - Syncthing detects new files
    - Status shows sync in progress

7.2 Monitor Progress on Device A

    Device A Console:
    - Look for Syncthing messages: "Completed initial scan"
    - UI should show progress % (if progress UI implemented)
    - Check terminal: `watch -n 1 'ls -lah ~/test-sync-a/'`

7.3 Wait for Sync to Device B (5-30 seconds depending on file size)

    Device B Terminal:
    $ watch -n 1 'ls -lah ~/test-sync-b/'
    
    Expected:
    - test.txt appears with content "Hello from Device A"
    - large-file.bin gradually grows from 0 to 10MB
    - Eventually both files complete

7.4 Verify File Integrity

    Device B Terminal:
    $ md5sum ~/test-sync-b/test.txt ~/test-sync-b/large-file.bin
    
    Device A Terminal:
    $ md5sum ~/test-sync-a/test.txt ~/test-sync-a/large-file.bin
    
    Expected:
    - MD5 hashes match (files are identical)

7.5 Test Bi-Directional Sync

    Device B:
    $ echo "Hello from Device B" > ~/test-sync-b/response.txt
    
    Device A Terminal:
    $ watch -n 1 'ls -lah ~/test-sync-a/'
    
    Expected:
    - response.txt appears on Device A
    - Content is "Hello from Device B"


PHASE 8: NEBULA OVERLAY NETWORK (Optional - Advanced Test)
================================================================================

8.1 Verify Nebula is Running (Both Devices)

    Device A & B Terminal:
    $ ps aux | grep nebula
    
    Expected:
    - Nebula process running (not just binary, but executing)
    - Check for TUN device: `ip link show` (Linux) or `ifconfig` (macOS)

8.2 Check Nebula Status

    Device A & B Terminal:
    $ cat ~/.config/vidsync/nebula/*/nebula.yml
    
    Expected:
    - Configuration file exists
    - Contains lighthouse settings and device IPs
    - Check Electron console for Nebula connection logs

8.3 Monitor Nebula Connections

    If Nebula is running, check console for messages like:
    "[Nebula] My ID: ..." 
    "[Nebula] Connected to lighthouse"
    
    If you see TUN IP assignment, Nebula is working properly


PHASE 9: TROUBLESHOOTING & DEBUG CHECKS
================================================================================

9.1 If Files Don't Sync

    Check 1: Syncthing Running?
    $ ps aux | grep syncthing | grep -v grep
    
    Check 2: API Accessible?
    $ curl -I http://localhost:8384
    Expected: 401 (Unauthorized - auth required) or 200
    
    Check 3: Devices Connected?
    $ curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/connections
    
    Check 4: Folder Configured on Both?
    $ curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/config/folders
    
    Check 5: Logs
    - Device A Console: Ctrl+Shift+I to open DevTools, check Console tab
    - Check terminal output for [Syncthing:shared] messages

9.2 If Sync is Slow

    Causes:
    - Using relay servers (slower than direct)
    - Network connectivity issues
    - Large file sizes
    
    Check:
    $ curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/connections | jq '.connections[] | select(.address != "relay")'
    
    If only relay connections, devices are not directly connected

9.3 If Nebula Shows Errors

    Error: "Could not load client cert ... node.key: no such file"
    - Solution: Bundle extraction failed. Check bundle:extract handler in console
    - Try: Regenerate network config, ensure ZIP is valid base64
    
    Error: "TUN device creation requires elevated privileges"
    - Solution: Normal on Linux. Either:
      a) Run app with sudo
      b) Click "Apply setcap (with elevation)" to grant permissions
      c) Manually: sudo setcap cap_net_admin+ep /path/to/nebula
    
    Error: "Could not connect to lighthouse"
    - Solution: Network connectivity issue. Check firewall rules


PHASE 10: EXPECTED RESULTS & SUCCESS CRITERIA
================================================================================

✓ TEST PASSING IF:

1. Device Discovery
   ✓ Both devices visible to each other via Syncthing
   ✓ At least one connection type works (direct, relay, or local)

2. File Transfer
   ✓ Files created on Device A appear on Device B within 30 seconds
   ✓ Files created on Device B appear on Device A within 30 seconds
   ✓ MD5 hashes match (file integrity verified)

3. Multiple File Types
   ✓ Small text files sync correctly
   ✓ Large binary files sync without corruption
   ✓ Directory structures preserved

4. UI Responsiveness
   ✓ Status updates in real-time
   ✓ No crashes or errors when adding devices
   ✓ Progress shows activity

5. Device Code / Invite Token
   ✓ Device code properly displayed and copyable
   ✓ Invite tokens work to add remote device
   ✓ Pairing persists after app restart

6. Error Handling
   ✓ Clear error messages if pairing fails
   ✓ Graceful handling of network disconnections
   ✓ Recovery without app restart


LOGGING & DEBUGGING
================================================================================

Check these for detailed information:

1. Electron Console (DevTools)
   - Ctrl+Shift+I to open
   - Console tab shows all app messages
   - Network tab shows API calls

2. Terminal Output
   - [Syncthing:shared] - Syncthing internal logs
   - [Nebula] - Nebula network logs
   - [Agent] - Go agent logs

3. Config Files

   Syncthing:
   ~/.config/vidsync/syncthing/shared/config.xml
   
   Nebula (if setup):
   ~/.config/vidsync/nebula/*/nebula.yml
   
   API Keys:
   grep '<apikey>' ~/.config/vidsync/syncthing/shared/config.xml

4. Syncthing Web UI
   Open http://localhost:8384 in browser
   - Shows folder status
   - Shows connected devices
   - Shows sync progress
   - Can trigger manual rescans


CLEANUP FOR NEXT TEST
================================================================================

To reset both devices for a fresh test:

$ ./cleanup-device.sh          # Linux
$ ./cleanup-device-mac.sh      # macOS
$ cleanup-device.bat           # Windows

Or manually:
$ rm -rf ~/.config/vidsync ~/.vidsync
$ pkill syncthing; pkill nebula


DOCUMENTATION REFERENCES
================================================================================

- Syncthing REST API: https://docs.syncthing.net/rest/index.html
- Nebula: https://github.com/slackhq/nebula
- Vidsync Architecture: See COMPLETE_REFERENCE.md
- Cloud API: See cloud/README.md


END OF TESTING GUIDE
================================================================================
`;

console.log(TESTING_GUIDE);
