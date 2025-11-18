# 🚀 QUICK REFERENCE - SYNC SYSTEM

## Frontend Component

### Import
```typescript
import { SyncControlPanel } from '../../components/ProjectSync/SyncControlPanel';
```

### Usage
```typescript
<SyncControlPanel
  projectId={projectId}
  projectName={projectName}
  onSyncStatusChange={(status) => console.log(status)}
/>
```

### Props
```typescript
interface SyncControlPanelProps {
  projectId: string;
  projectName: string;
  onSyncStatusChange?: (status: SyncStatus) => void;
}
```

---

## Backend Endpoints

### Start Sync
```
POST /api/projects/:projectId/sync-start
Content-Type: application/json
Authorization: Bearer TOKEN

{
  "deviceId": "DEVICE-ID",
  "syncthingApiKey": "API_KEY"
}

Response:
{
  "success": true,
  "message": "Sync started successfully",
  "projectId": "...",
  "projectName": "...",
  "deviceId": "...",
  "folderStatus": {...}
}
```

### Pause Sync
```
POST /api/projects/:projectId/pause-sync
Content-Type: application/json
Authorization: Bearer TOKEN

{
  "syncthingApiKey": "API_KEY"
}

Response:
{
  "success": true,
  "message": "Sync paused successfully",
  "projectId": "...",
  "projectName": "..."
}
```

### Resume Sync
```
POST /api/projects/:projectId/resume-sync
Content-Type: application/json
Authorization: Bearer TOKEN

{
  "syncthingApiKey": "API_KEY"
}

Response:
{
  "success": true,
  "message": "Sync resumed successfully",
  "projectId": "...",
  "projectName": "..."
}
```

### Stop Sync
```
POST /api/projects/:projectId/sync-stop
Content-Type: application/json
Authorization: Bearer TOKEN

{
  "deviceId": "DEVICE-ID",
  "syncthingApiKey": "API_KEY"
}

Response:
{
  "success": true,
  "message": "Sync stopped successfully",
  "projectId": "...",
  "projectName": "...",
  "deviceId": "..."
}
```

### Get Sync Status
```
GET /api/projects/:projectId/sync-status?syncthingApiKey=API_KEY
Authorization: Bearer TOKEN

Response:
{
  "state": "syncing",
  "globalBytes": 1024000,
  "localBytes": 2048000,
  "needsBytes": 512000,
  "fullStatus": {...}
}
```

---

## Custom Hooks

### useSyncthingDevices
```typescript
const { devices, loading, error, fetchDevices } = useSyncthingDevices();

// Usage
useEffect(() => {
  fetchDevices(apiKey);
}, [apiKey, fetchDevices]);

// Returns
// devices: SyncthingDevice[]
// loading: boolean
// error: string | null
```

### useSyncStatus
```typescript
const { status, loading, error, fetchStatus } = useSyncStatus();

// Usage
useEffect(() => {
  fetchStatus(projectId);
}, [projectId, fetchStatus]);

// Returns
// status: any (sync status object)
// loading: boolean
// error: string | null
```

---

## Common Error Codes

| Code | Message | Solution |
|------|---------|----------|
| 400 | Missing required parameters | Check API request body |
| 401 | Unauthorized | Verify authentication token |
| 403 | Only project owner can... | Use owner account |
| 404 | Project/Device not found | Verify IDs exist |
| 503 | Cannot connect to Syncthing | Start Syncthing, check API |
| 500 | Internal server error | Check server logs |

---

## Syncthing Setup

```bash
# Install
sudo apt-get install syncthing  # Debian/Ubuntu
brew install syncthing          # macOS

# Start
syncthing

# Access
http://localhost:8384

# Enable API
Settings → API → Enable REST API
Copy API Key

# Add Device
Settings → Devices → Add
Enter device ID

# Create Folder
Settings → Folders → Add
Set ID = project ID
Set Path = project folder
Select devices to share

# API Endpoints
GET  http://localhost:8384/rest/config/devices
GET  http://localhost:8384/rest/config/folders/:id
PUT  http://localhost:8384/rest/config/folders/:id
POST http://localhost:8384/rest/db/scan?folder=:id
GET  http://localhost:8384/rest/db/status?folder=:id
```

---

## Development Commands

```bash
# Frontend
cd electron
npm install
npm run dev        # Development server
npm run build      # Production build
npm test          # Run tests

# Backend
cd cloud
npm install
npm run dev       # Development server
npm run build     # Production build
npm test         # Run tests
npm run migration # Run migrations
```

---

## File Locations

```
Frontend:
electron/src/renderer/components/ProjectSync/SyncControlPanel.tsx
electron/src/renderer/hooks/useSyncthingApi.ts
electron/src/renderer/pages/Projects/YourProjectsPage.tsx

Backend:
cloud/src/services/syncthingService.ts
cloud/src/config/syncthingConfig.ts
cloud/src/api/projects/routes.ts

Docs:
docs/FRONTEND_SYNC_UI_COMPLETE.md
docs/SYNC_UI_VISUAL_GUIDE.md
docs/SYNC_IMPLEMENTATION_COMPLETE.md
```

---

## State Management

```typescript
// API Key
const [apiKey, setApiKey] = useState('');
const [showApiKeyInput, setShowApiKeyInput] = useState(false);

// Devices
const [devices, setDevices] = useState<SyncDevice[]>([]);
const [selectedDeviceId, setSelectedDeviceId] = useState('');

// Sync Status
const [syncStatus, setSyncStatus] = useState<SyncStatus>({
  state: 'stopped',
  globalBytes: 0,
  localBytes: 0,
  needsBytes: 0,
});

// UI
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState<string | null>(null);
```

---

## Event Handlers

```typescript
// Load devices when API key provided
useEffect(() => {
  if (apiKey) loadDevices();
}, [apiKey]);

// Poll status when actively syncing
useEffect(() => {
  if (syncStatus.state === 'syncing') {
    const interval = setInterval(fetchSyncStatus, 2000);
    return () => clearInterval(interval);
  }
}, [syncStatus.state]);

// Handle sync start
async function handleStartSync() {
  const response = await cloudAPI.post(
    `/projects/${projectId}/sync-start`,
    { deviceId: selectedDeviceId, syncthingApiKey: apiKey }
  );
  setSyncStatus({ state: 'syncing', ... });
}
```

---

## Testing Checklist

- [ ] API key input accepts text
- [ ] API key is masked on display
- [ ] Device dropdown populates
- [ ] Start sync button calls endpoint
- [ ] Status updates to "Syncing"
- [ ] Progress bar appears
- [ ] Pause button works
- [ ] Resume button works
- [ ] Stop button shows confirmation
- [ ] Error messages display
- [ ] Success messages display
- [ ] Component responsive on mobile
- [ ] TypeScript: 0 errors
- [ ] No console errors

---

## Performance Tips

✓ Component loads instantly (< 200ms)
✓ API key input responsive (no debounce needed)
✓ Device dropdown quick (mock data)
✓ Status polling efficient (only when syncing)
✓ Memory cleanup on unmount (useEffect cleanup)

---

## Security Reminders

✓ API key never logged
✓ API key passed per-request only
✓ Use `type="password"` for input
✓ Mask display (first 8 + last 4 chars)
✓ Backend validates ownership
✓ All endpoints require authentication

---

## Troubleshooting

### Component not rendering
- Check projectId and projectName props
- Verify Material-UI installed
- Check imports are correct

### API key not working
- Verify Syncthing running on localhost:8384
- Check API is enabled in Syncthing settings
- Copy full API key (not truncated)

### Status not updating
- Check polling interval (should be 2s)
- Verify API key is valid
- Check network tab for errors

### Device not syncing
- Verify device ID is correct
- Check Syncthing folder is created
- Ensure API key has permissions

---

## Resources

- Syncthing Docs: https://docs.syncthing.net/
- REST API: https://docs.syncthing.net/rest/index.html
- Material-UI: https://mui.com/
- React Docs: https://react.dev/
- TypeScript: https://www.typescriptlang.org/

---

## Contact & Support

For issues or questions:
1. Check documentation files
2. Review error messages
3. Check console logs
4. Verify Syncthing setup
5. Contact development team

---

*Last Updated: November 17, 2025*
