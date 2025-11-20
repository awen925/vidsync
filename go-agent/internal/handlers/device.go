package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/vidsync/agent/internal/services"
	"github.com/vidsync/agent/internal/util"
)

// DeviceHandler handles device-related HTTP requests
type DeviceHandler struct {
	service *services.DeviceService
	logger  *util.Logger
}

// NewDeviceHandler creates a new device handler
func NewDeviceHandler(service *services.DeviceService, logger *util.Logger) *DeviceHandler {
	return &DeviceHandler{
		service: service,
		logger:  logger,
	}
}

// SyncDevice syncs device information with Supabase
func (h *DeviceHandler) SyncDevice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID      string `json:"userId"`
		AccessToken string `json:"accessToken"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	result, err := h.service.SyncDevice(r.Context(), req.UserID, req.AccessToken)
	if err != nil {
		h.logger.Error("Failed to sync device: %v", err)
		http.Error(w, `{"error":"failed to sync device"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetDeviceStatus gets the current device status
func (h *DeviceHandler) GetDeviceStatus(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("deviceId")

	result, err := h.service.GetDeviceStatus(r.Context(), deviceID)
	if err != nil {
		h.logger.Error("Failed to get device status: %v", err)
		http.Error(w, `{"error":"device not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
