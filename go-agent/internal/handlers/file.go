package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/util"
)

// FileHandler handles file-related HTTP requests
type FileHandler struct {
	service *services.FileService
	logger  *util.Logger
}

// NewFileHandler creates a new file handler
func NewFileHandler(service *services.FileService, logger *util.Logger) *FileHandler {
	return &FileHandler{
		service: service,
		logger:  logger,
	}
}

// GetFiles gets a list of files in a project folder
func (h *FileHandler) GetFiles(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	limit := r.URL.Query().Get("limit")
	offset := r.URL.Query().Get("offset")

	result, err := h.service.GetFiles(r.Context(), projectID, limit, offset)
	if err != nil {
		h.logger.Error("Failed to get files: %v", err)
		http.Error(w, `{"error":"failed to get files"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetFileTree gets the file tree structure of a project
func (h *FileHandler) GetFileTree(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	result, err := h.service.GetFileTree(r.Context(), projectID)
	if err != nil {
		h.logger.Error("Failed to get file tree: %v", err)
		http.Error(w, `{"error":"failed to get file tree"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GenerateSnapshot generates a snapshot of current project files
func (h *FileHandler) GenerateSnapshot(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	var req struct {
		AccessToken string `json:"accessToken"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	result, err := h.service.GenerateSnapshot(r.Context(), projectID, req.AccessToken)
	if err != nil {
		h.logger.Error("Failed to generate snapshot: %v", err)
		http.Error(w, `{"error":"failed to generate snapshot"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
