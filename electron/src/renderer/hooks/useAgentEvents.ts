import { useEffect, useState, useCallback } from 'react';
import agentAPI from './useCloudApi';

interface SyncEvent {
  projectId: string;
  type: string;
  path?: string;
  message?: string;
  timestamp: string;
}

export const useAgentEvents = (onEvent?: (event: SyncEvent) => void) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const connectWS = () => {
      try {
        const wsUrl = 'ws://127.0.0.1:29999/v1/events';
        const websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          console.log('WebSocket connected');
          setConnected(true);
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (onEvent) {
              onEvent(data);
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnected(false);
        };

        websocket.onclose = () => {
          console.log('WebSocket disconnected');
          setConnected(false);
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWS, 3000);
        };

        setWs(websocket);
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
      }
    };

    connectWS();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [onEvent]);

  return { ws, connected };
};

export const useAgentStatus = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await agentAPI.get('/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch agent status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { status, loading, refetch: fetchStatus };
};
