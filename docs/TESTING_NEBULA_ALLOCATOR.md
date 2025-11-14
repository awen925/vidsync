# Testing Guide: Nebula IP Allocation & Device Registration

This guide walks through testing the allocator and register endpoint end-to-end.

## Prerequisites

- Cloud backend running: `cd cloud && npm start`
- Supabase DB with migrations 004 & 005 applied
- `cloud/bin/ca.crt` and `cloud/bin/ca.key` present
- `go-agent/bin/nebula/nebula-cert` binary present (executable)

## Step 1: Populate IP Pool for a Test Project

Create a project and populate its Nebula IP pool.

```bash
# Start Node REPL and import the allocator service
node -e "
const { populateProjectPool } = require('./cloud/dist/services/nebulaAllocator.js');

// Example: populate for project UUID
const projectId = 'test-project-uuid-here';
populateProjectPool(projectId, '10.99.1.0/24')
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e));
"
```

Expected output:
```json
{
  "success": true,
  "count": 254
}
```

## Step 2: Generate a Nebula Public Key (on test device or client)

You need a Nebula public key to register a device. If you have `nebula-cert` installed locally:

```bash
# Generate a keypair locally (optional, for testing)
nebula-cert keygen -out-pub test-device.pub -out-key test-device.key

# Read the public key
cat test-device.pub
```

Or use an existing key. The public key is a base64-encoded Nebula certificate format.

## Step 3: Call POST /api/nebula/register

Use curl or your HTTP client to register a device and get the config bundle.

```bash
# Generate an auth token (use expired dev token from earlier, or real token if available)
# For dev mode, use an expired token that the dev fallback will decode

TOKEN="your-expired-or-valid-jwt-here"

curl -X POST http://localhost:3000/api/nebula/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "projectId": "test-project-uuid-here",
    "deviceId": "test-device-uuid-here",
    "deviceName": "test-device-1",
    "publicKey": "<paste-your-nebula-public-key-here>"
  }' | jq .
```

Expected response:
```json
{
  "success": true,
  "data": {
    "nebulaIp": "10.99.1.1/32",
    "deviceName": "test-device-1",
    "projectId": "test-project-uuid-here",
    "deviceId": "test-device-uuid-here",
    "zipBundle": "<very-long-base64-string>",
    "zipSize": 4096
  }
}
```

## Step 4: Extract and Inspect the ZIP Bundle

```bash
# Decode the base64 ZIP and save it
RESPONSE=$(curl -X POST http://localhost:3000/api/nebula/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{...}')

ZIP_BASE64=$(echo $RESPONSE | jq -r '.data.zipBundle')
echo "$ZIP_BASE64" | base64 -d > nebula-config.zip

# Extract
mkdir -p nebula-config
unzip -d nebula-config nebula-config.zip

# List files
ls -la nebula-config/
# Should show: ca.crt, node.crt, nebula.yml, README.md
```

## Step 5: Verify Files

```bash
# Check CA certificate
head -5 nebula-config/ca.crt
# Should start with: -----BEGIN NEBULA CERTIFICATE-----

# Check node certificate
head -5 nebula-config/node.crt
# Should start with: -----BEGIN NEBULA CERTIFICATE-----

# Check nebula.yml
head -20 nebula-config/nebula.yml
# Should show config with pki, listen, lighthouse sections

# Check README
head -20 nebula-config/README.md
# Should show setup instructions
```

## Step 6: Verify IP Allocation in Database

```bash
# Query the Supabase DB to verify allocation
# Using supabase CLI or direct psql:

psql "postgresql://user:password@host/database" -c \
  "SELECT ip, allocated_to_device_id, allocated_at FROM nebula_ip_pool WHERE project_id = 'test-project-uuid-here' ORDER BY ip LIMIT 10;"
```

Expected: One row should show your device's UUID in `allocated_to_device_id` and a recent timestamp in `allocated_at`.

## Step 7: Check Device Allocation Status

```bash
curl -X GET "http://localhost:3000/api/nebula/status/test-device-uuid-here" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected:
```json
{
  "success": true,
  "deviceId": "test-device-uuid-here",
  "nebulaIp": "10.99.1.1/32",
  "allocated": true
}
```

## Step 8: Release IP Allocation (Admin)

```bash
curl -X POST "http://localhost:3000/api/nebula/release/test-device-uuid-here" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected:
```json
{
  "success": true,
  "message": "Released IP for device test-device-uuid-here"
}
```

## Step 9: Re-register Same Device (Should Get a Different IP)

Call register again with the same device:

```bash
curl -X POST http://localhost:3000/api/nebula/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{...}' | jq '.data.nebulaIp'
```

Expected: A different IP (e.g., 10.99.1.2/32) since we released the previous one.

## Step 10: Test Concurrent Allocations

To verify race safety, simulate concurrent register calls:

```bash
# Fire 5 concurrent register calls (each with a different device ID)
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/nebula/register \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"projectId\": \"test-project-uuid-here\",
      \"deviceId\": \"device-$i\",
      \"deviceName\": \"device-$i\",
      \"publicKey\": \"<public-key>\"
    }" &
done

wait

# Check DB: All 5 should have unique IPs
psql "..." -c "SELECT device_id, ip FROM nebula_ip_allocations WHERE project_id = 'test-project-uuid-here' ORDER BY allocated_at DESC LIMIT 5;"
```

Expected: 5 rows with unique IPs (e.g., 10.99.1.1, 10.99.1.2, 10.99.1.3, 10.99.1.4, 10.99.1.5).

## Step 11: Test Pool Exhaustion

If you exhaust the pool:

```bash
# Try to register more devices than available IPs
for i in {1..260}; do
  curl -X POST http://localhost:3000/api/nebula/register \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{...}" > /tmp/result-$i.json &
done

# After 254 succeed, the next should fail with:
# {"error": "Failed to allocate Nebula IP", "detail": "nebula_ip_pool_exhausted..."}
```

## Troubleshooting Test Failures

### Error: "CA files not found on server"
- Verify `cloud/bin/ca.crt` and `cloud/bin/ca.key` exist.
- Check resolveBinary() is finding them (add console.log).

### Error: "nebula-cert failed"
- Verify `go-agent/bin/nebula/nebula-cert` exists and is executable: `file <path>`.
- Check the public key format is valid.
- Try running nebula-cert manually: `./nebula-cert sign -name test -ip 10.99.1.5/32 -ca-crt cloud/bin/ca.crt -ca-key cloud/bin/ca.key -in-pub test.pub -out-crt test.crt`.

### Error: "Invalid token" / "Unauthorized"
- Ensure JWT is not completely malformed. Use an expired dev token if in non-production.
- Check authMiddleware is being called. Add console.log in authMiddleware to debug.

### Error: "Supabase not initialized"
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars are set.
- Check `.env` file in cloud/ directory.

---

## Next Steps After Testing

1. **Integrate with Electron UI**: Update ProjectDetailPage to call `/api/nebula/register` when user requests Nebula config.
2. **Nebula Start Script**: Add script to extract ZIP, start Nebula, verify connection.
3. **Syncthing Integration**: Ensure Syncthing is configured to peer over Nebula IPs.
4. **Real-Time Monitoring**: Show device Nebula IP in UI, track sync status.
5. **Reclaim Job**: Implement background task to release IPs after device TTL expires.

---

**Testing Status**: ✅ Ready for E2E validation
