# Quick Reference: Nebula Allocator API

## Endpoint: `POST /api/nebula/register`

### Purpose
Register a device, allocate Nebula IP, sign certificate, generate config bundle.

### Request

```http
POST /api/nebula/register
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "660e8400-e29b-41d4-a716-446655440001",
  "deviceName": "my-laptop",
  "publicKey": "<nebula-public-key-in-base64>"
}
```

### Response (Success)

```json
{
  "success": true,
  "data": {
    "nebulaIp": "10.99.1.5/32",
    "deviceName": "my-laptop",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "deviceId": "660e8400-e29b-41d4-a716-446655440001",
    "zipBundle": "UEsDBAoAA...[very-long-base64]...==",
    "zipSize": 4096
  }
}
```

### Response (Error)

```json
{
  "error": "Failed to allocate Nebula IP",
  "detail": "nebula_ip_pool_exhausted: No free IPs available for project..."
}
```

---

## Client Usage (JavaScript/TypeScript)

```typescript
// 1. Generate Nebula keypair (or use existing)
const publicKey = await generateNebulaPublicKey();

// 2. Call register endpoint
const response = await fetch('http://cloud-api/api/nebula/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    projectId: 'your-project-uuid',
    deviceId: 'your-device-uuid',
    deviceName: 'my-device-name',
    publicKey,
  }),
});

const result = await response.json();

// 3. Decode and extract ZIP
const zipBase64 = result.data.zipBundle;
const zipBuffer = Buffer.from(zipBase64, 'base64');
const zipPath = '~/.vidsync/nebula/{projectId}/config.zip';
await fs.promises.writeFile(zipPath, zipBuffer);

// 4. Extract ZIP
const extract = require('extract-zip');
await extract(zipPath, { dir: path.dirname(zipPath) });

// 5. Start Nebula
const { spawn } = require('child_process');
const nebula = spawn('nebula', ['-config', 'nebula.yml']);
```

---

## Supporting Endpoints

### 1. Get CA Certificate
```http
GET /api/nebula/ca
```
Returns public CA cert (PEM format). No auth required.

### 2. Check Device Status
```http
GET /api/nebula/status/{deviceId}
Authorization: Bearer <JWT_TOKEN>
```
Response:
```json
{
  "success": true,
  "deviceId": "660e8400-e29b-41d4-a716-446655440001",
  "nebulaIp": "10.99.1.5/32",
  "allocated": true
}
```

### 3. Release IP (Admin)
```http
POST /api/nebula/release/{deviceId}
Authorization: Bearer <JWT_TOKEN>
```
Response:
```json
{
  "success": true,
  "message": "Released IP for device 660e8400-e29b-41d4-a716-446655440001"
}
```

---

## Allocator Service (Backend)

### Functions

```typescript
// Populate pool for a project
await populateProjectPool(projectId, '10.99.1.0/24');
// Returns: { success: true, count: 254 }

// Allocate IP for a device
const result = await allocateNebulaIp(projectId, deviceId, userId);
// Returns: { success: true, ip: '10.99.1.5/32' }

// Release IP
await releaseNebulaIp(deviceId);
// Returns: { success: true }

// Check allocation
const allocation = await getDeviceAllocation(deviceId);
// Returns: { ip: '10.99.1.5/32' }

// List all allocations in project (admin)
const list = await listProjectAllocations(projectId);
// Returns: [ { ip: '10.99.1.1/32', device_id: '...', allocated_at: '...' }, ...]
```

---

## ZIP Bundle Contents

Extracted ZIP contains 4 files:

```
~/.vidsync/nebula/{projectId}/
├── ca.crt          # Public CA certificate (public, safe to share)
├── node.crt        # Device's signed Nebula certificate
├── nebula.yml      # Nebula configuration file (add lighthouse IP)
└── README.md       # Setup instructions
```

---

## Key Configuration Values

| Setting | Value | Description |
|---------|-------|-------------|
| **Nebula Listen Port** | 4242 | UDP port for Nebula overlay |
| **TUN Device** | tun0 | Virtual network interface |
| **Firewall** | Any to Any | Default; restrict as needed |
| **Punchy** | Enabled | Prefer direct P2P over relays |
| **IP Format** | 10.99.x.x/32 | Per-device CIDR notation |

---

## Security Notes

1. **publicKey**: Client generates Nebula keypair locally, sends only public key to cloud.
2. **node.crt**: Signed by cloud CA, contains device's Nebula IP.
3. **ca.key**: Never exposed; stays on cloud server only.
4. **nebula.yml**: Keep safe; contains device-specific Nebula IP and config.
5. **CA cert**: Public; safe to share (needed to verify peers).

---

## Error Codes

| Error | Cause | Solution |
|-------|-------|----------|
| `pool_exhausted` | No free IPs | Expand pool or release old IPs |
| `ca_files_not_found` | CA files missing | Copy ca.crt, ca.key to cloud/bin |
| `cert_signing_failed` | nebula-cert error | Verify binary exists and CA is valid |
| `invalid_public_key` | Key format invalid | Use valid Nebula public key |
| `unauthorized` | JWT invalid/expired | Provide valid access token |

---

## Debugging

### Check Allocation Status
```bash
curl -X GET "http://localhost:3000/api/nebula/status/device-uuid" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### View Pool Status
```sql
-- In Supabase SQL editor
SELECT COUNT(*) as total, 
       SUM(CASE WHEN allocated_to_device_id IS NULL THEN 1 ELSE 0 END) as free,
       SUM(CASE WHEN allocated_to_device_id IS NOT NULL THEN 1 ELSE 0 END) as allocated
FROM nebula_ip_pool
WHERE project_id = 'project-uuid';
```

### Release All IPs for a Project (Dev Only)
```sql
UPDATE nebula_ip_pool
SET allocated_to_device_id = NULL, allocated_at = NULL
WHERE project_id = 'project-uuid';
```

### Check Cloud Logs
```bash
# Watch cloud backend logs
cd cloud
npm start 2>&1 | grep -i nebula
```

---

**Version**: 1.0  
**Last Updated**: 2025-11-13  
**Status**: ✅ Production Ready
