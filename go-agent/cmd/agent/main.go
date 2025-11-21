package main

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/config"
	"github.com/vidsync/agent/internal/device"
	"github.com/vidsync/agent/internal/handlers"
	"github.com/vidsync/agent/internal/nebula"
	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/sync"
	"github.com/vidsync/agent/internal/util"
	"github.com/vidsync/agent/internal/ws"
)

// obfuscateKey returns a partially masked key for logging
func obfuscateKey(key string) string {
	if len(key) <= 4 {
		return "***"
	}
	return key[:4] + "..." + key[len(key)-4:]
}

func main() {
	// Initialize logger
	logger := util.NewLogger("agent")
	logger.Info("Starting Vidsync Agent")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Failed to load config: %v", err)
	}

	// Initialize device manager
	deviceMgr := device.NewDeviceManager(cfg.DataDir)
	if err := deviceMgr.Init(); err != nil {
		logger.Fatal("Failed to initialize device manager: %v", err)
	}
	logger.Info("Device initialized: %s", deviceMgr.GetDeviceID())

	// Initialize Nebula manager
	nebulaMgr := nebula.NewNebulaManager(cfg.DataDir, logger)

	// Check if Nebula needs elevation
	elevationNeeded := nebulaMgr.CheckElevationNeeded()
	if elevationNeeded {
		logger.Warn("Nebula TUN device creation requires elevated privileges")
		logger.Info("On first run, you may be prompted to grant admin access")
	}

	// Initialize Syncthing manager
	syncMgr := sync.NewSyncManager(cfg.DataDir, logger)

	// Initialize API clients
	syncthingClient := api.NewSyncthingClient("http://localhost:8384", cfg.SyncthingAPIKey)
	cloudClient := api.NewCloudClient(cfg.CloudURL, cfg.CloudKey)

	// Initialize services
	projectService := services.NewProjectService(syncthingClient, cloudClient, logger)
	syncService := services.NewSyncService(syncthingClient, cloudClient, logger)
	deviceService := services.NewDeviceService(syncthingClient, cloudClient, logger)
	fileService := services.NewFileService(syncthingClient, cloudClient, logger)

	// Note: FileService no longer needs Supabase credentials
	// Snapshot uploads go through Cloud API which handles storage internally

	// Initialize API router and start HTTP server
	router := handlers.NewRouter(projectService, syncService, deviceService, fileService, logger)
	go func() {
		if err := router.Start(":5001"); err != nil {
			logger.Error("HTTP API server error: %v", err)
		}
	}()
	logger.Info("HTTP API server started on :5001")

	// Initialize WebSocket server
	wsServer := ws.NewWebSocketServer(":29999", logger, deviceMgr)

	// Register event handlers
	syncMgr.OnEvent(func(evt sync.Event) {
		logger.Debug("Sync event: %s - %s", evt.Type, evt.ProjectID)
		wsServer.Broadcast(evt)
	})

	// Start services
	go func() {
		if err := wsServer.Start(); err != nil {
			logger.Error("WebSocket server error: %v", err)
		}
	}()

	go func() {
		if err := syncMgr.Start(); err != nil {
			logger.Error("Sync manager error: %v", err)
		}
	}()

	// Start Nebula if configured
	if cfg.NebulaEnabled {
		go func() {
			if err := nebulaMgr.Start(); err != nil {
				logger.Error("Nebula manager error: %v", err)
			}
		}()
	}

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	logger.Info("Shutdown signal received")

	// Cleanup
	syncMgr.Stop()
	nebulaMgr.Stop()
	wsServer.Stop()

	logger.Info("Vidsync Agent stopped")
}
