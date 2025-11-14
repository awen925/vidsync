import { useEffect, useCallback, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

/**
 * Phase 2C: useProjectEvents Hook
 * 
 * Subscribes to real-time project events via WebSocket
 * Enables showing sync badges and live updates
 * 
 * Usage:
 * ```
 * const { isConnected, lastEvent } = useProjectEvents(projectId, (event) => {
 *   console.log('File changed:', event.change.path);
 *   showSyncBadge();
 * });
 * 
 * if (isConnected) {
 *   return <div>✓ Real-time sync active</div>;
 * }
 * ```
 */

export interface ProjectEvent {
  seq: number;
  change: {
    path: string;
    op: 'create' | 'update' | 'delete';
    hash?: string;
    mtime?: number;
    size?: number;
  };
  created_at: string;
  receivedAt: string;
}

export interface UseProjectEventsReturn {
  isConnected: boolean;
  lastEvent: ProjectEvent | null;
  isReconnecting: boolean;
  error: string | null;
}

export function useProjectEvents(
  projectId: string | null,
  userId: string | null,
  onEvent?: (event: ProjectEvent) => void
): UseProjectEventsReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ProjectEvent | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Handle events
  const handleEvent = useCallback(
    (event: ProjectEvent) => {
      setLastEvent(event);
      setError(null);
      onEvent?.(event);
    },
    [onEvent]
  );

  // Setup WebSocket connection
  useEffect(() => {
    // Don't connect if no project selected
    if (!projectId || !userId) {
      return;
    }

    // Get API URL from environment
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    // Create socket connection
    const socket = io(apiUrl, {
      // Use WebSocket first, fall back to polling if needed
      transports: ['websocket', 'polling'],
      
      // Reconnection settings
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      
      // Performance
      autoConnect: true,
      query: {
        projectId,
        userId,
      },
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('[Phase 2C] WebSocket connected:', socket.id);
      setIsConnected(true);
      setIsReconnecting(false);
      setError(null);

      // Subscribe to this project's events
      socket.emit('subscribe:project', { projectId, userId }, (ack: any) => {
        if (ack?.success) {
          console.log('[Phase 2C] Subscribed to project:', projectId);
        } else {
          console.warn('[Phase 2C] Subscription failed:', ack?.message);
          setError(ack?.message || 'Subscription failed');
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('[Phase 2C] WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error: any) => {
      console.error('[Phase 2C] Connection error:', error);
      setError(error?.message || 'Connection error');
    });

    socket.on('error', (error: any) => {
      console.error('[Phase 2C] Socket error:', error);
      setError(typeof error === 'string' ? error : error?.message || 'Socket error');
    });

    socket.on('reconnect_attempt', () => {
      console.log('[Phase 2C] Attempting to reconnect...');
      setIsReconnecting(true);
    });

    socket.on('reconnect', () => {
      console.log('[Phase 2C] Reconnected');
      setIsReconnecting(false);
      
      // Re-subscribe after reconnection
      socket.emit('subscribe:project', { projectId, userId });
    });

    // Listen for project events
    socket.on('project:event', (data: any) => {
      console.log('[Phase 2C] Event received:', data.event.change.path);
      handleEvent(data.event);
    });

    // Cleanup on unmount or project change
    return () => {
      console.log('[Phase 2C] Cleaning up WebSocket for project:', projectId);
      
      // Unsubscribe before disconnecting
      socket.emit('unsubscribe:project', { projectId }, () => {
        console.log('[Phase 2C] Unsubscribed from project');
      });

      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId, userId, handleEvent]);

  return {
    isConnected,
    lastEvent,
    isReconnecting,
    error,
  };
}

// Export for testing
export { Socket };
