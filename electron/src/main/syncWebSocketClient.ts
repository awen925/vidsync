import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { createServiceLogger } from './logger';

const logger = createServiceLogger('SyncWebSocket');

/**
 * Real-time sync event from Go-Agent WebSocket (:29999)
 * This allows instant UI updates without polling Syncthing REST API
 */
export interface SyncEvent {
  type: string;
  projectId?: string;
  folderId?: string;
  timestamp?: string;
  data?: any;
}

/**
 * Transfer progress event with speed and ETA
 */
export interface TransferProgressEvent extends SyncEvent {
  type: 'TransferProgress';
  data: {
    folderId: string;
    currentBytes: number;
    totalBytes: number;
    percentage: number;        // 0-100
    bytesPerSec: number;       // Current speed in bytes/sec
    filesPerSec?: number;      // Files per second
    filesRemaining?: number;
    eta?: string;              // "5m 32s"
  };
}

/**
 * Sync completion event
 */
export interface SyncCompleteEvent extends SyncEvent {
  type: 'SyncComplete';
  data: {
    folderId: string;
    totalFiles: number;
    totalBytes: number;
    duration: number;          // seconds
  };
}

/**
 * Sync error event
 */
export interface SyncErrorEvent extends SyncEvent {
  type: 'SyncError';
  data: {
    folderId: string;
    message: string;
    code?: string;
  };
}

export class SyncWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string = 'ws://127.0.0.1:29999/v1/events';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private isIntentionallyClosed = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(url?: string) {
    super();
    if (url) {
      this.url = url;
    }
  }

  /**
   * Connect to Go-Agent WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.log(`Connecting to Sync WebSocket at ${this.url}`);
        
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          logger.log('✅ Connected to Sync WebSocket server');
          this.reconnectAttempts = 0;
          this.isIntentionallyClosed = false;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const event: SyncEvent = JSON.parse(data.toString());
            logger.debug(`📨 Sync event: ${event.type}`);
            
            // Emit specific event type
            this.emit(event.type, event);
            
            // Emit generic event for all listeners
            this.emit('sync-event', event);
          } catch (e) {
            logger.warn(`Failed to parse sync event: ${e}`);
          }
        });

        this.ws.on('close', () => {
          logger.log('Sync WebSocket closed');
          this.heartbeatInterval && clearInterval(this.heartbeatInterval);
          this.emit('disconnected');
          
          if (!this.isIntentionallyClosed) {
            this.attemptReconnect();
          }
        });

        this.ws.on('error', (error) => {
          logger.error(`Sync WebSocket error: ${error.message}`);
          this.emit('error', error);
          // Don't immediately reject - allow reconnection attempt
          if (!this.isIntentionallyClosed) {
            // Trigger reconnect on error
            this.heartbeatInterval && clearInterval(this.heartbeatInterval);
            setTimeout(() => this.attemptReconnect(), 1000);
          } else {
            reject(error);
          }
        });
      } catch (error) {
        logger.error(`Failed to connect to Sync WebSocket: ${error}`);
        reject(error);
      }
    });
  }

  /**
   * Reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('Max reconnect attempts reached for Sync WebSocket');
      this.emit('reconnect-failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.log(`Attempting reconnect to Sync WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    
    setTimeout(() => {
      this.connect().catch((error) => {
        logger.warn(`Reconnect attempt failed: ${error.message}`);
      });
    }, delay);
  }

  /**
   * Send heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (e) {
          logger.debug('Failed to send heartbeat ping');
        }
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Send message to Go-Agent (if needed for future commands)
   */
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Failed to send message: ${error}`);
      }
    } else {
      logger.warn('WebSocket not connected, cannot send message');
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    logger.log('Sync WebSocket disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to specific event type
   */
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * Subscribe once to specific event type
   */
  once(event: string, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }
}

// Singleton instance
let syncWebSocketClient: SyncWebSocketClient | null = null;

/**
 * Get or create singleton WebSocket client
 */
export function getSyncWebSocketClient(): SyncWebSocketClient {
  if (!syncWebSocketClient) {
    syncWebSocketClient = new SyncWebSocketClient();
  }
  return syncWebSocketClient;
}

/**
 * Initialize WebSocket client on app startup
 */
export async function initializeSyncWebSocket(): Promise<void> {
  try {
    const client = getSyncWebSocketClient();
    
    // Set up global event listeners
    client.on('connected', () => {
      logger.log('Sync WebSocket connected - ready for real-time updates');
    });

    client.on('disconnected', () => {
      logger.log('Sync WebSocket disconnected - will attempt reconnect');
    });

    client.on('TransferProgress', (event: TransferProgressEvent) => {
      logger.debug(`Transfer: ${event.data.percentage}% @ ${(event.data.bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`);
    });

    client.on('SyncComplete', (event: SyncCompleteEvent) => {
      logger.log(`✅ Sync complete for folder ${event.data.folderId} - ${event.data.totalFiles} files in ${event.data.duration}s`);
    });

    client.on('SyncError', (event: SyncErrorEvent) => {
      logger.error(`❌ Sync error for folder ${event.data.folderId}: ${event.data.message}`);
    });

    // Attempt initial connection
    // This will automatically retry with exponential backoff if it fails
    client.connect().catch((error) => {
      logger.warn(`Initial WebSocket connection attempt failed (will retry): ${error.message}`);
      // The client's internal error handler will trigger attemptReconnect()
    });
  } catch (error) {
    logger.error(`Failed to initialize Sync WebSocket: ${error}`);
  }
}
