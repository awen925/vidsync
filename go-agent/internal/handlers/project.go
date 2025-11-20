package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/util"
)

// ProjectHandler handles project-related HTTP requests
type ProjectHandler struct {
	service *services.ProjectService
	logger  *util.Logger
}

// NewProjectHandler creates a new project handler
func NewProjectHandler(service *services.ProjectService, logger *util.Logger) *ProjectHandler {
	return &ProjectHandler{
		service: service,
		logger:  logger,
	}
}

// CreateProject creates a new project with Syncthing folder
func (h *ProjectHandler) CreateProject(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `json:"projectId"`
		Name      string `json:"name"`
		LocalPath string `json:"localPath"`
		DeviceID  string `json:"deviceId"`
		OwnerID   string `json:"ownerId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// Extract JWT token from cloud-authorization header (sent by Electron via GoAgentClient)
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, `{"error":"missing cloud authorization header"}`, http.StatusUnauthorized)
		return
	}

	// Expected format: "Bearer <token>"
	accessToken := authHeader
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		accessToken = authHeader[7:]
	}

	result, err := h.service.CreateProject(r.Context(), &services.CreateProjectRequest{
		ProjectID:   req.ProjectID,
		Name:        req.Name,
		LocalPath:   req.LocalPath,
		DeviceID:    req.DeviceID,
		OwnerID:     req.OwnerID,
		AccessToken: accessToken,
	})

	if err != nil {
		h.logger.Error("Failed to create project: %v", err)
		http.Error(w, `{"error":"failed to create project"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// CreateProjectWithSnapshot creates a new project and generates snapshot async
// Implements proper async event order:
// 1. Create in cloud
// 2. Create Syncthing folder
// 3. Generate snapshot (background process)
func (h *ProjectHandler) CreateProjectWithSnapshot(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `json:"projectId"`
		Name      string `json:"name"`
		LocalPath string `json:"localPath"`
		DeviceID  string `json:"deviceId"`
		OwnerID   string `json:"ownerId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// Extract JWT token from cloud-authorization header (sent by Electron via GoAgentClient)
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, `{"error":"missing cloud authorization header"}`, http.StatusUnauthorized)
		return
	}

	// Expected format: "Bearer <token>"
	accessToken := authHeader
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		accessToken = authHeader[7:]
	}

	result, err := h.service.CreateProjectWithSnapshot(r.Context(), &services.CreateProjectRequest{
		ProjectID:   req.ProjectID,
		Name:        req.Name,
		LocalPath:   req.LocalPath,
		DeviceID:    req.DeviceID,
		OwnerID:     req.OwnerID,
		AccessToken: accessToken,
	})

	if err != nil {
		h.logger.Error("Failed to create project: %v", err)
		http.Error(w, `{"error":"failed to create project"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetProject gets project details with Syncthing status
func (h *ProjectHandler) GetProject(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	result, err := h.service.GetProject(r.Context(), projectID)
	if err != nil {
		h.logger.Error("Failed to get project: %v", err)
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// DeleteProject deletes a project and its Syncthing folder
func (h *ProjectHandler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	accessToken := r.Header.Get("Authorization")

	err := h.service.DeleteProject(r.Context(), projectID, accessToken)
	if err != nil {
		h.logger.Error("Failed to delete project: %v", err)
		http.Error(w, `{"error":"failed to delete project"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// AddDevice adds a device to a project folder
func (h *ProjectHandler) AddDevice(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	var req struct {
		DeviceID    string `json:"deviceId"`
		AccessToken string `json:"accessToken"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	result, err := h.service.AddDevice(r.Context(), projectID, req.DeviceID, req.AccessToken)
	if err != nil {
		h.logger.Error("Failed to add device: %v", err)
		http.Error(w, `{"error":"failed to add device"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// RemoveDevice removes a device from a project folder
func (h *ProjectHandler) RemoveDevice(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	deviceID := r.PathValue("deviceId")
	accessToken := r.Header.Get("Authorization")

	err := h.service.RemoveDevice(r.Context(), projectID, deviceID, accessToken)
	if err != nil {
		h.logger.Error("Failed to remove device: %v", err)
		http.Error(w, `{"error":"failed to remove device"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// GetProjectStatus gets project status for polling during snapshot generation
// Returns: snapshotUrl, snapshotFileCount, snapshotTotalSize, syncStatus, generatedAt
func (h *ProjectHandler) GetProjectStatus(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	result, err := h.service.GetProjectStatus(r.Context(), projectID)
	if err != nil {
		h.logger.Error("Failed to get project status: %v", err)
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
