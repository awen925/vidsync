// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app';
import { initializeWebSocketService } from './services/webSocketService';

const PORT = process.env.PORT || 5000;

// Create HTTP server that supports both Express and WebSocket
const httpServer = createServer(app);

// Initialize WebSocket service for Phase 2C real-time sync
const wsService = initializeWebSocketService(httpServer);

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   Vidsync Cloud Server             ║
║   HTTP + WebSocket on port ${PORT}   ║
║   Phase 2B: Delta Sync Ready        ║
║   Phase 2C: Real-Time Enabled       ║
╚════════════════════════════════════╝
  `);
});
