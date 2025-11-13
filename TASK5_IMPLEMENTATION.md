# Task #5: Device Pairing Implementation Checklist

## Goal
Complete end-to-end device pairing using:
1. **Cloud-based pairing tokens** for device discovery
2. **Syncthing device ID exchange** for folder sharing
3. **Nebula overlay network** for encrypted connections
4. **File transfer validation** to ensure sync works

## Current Status

### ✅ Already Implemented
- [x] Cloud pairing token generation (`POST /pairings`)
- [x] Token acceptance flow (`POST /pairings/{token}/accept`)
- [x] Device ID retrieval via Syncthing REST API
- [x] Remote device import via `syncthingImportRemote` IPC handler
- [x] Folder auto-configuration via Syncthing REST API
- [x] UI for device code display and copying
- [x] UI for pairing token input and acceptance
- [x] Single shared Syncthing instance
- [x] Nebula bundle extraction with validation
- [x] Automatic elevation handling with pkexec

### 🔄 Currently In Progress / Needs Testing
- [ ] End-to-end device pairing validation
- [ ] Cross-device file transfer verification
- [ ] Device persistence after app restart
- [ ] Handling of pairing failures gracefully
- [ ] UI feedback during pairing process

### ❌ Not Yet Implemented
- [ ] "Generate Invite" button (token generation trigger)
- [ ] Pairing status polling (showing pending/accepted invites)
- [ ] Device list management (view paired devices, unpair)
- [ ] Automatic retry on pairing failure
- [ ] Timeout handling for slow connections

---

## Phase 1: Implementation Tasks

### Task 1.1: Add "Generate Invite" Button
**File**: `electron/src/renderer/pages/Projects/ProjectDetailPage.tsx`

```typescript
// Add handler for generating invite token
const handleGenerateInvite = async () => {
  setPairingStatus('Generating invite...');
  try {
    const resp = await cloudAPI.post(`/projects/${projectId}/pairings`);
    if (resp.data && resp.data.token) {
      setCreatedToken(resp.data.token);
      setTokenStatus('Invite generated! Share this code with other device operators: ' + resp.data.token);
    }
  } catch (e) {
    setTokenStatus('Failed to generate invite: ' + String(e));
  }
};

// Add UI button
<button className="bg-purple-600 text-white px-3 py-1 rounded" onClick={handleGenerateInvite}>
  Generate Invite Code
</button>

// Show generated token
{createdToken && (
  <div style={{ marginTop: 8, backgroundColor: '#EFF6FF', padding: 8, borderRadius: 4 }}>
    <strong>Share this code:</strong>
    <code style={{ display: 'block', marginTop: 4, padding: 8, backgroundColor: '#f3f4f6' }}>
      {createdToken}
    </code>
    <button onClick={() => navigator.clipboard.writeText(createdToken)} className="bg-gray-200 px-2 py-1 rounded mt-2">
      Copy Invite Code
    </button>
  </div>
)}
```

### Task 1.2: Add Cloud API Endpoint for Token Generation
**File**: `cloud/src/api/pairings/index.ts`

```typescript
// POST /projects/:projectId/pairings
// Generate a new pairing invite for a project
export async function generateProjectPairing(req: Request, res: Response) {
  const { projectId } = req.params;
  const deviceId = req.deviceId;
  
  if (!deviceId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    // Create pairing token (12-char random hex)
    const token = generateRandomHex(6); // 12 characters
    
    // Save to database
    const result = await db.query(
      `INSERT INTO pairing_invites (token, from_device_id, project_id, created_at, status)
       VALUES ($1, $2, $3, NOW(), 'pending')
       RETURNING token, created_at`,
      [token, deviceId, projectId]
    );
    
    return res.json({ token: result.rows[0].token });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
```

### Task 1.3: Add UI Feedback During Pairing

Update `ProjectDetailPage.tsx` to show:
- Status message while connecting
- Spinner/loading indicator
- Success/error states

```typescript
{pairingStatus && (
  <div style={{
    marginTop: 8,
    padding: 8,
    borderRadius: 4,
    backgroundColor: pairingStatus.includes('Error') || pairingStatus.includes('Failed') 
      ? '#FEE2E2' 
      : '#DBEAFE',
    color: pairingStatus.includes('Error') || pairingStatus.includes('Failed') 
      ? '#991B1B' 
      : '#1E40AF'
  }}>
    {pairingStatus.includes('Importing') && <span>⌛ {pairingStatus}</span>}
    {pairingStatus.includes('Connected') && <span>✓ {pairingStatus}</span>}
    {pairingStatus.includes('Error') && <span>✗ {pairingStatus}</span>}
  </div>
)}
```

### Task 1.4: Verify Device Persistence

Test that pairing survives app restart:

```bash
# Device A
1. Open project
2. Get device code: "DEVICE-A-CODE"
3. Generate invite token: "abc123def456"

# Device B
1. Accept invite with token: "abc123def456"
2. Verify files sync

# Both devices
3. Close app completely
4. Reopen app
5. Verify: Devices still paired, can sync new files
```

### Task 1.5: Add Retry Logic for Failed Pairings

**File**: `electron/src/renderer/pages/Projects/ProjectDetailPage.tsx`

```typescript
// Add retry handler
const handleRetryPairing = async () => {
  if (!remoteInvite) return;
  setPairingStatus('Retrying...');
  
  // Exponential backoff: 1s, 2s, 4s, 8s
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await attemptPairing(); // existing logic
      return; // success
    } catch (e) {
      if (attempt < 3) {
        const delayMs = Math.pow(2, attempt + 1) * 1000;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  setPairingStatus('Failed after 4 attempts. Check connection and try again.');
};
```

### Task 1.6: Add Device Management UI

Show list of paired devices with option to unpair:

```typescript
// New section in ProjectDetailPage
<div style={{ marginTop: 16 }}>
  <h5 className="font-medium">Connected Devices</h5>
  
  {pairedDevices && pairedDevices.length > 0 ? (
    <ul style={{ marginTop: 8 }}>
      {pairedDevices.map(dev => (
        <li key={dev.id} style={{ padding: 8, backgroundColor: '#F3F4F6', borderRadius: 4, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>{dev.name} ({dev.id.substring(0, 8)}...)</span>
          <button onClick={() => handleUnpairDevice(dev.id)} className="text-red-600 text-sm">
            Disconnect
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p style={{ color: '#6B7280' }}>No devices connected yet</p>
  )}
</div>
```

---

## Phase 2: Testing & Validation

### Test Case 1: Single Device Pairing

```bash
Device A:
1. Create project "Test-A"
2. Choose folder ~/test-a
3. Generate invite: TOKEN=abc123
4. Copy device code: DEVICE_A=...

Device B:
1. Create project "Test-B"
2. Choose folder ~/test-b
3. Paste token in "Connect Device": abc123
4. Click "Connect Device"
✓ Expect: Status "Device connected"

Device A:
5. Create file: echo "hello" > ~/test-a/hello.txt

Device B:
6. Verify: File appears in ~/test-b/hello.txt within 30 seconds
✓ Expect: MD5 hash matches
```

### Test Case 2: Bi-Directional Sync

```bash
Device A (after TC1 passed):
1. Create new file: random-from-a.txt

Device B:
2. Verify file appears
3. Create new file: random-from-b.txt

Device A:
4. Verify file appears
✓ Expect: Both files synced in both directions
```

### Test Case 3: Large File Transfer

```bash
Device A:
1. Create 100MB file: dd if=/dev/urandom of=big.bin bs=1M count=100
2. Monitor progress in UI

Device B:
3. Monitor ~/test-b/big.bin file size
4. Wait for completion (1-5 minutes depending on network)

Both:
5. Verify MD5 hash: md5sum big.bin
✓ Expect: Hashes match, no corruption
```

### Test Case 4: Persistence After Restart

```bash
Device A & B:
1. Complete TC2 (bi-directional sync)
2. Create marker files: date > marker-$(date +%s).txt
3. Verify sync works
4. Close app: pkill electron
5. Restart app: npm run dev
6. Verify marker files synced
7. Create new files
8. Verify sync still works

✓ Expect: No manual re-pairing needed, sync resumes
```

### Test Case 5: Error Handling

```bash
Device A:
1. Try to pair with invalid token: "invalid123"
✓ Expect: Error message: "Invalid invite token"

Device B:
2. Stop syncthing: pkill syncthing
3. Try to pair
✓ Expect: Timeout or "Connection failed" message

Device B (restart):
4. pkill syncthing should have been killed
5. Restart app
✓ Expect: Syncthing auto-starts, retries pairing
```

---

## Phase 3: Success Criteria

### Must Pass
- [x] Single device can be paired via token
- [ ] Files sync from Device A → Device B
- [ ] Files sync from Device B → Device A
- [ ] Large files don't corrupt
- [ ] Pairing persists after app restart
- [ ] UI shows clear status messages
- [ ] Error handling shows friendly messages

### Should Pass (Nice to Have)
- [ ] Device list shows paired devices
- [ ] Can unpair devices
- [ ] Automatic retry on transient failures
- [ ] Progress shows file transfer %
- [ ] Metrics recorded (files synced, bytes transferred, time)

### Must Not Do
- ✗ Crash on pairing failure
- ✗ Leak unencrypted data to network
- ✗ Lose pairing configuration after restart
- ✗ Show technical error messages to user

---

## Documentation References

- See `TESTING_DEVICE_PAIRING.md` for detailed step-by-step test guide
- See `COMPLETE_REFERENCE.md` for architecture overview
- See `cloud/README.md` for Cloud API endpoints
- Check `electron/src/main/main.ts` for IPC handlers

---

## Next Steps

1. Implement Task 1.1 - "Generate Invite" button
2. Implement Task 1.2 - Cloud API endpoint
3. Test Task 1.3 - UI feedback
4. Run comprehensive testing (Phase 2)
5. Fix any issues found
6. Document any limitations
