package services

import (
	"context"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/util"
)

// SyncService manages sync-related business logic
type SyncService struct {
	syncClient  *api.SyncthingClient
	cloudClient *api.CloudClient
	logger      *util.Logger
}

// NewSyncService creates a new sync service
func NewSyncService(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger) *SyncService {
	return &SyncService{
		syncClient:  syncClient,
		cloudClient: cloudClient,
		logger:      logger,
	}
}

// StartSync starts syncing a project
func (ss *SyncService) StartSync(ctx context.Context, projectID, localPath, accessToken string) (map[string]interface{}, error) {
	ss.logger.Info("[SyncService] Starting sync for project: %s", projectID)

	// Ensure folder exists in Syncthing
	err := ss.syncClient.AddFolder(projectID, projectID, localPath)
	if err != nil {
		ss.logger.Warn("[SyncService] Folder may already exist: %v", err)
		// Continue anyway - folder might already be configured
	}

	// Scan the folder
	err = ss.syncClient.Rescan(projectID)
	if err != nil {
		ss.logger.Error("[SyncService] Failed to scan folder: %v", err)
		return map[string]interface{}{"ok": false, "error": err.Error()}, err
	}

	ss.logger.Info("[SyncService] Sync started successfully for project: %s", projectID)
	return map[string]interface{}{"ok": true}, nil
}

// PauseSync pauses a project folder
func (ss *SyncService) PauseSync(ctx context.Context, projectID, accessToken string) error {
	ss.logger.Info("[SyncService] Pausing sync for project: %s", projectID)

	err := ss.syncClient.PauseFolder(projectID)
	if err != nil {
		ss.logger.Error("[SyncService] Failed to pause folder: %v", err)
		return err
	}

	// Update DB via cloud API
	ss.logger.Info("[SyncService] Sync paused successfully for project: %s", projectID)
	return nil
}

// ResumeSync resumes a project folder
func (ss *SyncService) ResumeSync(ctx context.Context, projectID, accessToken string) error {
	ss.logger.Info("[SyncService] Resuming sync for project: %s", projectID)

	err := ss.syncClient.ResumeFolder(projectID)
	if err != nil {
		ss.logger.Error("[SyncService] Failed to resume folder: %v", err)
		return err
	}

	// Update DB via cloud API
	ss.logger.Info("[SyncService] Sync resumed successfully for project: %s", projectID)
	return nil
}

// StopSync stops syncing and removes device from folder
func (ss *SyncService) StopSync(ctx context.Context, projectID, deviceID, accessToken string) error {
	ss.logger.Info("[SyncService] Stopping sync for project: %s", projectID)

	// Remove device from folder
	err := ss.syncClient.RemoveDeviceFromFolder(projectID, deviceID)
	if err != nil {
		ss.logger.Error("[SyncService] Failed to remove device from folder: %v", err)
		return err
	}

	ss.logger.Info("[SyncService] Sync stopped successfully for project: %s", projectID)
	return nil
}

// GetSyncStatus gets the current sync status of a project
func (ss *SyncService) GetSyncStatus(ctx context.Context, projectID string) (map[string]interface{}, error) {
	ss.logger.Debug("[SyncService] Getting sync status for project: %s", projectID)

	status, err := ss.syncClient.GetFolderStatus(projectID)
	if err != nil {
		ss.logger.Error("[SyncService] Failed to get folder status: %v", err)
		return nil, err
	}

	return status, nil
}
