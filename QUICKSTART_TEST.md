# Quick Start: Deploy & Test Nebula + Syncthing

## TL;DR - 5 Minute Setup

### Step 1: Copy CA from AWS (1 min)

```bash
cd /home/fograin/work1/vidsync

# Replace YOUR_LIGHTHOUSE_IP with actual IP
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/etc/nebula/ca.crt cloud/bin/ca.crt
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/etc/nebula/ca.key cloud/bin/ca.key

# Verify
chmod 644 cloud/bin/ca.crt
chmod 600 cloud/bin/ca.key
ls -la cloud/bin/ca.* 
```

### Step 2: Start Cloud Backend (1 min)

```bash
cd cloud
npm start
# Should print: Server running on port 3000
```

### Step 3: Start Electron Frontend (1 min)

```bash
cd ../electron
npm start
# Electron window should open
```

### Step 4: Create Test Project (1 min)

1. Navigate to Projects page
2. Create project:
   - Name: "Test Project"
   - Folder: Select any local folder (e.g., ~/test-sync)
3. Click "Create Project"
4. Auto-redirected to project detail

### Step 5: Test Features (1 min)

**Syncthing Status**:
- Should see status badge next to folder path
- Within ~5 seconds, should turn green: "Syncthing folder configured"

**Nebula Config**:
- Click "Generate Nebula Config" button
- Should show: "✓ Config generated at: /path/to/nebula/{id}"
- Click "Open Nebula Folder"
- File explorer opens showing:
  - `nebula.yml`
  - `ca.crt`
  - `node.crt` (placeholder)
  - `node.key` (placeholder)
  - `README.md`

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
