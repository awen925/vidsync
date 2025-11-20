package handlers

import (
	"net/http"

	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/util"
)

// Router sets up HTTP routes for the API
type Router struct {
	projectHandler *ProjectHandler
	syncHandler    *SyncHandler
	deviceHandler  *DeviceHandler
	fileHandler    *FileHandler
	logger         *util.Logger
}

// NewRouter creates a new HTTP router
func NewRouter(
	projectService *services.ProjectService,
	syncService *services.SyncService,
	deviceService *services.DeviceService,
	fileService *services.FileService,
	logger *util.Logger,
) *Router {
	return &Router{
		projectHandler: NewProjectHandler(projectService, logger),
		syncHandler:    NewSyncHandler(syncService, logger),
		deviceHandler:  NewDeviceHandler(deviceService, logger),
		fileHandler:    NewFileHandler(fileService, logger),
		logger:         logger,
	}
}

// RegisterRoutes registers all API routes
func (r *Router) RegisterRoutes(mux *http.ServeMux) {
	// Project endpoints
	mux.HandleFunc("POST /api/v1/projects", r.projectHandler.CreateProject)
	mux.HandleFunc("GET /api/v1/projects/{projectId}", r.projectHandler.GetProject)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}", r.projectHandler.DeleteProject)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/devices", r.projectHandler.AddDevice)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}/devices/{deviceId}", r.projectHandler.RemoveDevice)

	// Sync endpoints
	mux.HandleFunc("POST /api/v1/projects/{projectId}/sync/start", r.syncHandler.StartSync)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/sync/pause", r.syncHandler.PauseSync)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/sync/resume", r.syncHandler.ResumeSync)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/sync/stop", r.syncHandler.StopSync)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/sync/status", r.syncHandler.GetSyncStatus)

	// File endpoints
	mux.HandleFunc("GET /api/v1/projects/{projectId}/files", r.fileHandler.GetFiles)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/files-tree", r.fileHandler.GetFileTree)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/snapshot", r.fileHandler.GenerateSnapshot)

	// Device endpoints
	mux.HandleFunc("POST /api/v1/devices/sync", r.deviceHandler.SyncDevice)
	mux.HandleFunc("GET /api/v1/devices/{deviceId}/status", r.deviceHandler.GetDeviceStatus)

	r.logger.Info("API routes registered")
}

// Start starts the HTTP server
func (r *Router) Start(port string) error {
	mux := http.NewServeMux()
	r.RegisterRoutes(mux)

	r.logger.Info("Starting HTTP server on %s", port)
	return http.ListenAndServe(port, mux)
}

// HealthCheck is a simple health check endpoint
func (r *Router) HealthCheck(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}
