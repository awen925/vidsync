package services

import (
	"context"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/util"
)

// DeviceService manages device-related business logic
type DeviceService struct {
	syncClient  *api.SyncthingClient
	cloudClient *api.CloudClient
	logger      *util.Logger
}

// NewDeviceService creates a new device service
func NewDeviceService(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger) *DeviceService {
	return &DeviceService{
		syncClient:  syncClient,
		cloudClient: cloudClient,
		logger:      logger,
	}
}

// SyncDevice syncs device information with Supabase
func (ds *DeviceService) SyncDevice(ctx context.Context, userID, accessToken string) (map[string]interface{}, error) {
	ds.logger.Info("[DeviceService] Syncing device for user: %s", userID)

	// Get device ID from Syncthing
	status, err := ds.syncClient.GetStatus()
	if err != nil {
		ds.logger.Error("[DeviceService] Failed to get Syncthing status: %v", err)
		return map[string]interface{}{"ok": false, "error": err.Error()}, err
	}

	// Extract device ID (called "myID" or "id" in Syncthing)
	deviceID, ok := status["myID"].(string)
	if !ok {
		if id, ok := status["id"].(string); ok {
			deviceID = id
		}
	}

	if deviceID == "" {
		ds.logger.Error("[DeviceService] Could not get Syncthing device ID")
		return map[string]interface{}{"ok": false, "error": "could not get device ID"}, nil
	}

	// TODO: Update Supabase via cloud client
	// This will be done after cloud client is created

	ds.logger.Info("[DeviceService] Device synced successfully: %s", deviceID)
	return map[string]interface{}{
		"ok":       true,
		"deviceId": deviceID,
	}, nil
}

// GetDeviceStatus gets the current device status
func (ds *DeviceService) GetDeviceStatus(ctx context.Context, deviceID string) (map[string]interface{}, error) {
	ds.logger.Debug("[DeviceService] Getting device status: %s", deviceID)

	status, err := ds.syncClient.GetStatus()
	if err != nil {
		ds.logger.Error("[DeviceService] Failed to get Syncthing status: %v", err)
		return nil, err
	}

	return status, nil
}
