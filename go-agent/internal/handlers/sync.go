package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/util"
)

// SyncHandler handles sync-related HTTP requests
type SyncHandler struct {
	service *services.SyncService
	logger  *util.Logger
}

// NewSyncHandler creates a new sync handler
func NewSyncHandler(service *services.SyncService, logger *util.Logger) *SyncHandler {
	return &SyncHandler{
		service: service,
		logger:  logger,
	}
}

// StartSync starts syncing a project
func (h *SyncHandler) StartSync(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	var req struct {
		LocalPath   string `json:"localPath"`
		AccessToken string `json:"accessToken"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	result, err := h.service.StartSync(r.Context(), projectID, req.LocalPath, req.AccessToken)
	if err != nil {
		h.logger.Error("Failed to start sync: %v", err)
		http.Error(w, `{"error":"failed to start sync"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// PauseSync pauses a project folder
func (h *SyncHandler) PauseSync(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	accessToken := r.Header.Get("Authorization")

	err := h.service.PauseSync(r.Context(), projectID, accessToken)
	if err != nil {
		h.logger.Error("Failed to pause sync: %v", err)
		http.Error(w, `{"error":"failed to pause sync"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// ResumeSync resumes a project folder
func (h *SyncHandler) ResumeSync(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	accessToken := r.Header.Get("Authorization")

	err := h.service.ResumeSync(r.Context(), projectID, accessToken)
	if err != nil {
		h.logger.Error("Failed to resume sync: %v", err)
		http.Error(w, `{"error":"failed to resume sync"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// StopSync stops syncing and removes device from folder
func (h *SyncHandler) StopSync(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	var req struct {
		DeviceID    string `json:"deviceId"`
		AccessToken string `json:"accessToken"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	err := h.service.StopSync(r.Context(), projectID, req.DeviceID, req.AccessToken)
	if err != nil {
		h.logger.Error("Failed to stop sync: %v", err)
		http.Error(w, `{"error":"failed to stop sync"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// GetSyncStatus gets the current sync status of a project
func (h *SyncHandler) GetSyncStatus(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	result, err := h.service.GetSyncStatus(r.Context(), projectID)
	if err != nil {
		h.logger.Error("Failed to get sync status: %v", err)
		http.Error(w, `{"error":"failed to get sync status"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
