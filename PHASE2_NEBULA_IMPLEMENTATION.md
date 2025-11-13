# Nebula PKI & Configuration Implementation

## Overview

This implementation enables automated Nebula P2P network configuration generation with PKI managed centrally on the cloud backend. Each user/device gets a unique certificate signed by your AWS EC2 lighthouse CA.

## Architecture

```
┌─────────────────┐          ┌────────────────┐          ┌────────────────┐
│  Electron App   │          │  Cloud API     │          │  AWS EC2       │
│                 │          │                │          │  Lighthouse    │
│  - UI button    │          │  - nebula-cert │          │                │
│  - Config gen   │◄────────►│  - CA reader   │◄────────►│  - ca.crt      │
│  - File save    │  HTTP    │  - Cert signer │  SSH     │  - ca.key      │
│  - Open folder  │          │  - Sign API    │          │  - nebula cfg  │
└─────────────────┘          └────────────────┘          └────────────────┘
```

## Setup Steps

### Step 1: Copy CA Files from AWS Lighthouse

```bash
# SSH into your EC2 lighthouse and copy the CA files
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/etc/nebula/ca.crt ./cloud/bin/ca.crt
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/etc/nebula/ca.key ./cloud/bin/ca.key

# Set permissions
chmod 644 cloud/bin/ca.crt
chmod 600 cloud/bin/ca.key
```

### Step 2: Verify Files

```bash
ls -la cloud/bin/ca.*
# Should show:
# -rw-r--r-- ca.crt
# -rw------- ca.key
```

### Step 3: Deploy Cloud Backend

The cloud API now has `/api/nebula/sign` endpoint that uses `nebula-cert` to sign certificates.

```bash
cd cloud
npm install  # if nebula-cert not already in go-agent/bin
npm run build
npm start
```

### Step 4: Test Nebula Config Generation (Electron)

1. Start the Electron app
2. Open a project detail page
3. Click "Generate Nebula Config"
4. Click "Open Nebula Folder" to see generated files
5. Check the folder for:
   - `nebula.yml` — Main configuration (edit to add lighthouse IP)
   - `node.crt` — Device certificate
   - `node.key` — Device private key
   - `ca.crt` — CA certificate
   - `README.md` — Setup instructions

## Files Modified/Created

### Electron (Main Process)

**New**: `electron/src/main/nebulaManager.ts`
- Resolves nebula-cert binary and CA cert paths
- Generates nebula.yml config file
- Copies CA cert locally (if available)
- Writes README with setup instructions
- Methods:
  - `generateConfig()` — Creates config files
  - `generateAndZip()` — Bundle files (future)

**Updated**: `electron/src/main/main.ts`
- Instantiated NebulaManager
- Registered IPC handlers:
  - `nebula:generateConfig` — Trigger config generation
  - `nebula:openFolder` — Open config folder in OS file explorer
  - `nebula:getPath` — Get path to config folder

**Updated**: `electron/src/main/preload.ts`
- Exposed new IPC methods to renderer:
  - `api.nebulaGenerateConfig(projectId, opts)`
  - `api.nebulaOpenFolder(projectId)`
  - `api.nebulaGetPath(projectId)`

### Electron (Renderer)

**Updated**: `electron/src/renderer/pages/Projects/ProjectDetailPage.tsx`
- Added Syncthing folder status indicator (polls every 3s)
  - Green: "Syncthing folder configured"
  - Amber: "Syncthing running — folder not configured"
  - Grey: "Syncthing stopped"
- Added Nebula section with:
  - "Generate Nebula Config" button
  - Status display (success with path or error)
  - "Open Nebula Folder" button (opens file explorer)

### Cloud Backend

**New**: `cloud/src/api/nebula/routes.ts`
- `POST /api/nebula/sign` — Sign certificate for device
  - Finds CA files (ca.crt + ca.key)
  - Calls `nebula-cert sign` to generate node.crt + node.key
  - Returns certificate data in JSON
  - Cleans up temporary files
- `GET /api/nebula/config/:projectId` — Get config template
  - Returns nebula.yml config template
  - User fills in lighthouse IP and other settings

**Updated**: `cloud/src/app.ts`
- Imported nebula routes
- Mounted at `/api/nebula`

### Configuration

**New**: `cloud/bin/ca.crt.README.md`
- Instructions for copying CA from EC2 lighthouse

**Updated**: `cloud/bin/README.md`
- Full setup guide for CA cert management

## How It Works

### User Flow: Generate Nebula Config

```
1. User opens Project detail page
   ↓
2. Sees "Generate Nebula Config" button
   ↓
3. Clicks button
   ↓
4. NebulaManager (in Electron main):
   - Creates folder: ~/.vidsync/nebula/{projectId}/
   - Copies ca.crt from cloud/bin/ca.crt
   - Generates nebula.yml with placeholder lighthouse
   - Writes comprehensive README.md
   ↓
5. UI shows: "Config generated at: /path/to/nebula/{projectId}"
   ↓
6. User clicks "Open Nebula Folder"
   ↓
7. File explorer opens showing:
   - nebula.yml (edit to add lighthouse IP)
   - ca.crt (CA certificate)
   - node.crt (device certificate, placeholder)
   - node.key (device key, placeholder)
   - README.md (setup instructions)
   ↓
8. User manually edits nebula.yml:
   - Sets lighthouse: hosts: ["YOUR_IP:4242"]
   - Configures other settings as needed
   ↓
9. User copies files to Nebula config directory
   ↓
10. User starts Nebula: nebula -config nebula.yml
    ↓
11. Device connects to lighthouse and gets Nebula VPN IP
```

### Future: Cloud-Signed Certificates

When cloud API has ca.key, Electron can call:

```typescript
const certResponse = await cloudAPI.post('/api/nebula/sign', {
  projectId,
  deviceName: 'my-device'
});

// certResponse contains:
// {
//   certificate: "-----BEGIN CERT...",
//   key: "-----BEGIN KEY...",
//   ca: "-----BEGIN CERT...",
// }

// Write to files:
fs.writeFileSync('node.crt', certResponse.certificate);
fs.writeFileSync('node.key', certResponse.key);
```

Currently generates placeholders — will be auto-populated after cloud API integration.

## File Locations

### Electron (User Data)

```
~/.vidsync/nebula/
├── {projectId1}/
│   ├── nebula.yml
│   ├── ca.crt
│   ├── node.crt
│   ├── node.key
│   └── README.md
├── {projectId2}/
│   └── ...
```

### Cloud (Repository)

```
cloud/
├── bin/
│   ├── ca.crt           ← Copy from AWS EC2
│   ├── ca.key           ← Copy from AWS EC2 (keep secure)
│   ├── ca.crt.README.md (setup instructions)
│   └── README.md        (general bin/ guide)
└── src/
    └── api/
        └── nebula/
            └── routes.ts (new API endpoints)
```

## Security Considerations

### CA Key Protection

- **Never** commit `ca.key` to git
- Add to `.gitignore`: `cloud/bin/ca.key`
- Use restrictive permissions: `chmod 600 ca.key`
- Store backups securely
- Rotate regularly per security policy
- In production, consider using:
  - AWS Secrets Manager
  - HashiCorp Vault
  - SSH key on separate secure host

### Node Certificate

- `node.key` is per-device private key
- User responsible for keeping it secret
- Don't share outside organization
- Store securely after generating
- Can be revoked and regenerated if compromised

### Lighthouse IP

- Currently hardcoded in README as placeholder
- User must set in their nebula.yml
- Could be auto-filled if stored in project settings
- Should use DNS name in production for flexibility

## Troubleshooting

### "CA files not found" Error

**Symptom**: Nebula config generation fails with "CA files not found"

**Cause**: `cloud/bin/ca.crt` or `cloud/bin/ca.key` not copied

**Fix**:
```bash
# Copy from AWS EC2
scp -i key.pem ec2-user@IP:/etc/nebula/ca.crt cloud/bin/ca.crt
chmod 644 cloud/bin/ca.crt
```

### nebula-cert Not Found

**Symptom**: Cloud API returns error "nebula-cert not found"

**Cause**: `go-agent/bin/nebula/nebula-cert` binary missing

**Fix**:
```bash
# Download from Nebula releases
wget https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-linux-amd64.tar.gz
tar xzf nebula-linux-amd64.tar.gz -C go-agent/bin/nebula/
chmod +x go-agent/bin/nebula/nebula-cert
```

### Config Generated But Can't Open Folder

**Symptom**: "Open Nebula Folder" button doesn't work

**Cause**: Electron shell API not working on some Linux distros

**Fix**:
Manually open folder:
```bash
# On Linux:
xdg-open ~/.vidsync/nebula/{projectId}

# On macOS:
open ~/.vidsync/nebula/{projectId}

# On Windows:
explorer %APPDATA%\.vidsync\nebula\{projectId}
```

## Testing Checklist

- [ ] CA files copied to `cloud/bin/` with correct permissions
- [ ] Cloud server starts without errors: `npm start` in cloud/
- [ ] Electron app starts: `npm start` in electron/
- [ ] Navigate to project detail page
- [ ] Click "Generate Nebula Config" — should succeed
- [ ] Check console logs for success message
- [ ] Click "Open Nebula Folder" — file explorer opens
- [ ] Verify files present:
  - [ ] nebula.yml
  - [ ] ca.crt
  - [ ] node.crt (placeholder for now)
  - [ ] node.key (placeholder for now)
  - [ ] README.md
- [ ] Edit nebula.yml and add lighthouse IP
- [ ] Test on another device:
  - [ ] Copy files to device
  - [ ] Run: `nebula -config nebula.yml`
  - [ ] Check if device gets Nebula VPN IP
  - [ ] Ping another device in Nebula network

## Next Steps

1. **Integrate cloud cert signing**:
   - Modify Electron to call cloud API for signed certs
   - Cloud API uses nebula-cert with ca.key to sign
   - Node.crt and node.key are real (not placeholder)

2. **Auto-populate lighthouse IP**:
   - Store lighthouse IP in project settings
   - Auto-fill in generated nebula.yml
   - Allow editing in UI

3. **Add device management**:
   - Track per-device certificates
   - Revoke certificates for removed devices
   - List active devices in network

4. **Enhance UI**:
   - Download as ZIP button
   - Import pre-generated config
   - QR code for easy sharing
   - Visual network topology

5. **Production hardening**:
   - Move ca.key to AWS Secrets Manager
   - Add audit logging for cert generation
   - Rate limit cert signing
   - Add certificate expiration tracking

## References

- Nebula GitHub: https://github.com/slackhq/nebula
- Nebula Documentation: https://nebula.defined.net/
- PKI Concepts: https://en.wikipedia.org/wiki/Public_key_infrastructure
