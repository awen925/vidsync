# Phase 2e Quick Reference: Real-Time Progress Tracking

## Quick Start

### For Users
1. Create a new project in Electron
2. Progress modal automatically appears
3. Watch real-time updates as snapshot generates:
   - Step 1: Waiting for Syncthing
   - Step 2-3: Scanning files
   - Step 4: Processing metadata
   - Step 5: Uploading to cloud
   - Step 6: Complete ✓
4. Modal auto-closes on completion

### For Developers

#### Using ProgressClient (Renderer Process)

```typescript
import ProgressClient from '../services/progressClient';

const client = new ProgressClient(logger);

// Start listening
client.start(
  'project-id',
  (progress) => console.log(`Progress: ${progress.progress}%`),
  (error) => console.error(error),
  (status) => console.log(`Status: ${status}`)
);

// Check status
console.log(client.isConnected());
console.log(client.isPolling()); // true if using fallback

// Stop listening
client.stop();
```

#### Using useSnapshotProgress Hook (React)

```typescript
import useSnapshotProgress from '../hooks/useSnapshotProgress';

function MyComponent({ projectId }) {
  const { progress, error, status, isConnected, start, stop } = useSnapshotProgress(projectId);

  return (
    <div>
      <p>Status: {status}</p>
      <p>Progress: {progress?.progress}%</p>
      {error && <p>Error: {error.message}</p>}
      <button onClick={() => start(projectId)}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}
```

#### Using SnapshotProgressDisplay Component (UI)

```tsx
import SnapshotProgressDisplay from '../components/SnapshotProgressDisplay';
import useSnapshotProgress from '../hooks/useSnapshotProgress';

function MyPage() {
  const { progress, error, status } = useSnapshotProgress('project-id');

  return (
    <SnapshotProgressDisplay
      progress={progress}
      error={error}
      status={status}
      isLoading={!progress}
    />
  );
}
```

#### Using SnapshotProgressModal Component (Modal UI)

```tsx
import SnapshotProgressModal from '../components/SnapshotProgressModal';

function MyPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState(null);

  return (
    <>
      <button onClick={() => {
        setProjectId('project-id');
        setIsOpen(true);
      }}>
        Create Project
      </button>

      <SnapshotProgressModal
        projectId={projectId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onComplete={(snapshotUrl) => {
          console.log('Snapshot ready:', snapshotUrl);
        }}
        onError={(error) => {
          console.error('Snapshot failed:', error);
        }}
      />
    </>
  );
}
```

## API Endpoints

### Get Current Progress (Polling)

```bash
curl http://localhost:5001/api/v1/projects/proj-123/progress

# Response:
{
  "projectId": "proj-123",
  "step": "uploading",
  "stepNumber": 5,
  "totalSteps": 6,
  "progress": 85,
  "fileCount": 1234,
  "totalSize": "2.4 GB",
  "message": "Uploading snapshot...",
  "timestamp": "2024-11-20T..."
}
```

### Subscribe to Progress Stream (SSE)

```bash
curl -N http://localhost:5001/api/v1/projects/proj-123/progress/stream

# Events:
data: {"projectId":"proj-123","step":"waiting",...}
data: {"projectId":"proj-123","step":"browsing",...}
...
data: {"projectId":"proj-123","step":"completed","snapshotUrl":"s3://...",...}
```

## Progress Steps (6-Step Model)

| Step | Number | Status | Message |
|------|--------|--------|---------|
| Waiting | 1 | In Progress | "Waiting for Syncthing scan..." |
| Browsing | 2-3 | In Progress | "Getting folder status...", "Browsing files..." |
| Compressing | 4 | In Progress | "Processing {N} files ({SIZE} total)..." |
| Uploading | 5 | In Progress | "Uploading snapshot to cloud..." |
| Completed | 6 | Terminal | "Snapshot generated successfully!" |
| Failed | N/A | Terminal | Error message |

## Connection Behavior

### Normal Flow (SSE)
```
Connecting → Connected → [Events stream] → Completed → Cleanup
```

### Reconnection Flow (SSE with failures)
```
Connected → Lost → Reconnecting (1s delay) → Connected
Connected → Lost → Reconnecting (2s delay) → Connected
Connected → Lost → Reconnecting (4s delay) → Connected
Connected → Lost → Reconnecting (8s delay) → Connected
Connected → Lost → Reconnecting (15s delay) → Connected
Connected → Lost → Switching to Polling (1s interval)
```

### Polling Fallback (When SSE fails 5 times)
```
Max SSE attempts reached → Polling (1s interval) → Completed → Cleanup
```

## Error Handling

### Client-Side Errors
- Network unreachable → Reconnection attempts
- Timeout → Reconnection attempts
- Max reconnection attempts → Switch to polling

### Server-Side Errors
- Project not found → Immediate 404 error
- Snapshot already completed → Returns final state
- Snapshot failed → Returns error state

### Recovery
- Automatic SSE reconnection with exponential backoff
- Automatic fallback to polling
- No data loss (clients get current state on reconnect)

## Performance Considerations

### Network Usage
- SSE: ~1-2 KB per update (depends on file count)
- Polling: ~1-2 KB per request (same payload)
- Frequency: ~1-2 updates per second during snapshot

### CPU Usage
- Client: Minimal (< 1% during updates)
- Server: Minimal (~1-5% per active snapshot generation)

### Memory Usage
- Per snapshot: ~50 KB (event buffer + state)
- Per subscriber: ~1 KB (channel + state)

## Troubleshooting

### Progress modal not showing
1. Check browser console for errors
2. Verify ProgressClient initialization
3. Check network tab for SSE/polling requests

### Progress not updating
1. Check /progress/stream endpoint (SSE test)
2. Check /progress endpoint (polling test)
3. Check Go agent logs for FileService errors

### Stuck on "Reconnecting..."
1. Check network connectivity
2. Check Go agent is running
3. Check firewall rules allow port 5001

### Wrong progress displayed
1. Clear browser cache
2. Restart Go agent
3. Check multiple snapshots aren't conflicting

## Configuration Options

### ProgressClient

```typescript
// Customizable timeouts and retries
const reconnectDelay = 1000;        // Initial backoff (ms)
const maxReconnectDelay = 30000;    // Max backoff (ms)
const maxReconnectAttempts = 5;     // Before polling fallback
```

### Hook Options

```typescript
const { progress, ... } = useSnapshotProgress(projectId, {
  autoStop: true  // Auto-stop when terminal state reached
});
```

## Testing

### Manual SSE Test

```bash
# Terminal 1: Start Go agent
cd go-agent && go run ./cmd/agent

# Terminal 2: Create project (will output projectId)
curl -X POST http://localhost:5001/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-1","name":"Test"}'

# Terminal 3: Watch progress stream
curl -N http://localhost:5001/api/v1/projects/test-1/progress/stream
```

### Manual Polling Test

```bash
# While snapshot is generating:
while true; do
  curl -s http://localhost:5001/api/v1/projects/test-1/progress | jq .progress
  sleep 1
done
```

## Debugging Tips

### Enable verbose logging

```typescript
// In progressClient.ts logger
const logger = {
  debug: (msg) => console.log('[DEBUG]', msg),
  warn: (msg) => console.warn('[WARN]', msg),
  error: (msg) => console.error('[ERROR]', msg),
};
```

### Monitor SSE events

```typescript
// In browser DevTools Console
const es = new EventSource('http://localhost:5001/api/v1/projects/test-1/progress/stream');
es.onmessage = e => console.log('Event:', JSON.parse(e.data));
es.onerror = () => console.log('Error');
```

### Check Go logs

```bash
# Go agent logs to stdout/stderr
# Look for:
# [ProgressClient] messages in logs
# [FileService] progress tracking logs
# [HTTP] response logs
```

## Next Steps

1. Monitor production metrics
2. Adjust reconnection timeouts if needed
3. Add progress history visualization
4. Implement snapshot comparison UI
5. Add batch snapshot generation support
