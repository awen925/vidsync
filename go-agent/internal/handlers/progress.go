package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/util"
)

// ProgressHandler handles progress-related HTTP requests
type ProgressHandler struct {
	fileService *services.FileService
	logger      *util.Logger
}

// NewProgressHandler creates a new progress handler
func NewProgressHandler(fileService *services.FileService, logger *util.Logger) *ProgressHandler {
	return &ProgressHandler{
		fileService: fileService,
		logger:      logger,
	}
}

// GetSnapshot Progress returns current snapshot generation progress for a project
func (h *ProgressHandler) GetSnapshotProgress(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	progressTracker := h.fileService.GetProgressTracker()
	progress := progressTracker.GetProgress(projectID)

	if progress == nil {
		// No tracking data - return empty progress
		progress = &services.SnapshotProgressEvent{
			ProjectID:  projectID,
			Step:       "idle",
			StepNumber: 0,
			TotalSteps: 6,
			Progress:   0,
			Message:    "No snapshot generation in progress",
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(progress)
}

// SubscribeSnapshotProgress subscribes to real-time snapshot progress updates
// Returns Server-Sent Events stream
func (h *ProgressHandler) SubscribeSnapshotProgress(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")

	h.logger.Info("[ProgressHandler] WebSocket subscription for project: %s", projectID)

	// Set up SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		h.logger.Error("[ProgressHandler] Response writer does not support flushing")
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	progressTracker := h.fileService.GetProgressTracker()

	// Subscribe to progress updates
	progressCh := progressTracker.Subscribe(projectID)
	defer progressTracker.Unsubscribe(projectID, progressCh)

	// Send initial progress
	currentProgress := progressTracker.GetProgress(projectID)
	if currentProgress != nil {
		data, _ := json.Marshal(currentProgress)
		w.Write([]byte("data: " + string(data) + "\n\n"))
		flusher.Flush()
	}

	// Stream progress updates
	for progress := range progressCh {
		data, _ := json.Marshal(progress)
		w.Write([]byte("data: " + string(data) + "\n\n"))
		flusher.Flush()

		// Close stream on completion or error
		if progress.Step == "completed" || progress.Step == "failed" {
			break
		}
	}

	h.logger.Info("[ProgressHandler] WebSocket subscription ended for project: %s", projectID)
}
