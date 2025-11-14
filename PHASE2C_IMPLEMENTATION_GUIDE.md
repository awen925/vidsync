# Phase 2C - WebSocket Real-Time Implementation Guide

## Overview
Phase 2C adds real-time delivery to Phase 2B's delta sync infrastructure.

**Goal:** Users see file changes appear in <100ms instead of waiting 5-30 seconds for polling

## Architecture Changes

### Before (Phase 2B - HTTP Polling)
```
Owner creates file
        ↓
FileWatcher detects (500ms debounce)
        ↓
POST /api/projects/:id/files/update
        ↓
Invitee polls: GET /api/projects/:id/events?since_seq=N
        ↓
Latency: 5-30 seconds (depends on poll interval)
```

### After (Phase 2C - WebSocket Push)
```
Owner creates file
        ↓
FileWatcher detects (500ms debounce)
        ↓
POST /api/projects/:id/files/update
        ↓
Server broadcasts via WebSocket to all viewers
        ↓
All connected clients receive instantly (<100ms)
        ↓
Latency: <100ms (server broadcasts to all subscribers)
```

## Implementation Plan

### Step 1: Install Dependencies

```bash
cd cloud
npm install socket.io express-http-proxy
npm install --save-dev @types/socket.io
```

### Step 2: Refactor Server to Support HTTP + WebSocket

**File: `cloud/src/server.ts`** (modify to use createServer)

```typescript
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app';
import { initializeWebSocketService } from './services/webSocketService';

const PORT = process.env.PORT || 5000;

// Create HTTP server that can handle both Express and WebSocket
const httpServer = createServer(app);

// Initialize WebSocket service
const wsService = initializeWebSocketService(httpServer);

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   Vidsync Cloud Server             ║
║   HTTP + WebSocket on port ${PORT}   ║
╚════════════════════════════════════╝
  `);
});
```

### Step 3: Create WebSocket Service

**File: `cloud/src/services/webSocketService.ts`** (new)

Features:
- Project subscriptions (users join room for project)
- Event broadcasting (push to all subscribers)
- Automatic reconnection (socket.io built-in)
- Offline queueing (messages queue while offline)

```typescript
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';

export class WebSocketService {
  private io: SocketIOServer;
  private projectSubscribers: Map<string, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling'],
    });
    
    this.setupHandlers();
  }

  private setupHandlers() {
    this.io.on('connection', (socket) => {
      // User subscribes to project updates
      socket.on('subscribe:project', (projectId: string) => {
        socket.join(`project:${projectId}`);
        logger.debug(`User subscribed to project ${projectId}`);
      });

      // User unsubscribes
      socket.on('unsubscribe:project', (projectId: string) => {
        socket.leave(`project:${projectId}`);
      });
    });
  }

  // Called by POST /files/update after logging change
  broadcastEvent(projectId: string, event: any) {
    this.io.to(`project:${projectId}`).emit('project:event', event);
    logger.debug(`Broadcast to project ${projectId}`);
  }
}

let wsService: WebSocketService;

export function initializeWebSocketService(httpServer: HTTPServer) {
  wsService = new WebSocketService(httpServer);
  return wsService;
}

export function getWebSocketService() {
  return wsService;
}
```

### Step 4: Add Broadcasting to POST /files/update

**File: `cloud/src/api/projects/routes.ts`** (modify existing handler)

After appending to `project_events`, add:

```typescript
// Phase 2C: Broadcast to all WebSocket subscribers
try {
  const wsService = getWebSocketService();
  wsService.broadcastEvent(projectId, {
    seq,
    change,
    created_at: new Date().toISOString(),
  });
} catch (error) {
  // WebSocket is optional, don't fail if not connected
  logger.debug('WebSocket broadcast skipped:', error);
}
```

### Step 5: Create React Hook for WebSocket

**File: `electron/src/renderer/hooks/useProjectEvents.ts`** (new)

```typescript
import { useEffect, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

interface ProjectEvent {
  seq: number;
  change: {
    path: string;
    op: 'create' | 'update' | 'delete';
    hash?: string;
  };
  created_at: string;
}

export function useProjectEvents(
  projectId: string | null,
  onEvent: (event: ProjectEvent) => void
) {
  useEffect(() => {
    if (!projectId) return;

    // Connect to WebSocket
    const socket: Socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Subscribe to project
    socket.emit('subscribe:project', projectId);

    // Listen for events
    socket.on('project:event', (event: ProjectEvent) => {
      onEvent(event);
    });

    // Cleanup
    return () => {
      socket.emit('unsubscribe:project', projectId);
      socket.disconnect();
    };
  }, [projectId, onEvent]);
}
```

### Step 6: Integrate Hook into Project View

**File: `electron/src/renderer/pages/Projects/YourProjectsPage.tsx`** (modify)

```typescript
import { useProjectEvents } from '../../hooks/useProjectEvents';

export function YourProjectsPage() {
  const [syncBadges, setSyncBadges] = useState<Map<string, string>>(new Map());

  // Listen for real-time events
  useProjectEvents(selectedProjectId, (event) => {
    // Update UI to show "syncing" badge
    setSyncBadges((prev) => {
      const next = new Map(prev);
      next.set(selectedProjectId!, `Synced: ${event.change.path}`);
      setTimeout(() => next.delete(selectedProjectId!), 2000);
      return next;
    });
  });

  return (
    <div>
      {/* Show sync badge */}
      {syncBadges.get(selectedProjectId) && (
        <div className="sync-badge">✓ {syncBadges.get(selectedProjectId)}</div>
      )}
    </div>
  );
}
```

## Implementation Checklist

### Server-Side (Cloud)
- [ ] Install socket.io: `npm install socket.io`
- [ ] Modify server.ts to use createServer
- [ ] Create webSocketService.ts
- [ ] Add broadcasting to POST /files/update handler
- [ ] Test: Connect to WebSocket, verify events broadcast

### Client-Side (Electron)
- [ ] Install socket.io-client: `npm install socket.io-client`
- [ ] Create useProjectEvents hook
- [ ] Integrate into project view
- [ ] Show sync badges when events received
- [ ] Test: Create files, watch badges update in real-time

### Testing
- [ ] Test WebSocket connection
- [ ] Test subscription/unsubscription
- [ ] Test event broadcasting
- [ ] Measure latency (<100ms target)
- [ ] Test offline/reconnection

## Code Quality

- [ ] TypeScript: 0 errors
- [ ] Error handling for WebSocket failures
- [ ] Fallback to HTTP polling if WebSocket fails
- [ ] Connection status indicators
- [ ] Graceful reconnection

## Performance

- [ ] Event batching (same as Phase 2B)
- [ ] No duplicate broadcasts
- [ ] Memory efficient (proper cleanup)
- [ ] <100ms latency target
- [ ] Support 1000+ concurrent connections

## Timeline

**Estimated:** 3 hours total
- Server setup & WebSocket service: 1 hour
- API integration & broadcasting: 1 hour
- Client hooks & UI integration: 1 hour

## Success Criteria

✅ **Phase 2C Complete** when:
1. WebSocket server listening on same port as HTTP
2. Clients can subscribe/unsubscribe from projects
3. Events broadcast to all subscribers in <100ms
4. Sync badges appear in UI when changes happen
5. Graceful fallback if WebSocket unavailable
6. 0 TypeScript errors
7. All tests passing

## Next Phase: Offline Queue & Advanced Features

After Phase 2C works:
- Store events in local db while offline
- Queue sync when reconnecting
- Conflict resolution if needed
- Selective sync (subscribe to specific folders)

---

**Status:** Implementation Guide Ready
**Next:** Begin Phase 2C development
