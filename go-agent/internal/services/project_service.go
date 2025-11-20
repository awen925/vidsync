package services

import (
	"context"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/util"
)

// ProjectService manages project-related business logic
type ProjectService struct {
	syncClient  *api.SyncthingClient
	cloudClient *api.CloudClient
	logger      *util.Logger
}

// NewProjectService creates a new project service
func NewProjectService(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger) *ProjectService {
	return &ProjectService{
		syncClient:  syncClient,
		cloudClient: cloudClient,
		logger:      logger,
	}
}

// CreateProjectRequest is the request to create a project
type CreateProjectRequest struct {
	ProjectID   string
	Name        string
	LocalPath   string
	DeviceID    string
	OwnerID     string
	AccessToken string
}

// CreateProjectResponse is the response from creating a project
type CreateProjectResponse struct {
	OK        bool   `json:"ok"`
	ProjectID string `json:"projectId,omitempty"`
	Error     string `json:"error,omitempty"`
}

// CreateProject creates a new project with Syncthing folder
func (ps *ProjectService) CreateProject(ctx context.Context, req *CreateProjectRequest) (*CreateProjectResponse, error) {
	ps.logger.Info("[ProjectService] Creating project: %s", req.ProjectID)

	// Create folder in Syncthing
	err := ps.syncClient.AddFolder(req.ProjectID, req.Name, req.LocalPath)
	if err != nil {
		ps.logger.Error("[ProjectService] Failed to create Syncthing folder: %v", err)
		return &CreateProjectResponse{OK: false, Error: err.Error()}, err
	}

	ps.logger.Info("[ProjectService] Project created successfully: %s", req.ProjectID)
	return &CreateProjectResponse{OK: true, ProjectID: req.ProjectID}, nil
}

// GetProjectResponse is the response from getting project details
type GetProjectResponse struct {
	ProjectID string      `json:"projectId"`
	Name      string      `json:"name"`
	LocalPath string      `json:"localPath"`
	Status    interface{} `json:"status,omitempty"`
}

// GetProject gets project details with Syncthing status
func (ps *ProjectService) GetProject(ctx context.Context, projectID string) (*GetProjectResponse, error) {
	ps.logger.Info("[ProjectService] Getting project: %s", projectID)

	// Get status from Syncthing
	status, err := ps.syncClient.GetFolderStatus(projectID)
	if err != nil {
		ps.logger.Error("[ProjectService] Failed to get Syncthing status: %v", err)
		return nil, err
	}

	return &GetProjectResponse{
		ProjectID: projectID,
		Status:    status,
	}, nil
}

// DeleteProject deletes a project and its Syncthing folder
func (ps *ProjectService) DeleteProject(ctx context.Context, projectID, accessToken string) error {
	ps.logger.Info("[ProjectService] Deleting project: %s", projectID)

	// Remove folder from Syncthing
	err := ps.syncClient.RemoveFolder(projectID)
	if err != nil {
		ps.logger.Error("[ProjectService] Failed to remove Syncthing folder: %v", err)
		return err
	}

	ps.logger.Info("[ProjectService] Project deleted successfully: %s", projectID)
	return nil
}

// AddDevice adds a device to a project folder
func (ps *ProjectService) AddDevice(ctx context.Context, projectID, deviceID, accessToken string) (map[string]interface{}, error) {
	ps.logger.Info("[ProjectService] Adding device to project: %s -> %s", projectID, deviceID)

	// Add device to folder in Syncthing
	err := ps.syncClient.AddDeviceToFolder(projectID, deviceID)
	if err != nil {
		ps.logger.Error("[ProjectService] Failed to add device to Syncthing folder: %v", err)
		return map[string]interface{}{"ok": false, "error": err.Error()}, err
	}

	ps.logger.Info("[ProjectService] Device added successfully to project: %s", projectID)
	return map[string]interface{}{"ok": true}, nil
}

// RemoveDevice removes a device from a project folder
func (ps *ProjectService) RemoveDevice(ctx context.Context, projectID, deviceID, accessToken string) error {
	ps.logger.Info("[ProjectService] Removing device from project: %s -> %s", projectID, deviceID)

	// Remove device from folder in Syncthing
	err := ps.syncClient.RemoveDeviceFromFolder(projectID, deviceID)
	if err != nil {
		ps.logger.Error("[ProjectService] Failed to remove device from Syncthing folder: %v", err)
		return err
	}

	ps.logger.Info("[ProjectService] Device removed successfully from project: %s", projectID)
	return nil
}
