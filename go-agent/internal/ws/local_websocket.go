package ws

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/vidsync/agent/internal/device"
	"github.com/vidsync/agent/internal/util"
)

// WebSocketServer manages local WebSocket connections for Electron
type WebSocketServer struct {
	addr        string
	logger      *util.Logger
	deviceMgr   *device.DeviceManager
	upgrader    websocket.Upgrader
	clients     map[*Client]bool
	mu          sync.RWMutex
	broadcastCh chan interface{}
	stopCh      chan struct{}
}

// Client represents a connected WebSocket client
type Client struct {
	conn *websocket.Conn
	send chan interface{}
}

// NewWebSocketServer creates a new WebSocket server
func NewWebSocketServer(addr string, logger *util.Logger, deviceMgr *device.DeviceManager) *WebSocketServer {
	return &WebSocketServer{
		addr:        addr,
		logger:      logger,
		deviceMgr:   deviceMgr,
		upgrader:    websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:     make(map[*Client]bool),
		broadcastCh: make(chan interface{}, 100),
		stopCh:      make(chan struct{}),
	}
}

// Start starts the WebSocket server
func (ws *WebSocketServer) Start() error {
	http.HandleFunc("/v1/events", ws.handleWebSocket)
	http.HandleFunc("/v1/status", ws.handleStatus)
	http.HandleFunc("/v1/device", ws.handleDevice)

	ws.logger.Info("WebSocket server listening on ws://127.0.0.1%s", ws.addr)

	// Broadcaster goroutine
	go ws.broadcaster()

	return http.ListenAndServe(ws.addr, nil)
}

// Stop stops the WebSocket server
func (ws *WebSocketServer) Stop() error {
	close(ws.stopCh)
	ws.logger.Info("WebSocket server stopped")
	return nil
}

// Broadcast broadcasts a message to all connected clients
func (ws *WebSocketServer) Broadcast(msg interface{}) {
	select {
	case ws.broadcastCh <- msg:
	default:
		ws.logger.Warn("Broadcast channel full")
	}
}

func (ws *WebSocketServer) broadcaster() {
	for {
		select {
		case msg := <-ws.broadcastCh:
			ws.mu.RLock()
			for client := range ws.clients {
				select {
				case client.send <- msg:
				default:
					ws.logger.Warn("Client send channel full")
				}
			}
			ws.mu.RUnlock()

		case <-ws.stopCh:
			return
		}
	}
}

func (ws *WebSocketServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := ws.upgrader.Upgrade(w, r, nil)
	if err != nil {
		ws.logger.Error("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan interface{}, 50),
	}

	ws.mu.Lock()
	ws.clients[client] = true
	ws.mu.Unlock()

	ws.logger.Info("Client connected: %s", conn.RemoteAddr())

	go ws.clientWriter(client)
	go ws.clientReader(client)
}

func (ws *WebSocketServer) clientReader(client *Client) {
	defer func() {
		ws.mu.Lock()
		delete(ws.clients, client)
		ws.mu.Unlock()
		client.conn.Close()
	}()

	for {
		var msg map[string]interface{}
		if err := client.conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				ws.logger.Error("WebSocket error: %v", err)
			}
			return
		}

		// Handle incoming messages if needed
		ws.logger.Debug("Received message: %v", msg)
	}
}

func (ws *WebSocketServer) clientWriter(client *Client) {
	defer client.conn.Close()

	for msg := range client.send {
		if err := client.conn.WriteJSON(msg); err != nil {
			ws.logger.Error("Write error: %v", err)
			return
		}
	}
}

func (ws *WebSocketServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	// CORS support for dev (renderer dev server calling local agent)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	status := map[string]interface{}{
		"status":  "ok",
		"clients": len(ws.clients),
	}

	json.NewEncoder(w).Encode(status)
}

func (ws *WebSocketServer) handleDevice(w http.ResponseWriter, r *http.Request) {
	// CORS support for dev
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	if ws.deviceMgr == nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Device manager not available"})
		return
	}

	deviceInfo := ws.deviceMgr.GetDeviceInfo()
	if deviceInfo == nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Device info not initialized"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"deviceId":    deviceInfo.ID,
		"deviceName":  deviceInfo.Name,
		"platform":    deviceInfo.Platform,
		"deviceToken": deviceInfo.Token,
	})
}
