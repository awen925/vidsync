# Quick Test Guide - Device Pairing (Updated)

## 🚀 Start Here

### Step 1: Start the Vidsync App
```bash
cd /home/fograin/work1/vidsync/electron
npm run dev
```

**Wait for this message** (15-20 seconds):
```
> Syncthing server running on http://localhost:8384
```

### Step 2: Run the Automated Test
**In a NEW terminal:**
```bash
cd /home/fograin/work1/vidsync
./test-device-pairing.sh
```

## ✅ Expected Output

```
[INFO] ==========================================
[INFO] Vidsync Device Pairing Test
[INFO] ==========================================
[INFO] Device A Port: 3001
[INFO] Device B Port: 3002
[INFO] Test Duration: 60 seconds
[INFO]
[INFO] Creating test directories...
[✓] Test directories created
[INFO]
[INFO] Checking Syncthing availability on localhost:8384...
[✓] Syncthing API is ready
[INFO]
[INFO] Retrieving Syncthing API key...
[✓] API Key: 2thLAHay9i...
[INFO]
[INFO] Retrieving device ID...
[✓] Device ID: JVYXTTV-2EHG5R5-R7LMCPC-Z5CZLM4-EFVUNZD-VFIUNG5-YCXBT5H-BGNSSA5
[INFO]
[INFO] Checking Syncthing configuration...
[INFO] Found 1 configured folder(s)
[INFO]
[INFO] Testing file creation and transfer...
[INFO] Creating test file on Device A: test-1731486450.txt
[✓] Test file created
[INFO]
[INFO] Monitoring sync progress for 60 seconds...
[INFO] [0/60] Status: idle | Need: 0 bytes, 0 files
[INFO] [3/60] Status: idle | Need: 0 bytes, 0 files
[INFO] [6/60] Status: idle | Need: 0 bytes, 0 files
[✓] Sync complete!
[INFO]
[INFO] Verifying test results...
[✓] All files synced successfully!
[✓]
[✓] TEST PASSED
[✓]
[INFO] ==========================================
[INFO] Test Summary
[INFO] ==========================================
[INFO] Device ID: JVYXTTV-2EHG5R5-R7LMCPC-Z5CZLM4-EFVUNZD-VFIUNG5-YCXBT5H-BGNSSA5
[INFO] Test File: test-1731486450.txt
[INFO] File Size: 82 bytes
[INFO] Duration: 60 seconds
[INFO] Final Need Bytes: 0
[INFO] Final Need Files: 0
```

## 🔧 Customization

### Run with Custom Duration
```bash
./test-device-pairing.sh 120        # 120 second test
./test-device-pairing.sh 300        # 300 second test (for larger files)
```

### Run with Custom Ports
```bash
./test-device-pairing.sh 3001 3002 120   # Custom device ports and duration
```

## ❌ Troubleshooting

### "Syncthing API not available"
**Problem**: Syncthing hasn't started yet or is not running

**Solution**:
```bash
# Make sure app is running in Terminal 1
# Terminal 1 should show: "Syncthing server running on http://localhost:8384"
# Wait at least 15-20 seconds after seeing this message before running test
```

### "Could not retrieve device ID"
**Problem**: Syncthing API is running but response format is unexpected

**Check**: 
```bash
# Manually test the API in a terminal
curl -H "X-API-Key: $(grep -o '<apikey>[^<]*' ~/.config/vidsync/syncthing/shared/config.xml | cut -d'>' -f2)" \
  http://localhost:8384/rest/system/status | jq .myID
```

Should output a Device ID like: `"JVYXTTV-2EHG5R5-R7LMCPC-Z5CZLM4-EFVUNZD-VFIUNG5-YCXBT5H-BGNSSA5"`

### "Could not extract API key from config"
**Problem**: Config file doesn't exist

**Solution**:
```bash
# Start the app at least once to generate config
cd /home/fograin/work1/vidsync/electron
npm run dev
# Let it run for 10 seconds to create config, then Ctrl+C
```

## 📊 What the Test Does

1. **Setup** (2 sec)
   - Creates temporary test directories
   - Verifies Syncthing is running

2. **API Verification** (1 sec)
   - Retrieves API key from config
   - Verifies authentication works

3. **Device Discovery** (1 sec)
   - Gets Device ID from Syncthing
   - Gets list of configured folders

4. **Test Execution** (5-60 sec depending on duration)
   - Creates test file
   - Monitors sync progress
   - Checks needBytes and needFiles

5. **Results** (1 sec)
   - Verifies all files synced
   - Reports success or warnings
   - Cleans up test files

## 📈 Success Criteria

✅ **Must Pass**:
- Device ID retrieved successfully
- Syncthing API responds correctly
- Test file created
- Sync completes with 0 needBytes and 0 needFiles

✅ **Nice to Have**:
- Sync completes in <10 seconds
- No errors or warnings in output
- Test runs multiple times without issues

## 🚨 Real Device Testing

For testing with two actual devices:

1. **Device A (Initiator)**:
   ```bash
   cd /home/fograin/work1/vidsync/electron
   npm run dev
   # Copy the Device ID
   ```

2. **Device B (Acceptor)**:
   ```bash
   # Start Device B's app
   cd /home/fograin/work1/vidsync/electron
   npm run dev
   # UI will show "Accept Device Code"
   ```

3. **In Device A's UI**:
   - Click "Generate Invite Code"
   - Share the code with Device B

4. **In Device B's UI**:
   - Enter the invite code
   - Accept the pairing

5. **Verify Sync**:
   - Create files on Device A
   - Confirm they appear on Device B
   - Check sync status at http://localhost:8384

## 📖 Related Documentation

- **TESTING_DEVICE_PAIRING.md** - Full 10-phase manual testing guide
- **TEST_SCRIPT_FIXES.md** - Technical details about the fix
- **FIX_SUMMARY.md** - What was fixed and why
- **TASK5_COMPLETE.md** - Complete Task #5 summary

## ✨ Next Steps

After confirming the test works:

1. ✅ **Automated Testing Works** (just verified)
2. 🔄 **Next**: Manual testing with two devices (follow TESTING_DEVICE_PAIRING.md)
3. 🔄 **Then**: Proceed to Task #6 (error handling & retry logic)

---

**Last Updated**: 2025-11-13
**Status**: ✅ Ready for testing
**Test Duration**: ~1 minute per run

## Manual Testing Steps

### Pre-flight Checks

```bash
# Verify Syncthing binary exists
ls -la go-agent/bin/syncthing/syncthing

# Verify nebula-cert binary exists
ls -la go-agent/bin/nebula/nebula-cert

# Verify CA files
ls -la cloud/bin/ca.crt cloud/bin/ca.key
```

### Verify Syncthing Integration

**In Electron Console (DevTools)**:
1. Look for log: `[Syncthing:xxx] Started`
2. Look for log: `[Syncthing:xxx] Folder added`
3. Open http://localhost:8384 (Syncthing web UI)
4. Should see folder with name like "Project: {id}"

### Verify Nebula Integration

**In Cloud Logs**:
```bash
# In another terminal, watch cloud logs
cd cloud && npm start 2>&1 | grep -i nebula

# Should see requests to:
# POST /api/nebula/sign
# GET /api/nebula/config/...
```

**Check Generated Files**:
```bash
# On Linux
find ~/.vidsync/nebula -type f -ls

# Should show structure:
# ~/.vidsync/nebula/
# └── {projectId}/
#     ├── nebula.yml (600 bytes, mode 0600)
#     ├── ca.crt (1500 bytes, mode 0644)
#     ├── node.crt (placeholder, mode 0644)
#     ├── node.key (placeholder, mode 0600)
#     └── README.md (2000+ bytes, mode 0600)
```

## Troubleshooting

### Problem: "CA files not found"

**Solution**:
```bash
# Check if files exist and are readable
ls -la cloud/bin/ca.crt cloud/bin/ca.key

# If missing, copy from AWS:
scp -i key.pem ec2-user@IP:/etc/nebula/ca.* cloud/bin/

# Set permissions
chmod 644 cloud/bin/ca.crt
chmod 600 cloud/bin/ca.key
```

### Problem: Syncthing status shows "Syncthing stopped"

**Solution**:
1. Check Syncthing binary: `ls -la go-agent/bin/syncthing/syncthing`
2. Check permissions: `chmod +x go-agent/bin/syncthing/syncthing`
3. Check logs in DevTools console for errors
4. Manually start: `go-agent/bin/syncthing/syncthing -home ~/.vidsync/syncthing/test-project`

### Problem: "Open Nebula Folder" button does nothing

**Solution** (Linux):
```bash
# Manually open folder
xdg-open ~/.vidsync/nebula/{projectId}

# Or check if folder exists
ls -la ~/.vidsync/nebula/
```

### Problem: Config files not generated

**Check**:
1. Look at cloud logs for errors
2. Verify CA files readable: `file cloud/bin/ca.crt`
3. Check Electron console (DevTools) for error messages
4. Try clicking button again

## Next Steps After Testing

### If Everything Works ✓

1. **Test on Real Network**:
   ```bash
   # Copy nebula config to another device
   scp -r ~/.vidsync/nebula/PROJECT_ID user@otherdevice:~/.vidsync/nebula/
   
   # Start Nebula on both devices
   nebula -config ~/.vidsync/nebula/PROJECT_ID/nebula.yml
   ```

2. **Verify Network Connectivity**:
   ```bash
   # Get your Nebula IP (check nebula logs or /etc/hosts)
   ping <other-device-nebula-ip>
   ```

3. **Configure Lighthouse IP**:
   - Edit `~/.vidsync/nebula/PROJECT_ID/nebula.yml`
   - Set lighthouse: hosts: ["YOUR_LIGHTHOUSE_IP:4242"]
   - Restart Nebula

### If Something Breaks

1. **Check Logs**:
   ```bash
   # Electron main process errors
   DevTools → Console tab
   
   # Cloud API errors
   npm start in cloud/ (watch output)
   ```

2. **Reset Everything**:
   ```bash
   # Remove generated configs
   rm -rf ~/.vidsync/nebula/
   rm -rf ~/.vidsync/syncthing/
   
   # Fresh start: create new project
   ```

3. **Check File Permissions**:
   ```bash
   # Should see:
   chmod 644 ~/.vidsync/nebula/PROJECT_ID/ca.crt
   chmod 600 ~/.vidsync/nebula/PROJECT_ID/node.key
   chmod 600 cloud/bin/ca.key
   ```

## Architecture Refresh

```
Your Dev Machine:
├── Electron App
│   ├── Generates nebula.yml locally
│   ├── Displays Syncthing status
│   └── Opens file explorer
│
└── Cloud Backend (npm start)
    ├── /api/nebula/sign endpoint (ready)
    ├── /api/nebula/config endpoint (ready)
    └── Reads CA from cloud/bin/

Your AWS EC2 (Lighthouse):
├── Nebula lighthouse service running
├── ca.crt (copied to cloud/bin/)
└── ca.key (copied to cloud/bin/)
```

## Success Criteria

- [ ] Syncthing status shows "configured" (green)
- [ ] Nebula config generates without errors
- [ ] Can open folder and see 5 files
- [ ] nebula.yml is properly formatted YAML
- [ ] README.md has setup instructions
- [ ] Can manually edit nebula.yml and set lighthouse IP
- [ ] Cloud API ready for cert signing
- [ ] No TypeScript compilation errors

If all ✓, **Phase 2 is complete and ready for real deployment!**

---

## Contacts & Resources

- Nebula docs: https://nebula.defined.net/
- Syncthing docs: https://syncthing.net/
- Your lighthouse server: `YOUR_LIGHTHOUSE_IP:4242`
- Your cloud backend: `http://localhost:3000/api/nebula`
