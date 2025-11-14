import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * Phase 2C: WebSocket Event Broadcasting Service
 * Enables real-time sync with <100ms latency
 *
 * Architecture:
 * - Server broadcasts events to all clients subscribed to a project
 * - Clients subscribe via socket.io on project open
 * - Events pushed instantly (vs HTTP polling with 5-30s delay)
 * - Automatic reconnection handled by socket.io
 * - Graceful degradation if WebSocket fails
 */

interface ProjectSubscription {
  userId: string;
  projectId: string;
  connectedAt: Date;
}

export class WebSocketService {
  private io: SocketIOServer;
  private subscriptions: Map<string, ProjectSubscription> = new Map(); // socketId -> subscription
  private projectClients: Map<string, Set<string>> = new Map(); // projectId -> Set<socketId>

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:3000').split(','),
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      // Performance optimizations
      pingInterval: 25000,
      pingTimeout: 20000,
      maxHttpBufferSize: 1e6, // 1MB
    });

    this.setupHandlers();
    console.log('[WebSocket] Service initialized');
  }

  /**
   * Setup socket event handlers
   */
  private setupHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      // Subscribe to project events
      socket.on('subscribe:project', (data: any, callback?: (ack: any) => void) => {
        this.handleProjectSubscription(socket, data, callback);
      });

      // Unsubscribe from project
      socket.on('unsubscribe:project', (data: any, callback?: (ack: any) => void) => {
        this.handleProjectUnsubscription(socket, data, callback);
      });

      // Heartbeat (keep connection alive)
      socket.on('ping', (callback?: (ack: any) => void) => {
        if (callback) callback({ pong: true });
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Error handler
      socket.on('error', (error: any) => {
        console.error(`[WebSocket] Socket error: ${socket.id}`, error);
      });
    });
  }

  /**
   * Handle project subscription
   * Client calls: socket.emit('subscribe:project', {projectId, userId})
   */
  private handleProjectSubscription(socket: Socket, data: any, callback?: (ack: any) => void) {
    try {
      const { projectId, userId } = data;

      if (!projectId) {
        if (callback) callback({ success: false, message: 'projectId required' });
        return;
      }

      // Store subscription
      this.subscriptions.set(socket.id, {
        userId: userId || 'unknown',
        projectId,
        connectedAt: new Date(),
      });

      // Add socket to project room
      socket.join(`project:${projectId}`);

      // Track in projectClients
      if (!this.projectClients.has(projectId)) {
        this.projectClients.set(projectId, new Set());
      }
      this.projectClients.get(projectId)!.add(socket.id);

      console.log(`[WebSocket] Client ${socket.id} subscribed to project ${projectId}`);
      if (callback) callback({ success: true, message: 'Subscribed to project' });
    } catch (error) {
      console.error('[WebSocket] Subscription error:', error);
      if (callback) callback({ success: false, message: 'Subscription failed' });
    }
  }

  /**
   * Handle project unsubscription
   */
  private handleProjectUnsubscription(socket: Socket, data: any, callback?: (ack: any) => void) {
    try {
      const { projectId } = data;

      if (!projectId) {
        if (callback) callback({ success: false, message: 'projectId required' });
        return;
      }

      // Remove from room
      socket.leave(`project:${projectId}`);

      // Remove from tracking
      const clients = this.projectClients.get(projectId);
      if (clients) {
        clients.delete(socket.id);
        if (clients.size === 0) {
          this.projectClients.delete(projectId);
        }
      }

      // Remove subscription
      this.subscriptions.delete(socket.id);

      console.log(`[WebSocket] Client ${socket.id} unsubscribed from project ${projectId}`);
      if (callback) callback({ success: true, message: 'Unsubscribed from project' });
    } catch (error) {
      console.error('[WebSocket] Unsubscription error:', error);
      if (callback) callback({ success: false, message: 'Unsubscription failed' });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: Socket) {
    // Clean up subscriptions
    const subscription = this.subscriptions.get(socket.id);
    if (subscription) {
      const clients = this.projectClients.get(subscription.projectId);
      if (clients) {
        clients.delete(socket.id);
        if (clients.size === 0) {
          this.projectClients.delete(subscription.projectId);
        }
      }
      this.subscriptions.delete(socket.id);
    }

    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  }

  /**
   * Broadcast project event to all subscribers
   * Called by POST /files/update handler after appending to project_events
   */
  public broadcastProjectEvent(projectId: string, event: {
    seq: number;
    change: {
      path: string;
      op: 'create' | 'update' | 'delete';
      hash?: string;
      mtime?: number;
      size?: number;
    };
    created_at: string;
  }) {
    // Emit to all clients in this project's room
    this.io.to(`project:${projectId}`).emit('project:event', {
      projectId,
      event,
      receivedAt: new Date().toISOString(),
    });

    console.log(`[WebSocket] Broadcast event to project ${projectId}: seq=${event.seq}, path=${event.change.path}`);
  }

  /**
   * Broadcast multiple events (bulk)
   */
  public broadcastProjectEvents(projectId: string, events: any[]) {
    events.forEach((event) => {
      this.broadcastProjectEvent(projectId, event);
    });
  }

  /**
   * Get service statistics (for monitoring)
   */
  public getStats() {
    return {
      totalConnections: this.io.engine.clientsCount,
      totalSubscriptions: this.subscriptions.size,
      projects: Array.from(this.projectClients.entries()).map(([projectId, clients]) => ({
        projectId,
        subscribers: clients.size,
      })),
    };
  }
}

// Singleton instance
let wsService: WebSocketService | null = null;

/**
 * Initialize WebSocket service with HTTP server
 * Call from server.ts after creating HTTP server
 */
export function initializeWebSocketService(httpServer: HTTPServer): WebSocketService {
  if (!wsService) {
    wsService = new WebSocketService(httpServer);
  }
  return wsService;
}

/**
 * Get WebSocket service instance
 * Call from route handlers to broadcast events
 */
export function getWebSocketService(): WebSocketService {
  if (!wsService) {
    throw new Error('WebSocket service not initialized. Call initializeWebSocketService first.');
  }
  return wsService;
}
