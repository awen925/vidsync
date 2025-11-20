import { useState, useEffect, useRef, useCallback } from 'react';
import ProgressClient, { SnapshotProgressEvent } from '../services/progressClient';

export interface UseProgressOptions {
  autoStop?: boolean; // Auto-stop when terminal state reached (default: true)
}

/**
 * Hook for consuming snapshot progress updates
 * Handles SSE connection, reconnection, and polling fallback
 */
export function useSnapshotProgress(
  projectId: string | null,
  options: UseProgressOptions = {}
) {
  const { autoStop = true } = options;

  const [progress, setProgress] = useState<SnapshotProgressEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<'idle' | 'connected' | 'disconnected' | 'reconnecting'>('idle');
  const clientRef = useRef<ProgressClient | null>(null);
  const loggerRef = useRef({
    debug: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  });

  // Initialize client
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new ProgressClient(loggerRef.current);
    }
  }, []);

  // Start/stop listening based on projectId
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    if (projectId) {
      const handleProgress = (event: SnapshotProgressEvent) => {
        setProgress(event);
      };

      const handleError = (err: Error) => {
        setError(err);
      };

      const handleStatus = (newStatus: 'connected' | 'disconnected' | 'reconnecting') => {
        setStatus(newStatus);
      };

      client.start(projectId, handleProgress, handleError, handleStatus);
      setStatus('connected');

      return () => {
        if (autoStop) {
          client.stop();
          setStatus('idle');
        }
      };
    } else {
      client.stop();
      setStatus('idle');
      setProgress(null);
      setError(null);
    }
  }, [projectId, autoStop]);

  // Manual stop function
  const stop = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stop();
      setStatus('idle');
    }
  }, []);

  // Manual start function
  const start = useCallback((id: string) => {
    if (clientRef.current) {
      setProgress(null);
      setError(null);
      clientRef.current.start(
        id,
        (event) => setProgress(event),
        (err) => setError(err),
        (newStatus) => setStatus(newStatus)
      );
    }
  }, []);

  return {
    progress,
    error,
    status,
    isConnected: status === 'connected',
    isReconnecting: status === 'reconnecting',
    start,
    stop,
  };
}

export default useSnapshotProgress;
