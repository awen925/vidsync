# Nebula + Syncthing Integration: Technical Architecture & Implementation

**Date**: 2025-11-12  
**Status**: Phase 2 complete (allocator + register endpoint implemented)  
**Goal**: Enable high-throughput peer-to-peer folder syncing over the internet using Nebula overlay network + Syncthing file sync

---

## 1. Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Cloud Control Plane (Node.js + Supabase)                        │
├─────────────────────────────────────────────────────────────────┤
│ • Auth & PKI management (CA cert/key in cloud/bin/)             │
│ • Nebula IP pool allocation (DB-backed, atomic allocator)       │
│ • Device registration & cert signing via nebula-cert binary     │
│ • Project & device metadata, invitation flow                    │
│ • Config bundle generation (ca.crt, node.crt, nebula.yml, README)│
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    POST /api/nebula/register
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Edge Agents (Electron + Go-Agent)                               │
├─────────────────────────────────────────────────────────────────┤
│ • Nebula overlay VPN (Layer 3, UDP-based, TUN device)           │
│   - Client fetches config bundle from cloud                     │
│   - Establishes mTLS connection to lighthouse & other peers     │
│   - Creates virtual interface with assigned Nebula IP           │
│ • Syncthing (File sync daemon)                                  │
│   - Configured to peer via Nebula IPs (not public internet)     │
│   - Auto-discovers project folder from ProjectDetailPage       │
│   - Performs block-level delta sync over Nebula overlay         │
│ • Local WebSocket to cloud for real-time events                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Nebula + Syncthing Achieves High Throughput

1. **Nebula (Overlay Network)**
   - L3 overlay: Runs as virtual TUN interface (not userspace proxy).
   - UDP-based: Fast, low-latency; no TCP overhead.
   - Direct P2P when possible: Nebula prefers direct UDP between peers, using lighthouse only for discovery/NAT traversal.
   - Kernel-level routing: OS-native packet forwarding → minimal overhead.
   - **Result**: Low CPU, low latency, high throughput potential.

2. **Syncthing (File Sync)**
   - Block-level delta sync: Efficiently detects and transfers only changed blocks.
   - Concurrent transfers: Multiple files/blocks simultaneously.
   - Large block sizes: Configurable (e.g., 256KB–1MB blocks reduce overhead).
   - When operating over Nebula IPs: Syncthing sees a private LAN → optimal conditions for fast sync.
   - **Result**: Efficient, incremental, parallelizable transfers.

3. **Combined Effect**
   - User selects local folder → Electron auto-configures Syncthing to that path.
   - Device joins project → Cloud allocates Nebula IP, signs cert, returns config bundle.
   - Device starts Nebula → Joins overlay, connects to lighthouse and peers.
   - Syncthing discovers peers via Nebula IPs → Direct P2P file sync begins.
   - **Throughput limited only by**: Network bandwidth, disk I/O, CPU (Nebula/Syncthing processing).

---

## 2. Implementation Details

### A. Database Schema (Migrations 004 & 005)

**Migration 004** (`004-add-nebula-ip-pool.sql`):
- Added columns to `user_devices`: `nebula_ip`, `is_lighthouse`, `nebula_last_seen`.
- Created tables: `nebula_ip_pool` and `nebula_ip_allocations` (audit).
- Created initial allocator functions (with FK issues).

**Migration 005** (`005-fix-nebula-schema-and-allocator.sql`):
- Fixed FK constraints that failed when `user_devices` didn't exist.
- Recreated allocator functions using dynamic SQL (runtime table detection).
- Supports both `user_devices` and `devices` table names.

**Key Tables**:
- `nebula_ip_pool`: Holds pool of available IPs per project. Row locked with `FOR UPDATE SKIP LOCKED` during allocation → race-safe.
- `nebula_ip_allocations`: Audit trail of allocations/releases.
- `user_devices`: Enhanced with `nebula_ip`, `is_lighthouse`, `nebula_last_seen`.

**Allocator Functions**:
- `allocate_nebula_ip(project_id, device_id, allocated_by)`: Atomically picks free IP, marks allocated, updates device record, logs audit. Returns IP on success; raises exception on pool exhaustion.
- `release_nebula_ip_by_device(device_id)`: Releases IP, marks as free, updates audit.

---

### B. Allocator Service (Node.js)

**File**: `cloud/src/services/nebulaAllocator.ts`

**Functions**:
- `populateProjectPool(projectId, subnetCIDR)`: Pre-populate pool with IPs from a CIDR range (e.g., 10.99.1.0/24 → 254 usable IPs).
- `allocateNebulaIp(projectId, deviceId, allocatedBy)`: Call DB function via Supabase RPC, return allocated IP.
- `releaseNebulaIp(deviceId)`: Release IP.
- `getDeviceAllocation(deviceId)`: Query current IP for a device.
- `listProjectAllocations(projectId)`: Admin/debug endpoint to list all allocations.

**Error Handling**:
- Pool exhaustion: Returns error if no free IPs.
- Supabase errors: Caught and logged; returns structured error response.

---

### C. Nebula Register Endpoint

**File**: `cloud/src/api/nebula/routes.ts` → `POST /api/nebula/register`

**Flow**:
1. **Validate**: Ensure all required fields present (projectId, deviceId, deviceName, publicKey).
2. **Allocate IP**: Call `allocateNebulaIp()` → obtains unique IP from pool.
3. **Sign Certificate**:
   - Create temp dir for cert generation.
   - Write client's public key to temp file.
   - Call `nebula-cert sign -in-pub <pubkey> -ip <ip/cidr> -ca-crt ... -ca-key ...` → produces node.crt.
   - Clean up temp files.
4. **Generate Config**: Create `nebula.yml` (with lighthouse placeholder, firewall rules, TUN settings).
5. **Generate README**: Setup instructions for the device.
6. **Bundle as ZIP**: Archive ca.crt, node.crt, nebula.yml, README.md → zip file.
7. **Return**: Base64-encoded zip in JSON response (client decodes and saves locally).

**Request**:
```json
{
  "projectId": "uuid-of-project",
  "deviceId": "uuid-of-device",
  "deviceName": "device-hostname",
  "publicKey": "<nebula public key from client>"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "nebulaIp": "10.99.1.5/32",
    "deviceName": "device-hostname",
    "projectId": "project-uuid",
    "deviceId": "device-uuid",
    "zipBundle": "<base64-encoded zip>",
    "zipSize": 4096
  }
}
```

**Additional Endpoints**:
- `GET /api/nebula/ca`: Serve public CA cert (no auth required for clients to download).
- `GET /api/nebula/status/:deviceId`: Check if device has allocated IP.
- `POST /api/nebula/release/:deviceId`: Admin endpoint to release IP (e.g., when removing device).

---

### D. Key Files Modified

1. **`cloud/src/services/nebulaAllocator.ts`** (NEW): Allocator service.
2. **`cloud/src/api/nebula/routes.ts`**: Updated with register endpoint, helper functions, additional endpoints.
3. **`cloud/migrations/005-fix-nebula-schema-and-allocator.sql`** (NEW): Fix schema, recreate functions.
4. **`cloud/package.json`**: Added `archiver` dependency for zipping.

---

## 3. Operational Flow: Device Registration & Sync Start

### Step 1: User Creates Project & Invites Devices
1. In Electron UI: User creates project → selects local folder.
2. Electron stores project metadata locally and in cloud.
3. User invites another device (e.g., via QR code or device ID).

### Step 2: Device Joins Project
1. Device receives invitation (via cloud API or peer discovery).
2. Device calls `POST /api/nebula/register`:
   - Generates Nebula public/private key pair locally (keeps private key safe).
   - Sends: projectId, deviceId, deviceName, publicKey.
3. Cloud allocates Nebula IP → signs public key → returns config bundle ZIP.
4. Device extracts ZIP: ca.crt, node.crt, nebula.yml, README.

### Step 3: Nebula Starts
1. Device runs: `nebula -config nebula.yml`.
2. Nebula reads config: lighthouse hosts, firewall rules, TUN device.
3. Nebula connects to lighthouse → lighthouse routes device to other peers.
4. Nebula creates virtual interface (e.g., `tun0`) with assigned IP (10.99.1.5).

### Step 4: Syncthing Discovers & Syncs
1. Syncthing (running locally) discovers other Syncthing instances via Nebula overlay.
2. Syncthing peers address each other by Nebula IP (e.g., 10.99.1.3, 10.99.1.5).
3. Syncthing auto-configures folder for project path on all devices.
4. Delta sync begins: only changed blocks are transferred.

### Step 5: Real-Time Monitoring (UI)
- ProjectDetailPage polls Syncthing status every 3 seconds → shows "folder configured" badge.
- Shows current sync progress, errors, or success state.
- User can manually trigger sync or adjust Syncthing settings.

---

## 4. Security Considerations

### CA Key Management
- `cloud/bin/ca.key` must be stored securely with file permissions 600.
- Never exposed in API responses or logs.
- In production, consider moving to KMS/HashiCorp Vault instead of filesystem.

### Certificate Signing
- `nebula-cert sign` runs with limited privileges in a temp directory.
- Temp files are cleaned up after signing.
- Public key is validated for size (100–10k bytes) before being used.

### Endpoint Authentication
- `/api/nebula/register`: Requires valid JWT (authMiddleware).
- `/api/nebula/ca`: Public (clients need CA to verify). No auth required.
- `/api/nebula/status`, `/api/nebula/release`: Require auth; should verify ownership/admin.

### Allocation Safety
- `FOR UPDATE SKIP LOCKED` ensures no duplicate IPs even under concurrent load.
- Transaction-scoped locking prevents race conditions.

### Future Hardening
- Rate-limiting on register endpoint (prevent abuse).
- Audit logging: Who registered which device, when, from which IP.
- Certificate rotation/expiration policy.
- Revocation mechanism (e.g., blacklist, CRL).

---

## 5. Deployment Checklist

### Pre-Deployment
- [ ] Run migrations 004 & 005 on Supabase DB.
- [ ] Copy `ca.crt` and `ca.key` from AWS Nebula lighthouse to `cloud/bin/`.
- [ ] Set `cloud/bin/ca.key` permissions to 600.
- [ ] Rebuild cloud backend: `npm run build`.

### Testing
- [ ] Pre-populate `nebula_ip_pool` for test projects (e.g., 10.99.1.0/24).
- [ ] Test `POST /api/nebula/register` with valid request → verify ZIP bundle returned.
- [ ] Extract ZIP and verify files: ca.crt, node.crt, nebula.yml, README.
- [ ] Start Nebula on device, verify connection to other peers.
- [ ] Verify Syncthing detects peers and syncs folders.

### Production
- [ ] Enable rate-limiting on nebula endpoints (e.g., 10 registrations per device per hour).
- [ ] Set up monitoring/alerting for allocation errors.
- [ ] Backup CA key securely (encrypted, off-site).
- [ ] Document certificate rotation policy and procedure.
- [ ] Test IP release/cleanup (manual and automated).

---

## 6. Troubleshooting

### Issue: "Pool Exhausted"
**Cause**: All IPs in `nebula_ip_pool` are allocated.  
**Fix**: Add more IPs to pool (expand subnet) or manually release unused allocations.

### Issue: "nebula-cert not found"
**Cause**: Binary path resolution failed.  
**Fix**: Verify `go-agent/bin/nebula/nebula-cert` exists and is executable.

### Issue: Device connects but can't ping peers
**Cause**: Lighthouse not configured, NAT issues, or firewall rules blocking UDP 4242.  
**Fix**: Edit nebula.yml, add lighthouse IP. Verify firewall allows UDP 4242. Check Nebula logs.

### Issue: Syncthing doesn't discover peers
**Cause**: Nebula overlay not functional yet, peers not reachable, or Syncthing discovery disabled.  
**Fix**: Verify Nebula is running (`ip addr show tun0`). Check Syncthing logs for discovery errors.

---

## 7. Performance Tuning

### Nebula Tuning
- **MTU**: Default is usually 1428 (TUN overhead). May need adjustment for your network.
- **Punch**: Enable punchy to prefer direct P2P over relays (default: true).
- **Listen Port**: Use high-numbered random port if behind strict NAT (Nebula handles this).

### Syncthing Tuning
- **Block Size**: Increase for very large files (default 128KB; can go up to 16MB).
- **Concurrent Transfers**: Increase for more parallelism (default 8; can go higher on powerful machines).
- **Folder Limits**: Set rescan interval, ignore patterns, etc. as needed.

### Network
- **Bandwidth**: Limit Syncthing rates if desired (Settings > Device > Rate Limits).
- **Compression**: Disable compression if bottleneck is CPU (network is fast enough).

---

## 8. Future Enhancements

1. **Automatic Certificate Rotation**: Implement scheduled job to refresh short-lived certs.
2. **Device Grouping**: Allocate contiguous IP ranges to logical device groups.
3. **IP Reclamation**: Automatic cleanup of IPs from offline devices (TTL-based).
4. **Lighthouse Failover**: Support multiple lighthouses for resilience.
5. **Mobile Support**: Extend Electron app to mobile platforms (iOS/Android Nebula client).
6. **Dashboard Analytics**: Show sync speed, peer connections, bandwidth usage.
7. **Custom Firewall Rules**: Allow users to restrict access between certain device pairs.
8. **Bandwidth Metering**: Track and bill based on data transferred (if SaaS model).

---

## 9. Summary

**Technical Proof**: Nebula + Syncthing achieves high throughput by:
1. Nebula provides a secure, low-overhead L3 overlay (UDP, TUN, P2P).
2. Syncthing uses block-level delta sync optimized for LAN-like conditions.
3. Combined: Cloud orchestrates IP allocation & PKI; agents sync files directly over overlay.

**Implementation**: Allocation is atomic (DB-backed FOR UPDATE SKIP LOCKED), certificate signing uses the client's public key (no private key exposure), and config bundles are packaged as ZIP for easy client extraction.

**Deployment**: Apply migrations, populate IP pool, test register endpoint, verify Nebula connectivity, confirm Syncthing sync.

---

**Author**: Nebula + Syncthing Integration Team  
**Version**: 1.0  
**Last Updated**: 2025-11-13
