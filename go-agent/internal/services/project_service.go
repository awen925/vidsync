package services

import (
	"context"
	"fmt"
	"time"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/util"
)

// ProjectService manages project-related business logic
type ProjectService struct {
	syncClient  *api.SyncthingClient
	cloudClient *api.CloudClient
	fileService *FileService
	logger      *util.Logger
}

// NewProjectService creates a new project service
func NewProjectService(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger) *ProjectService {
	return &ProjectService{
		syncClient:  syncClient,
		cloudClient: cloudClient,
		fileService: NewFileService(syncClient, cloudClient, logger),
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
	ps.logger.Info("[ProjectService] CreateProject started for: %s", req.ProjectID)
	ps.logger.Debug("[ProjectService] CreateProject request: projectId=%s, name=%s, localPath=%s, deviceId=%s, ownerId=%s",
		req.ProjectID, req.Name, req.LocalPath, req.DeviceID, req.OwnerID)

	// Create folder in Syncthing
	ps.logger.Info("[ProjectService] STEP 1: Creating Syncthing folder for project: %s", req.ProjectID)
	err := ps.syncClient.AddFolder(req.ProjectID, req.Name, req.LocalPath)
	if err != nil {
		ps.logger.Error("[ProjectService] STEP 1 FAILED: Failed to create Syncthing folder: %v", err)
		return &CreateProjectResponse{OK: false, Error: err.Error()}, err
	}

	ps.logger.Info("[ProjectService] STEP 1 SUCCESS: Syncthing folder created")

	// Notify cloud about project creation (non-blocking)
	ps.logger.Info("[ProjectService] STEP 2: Notifying cloud about project creation")
	payload := map[string]interface{}{
		"projectId": req.ProjectID,
		"name":      req.Name,
		"localPath": req.LocalPath,
		"deviceId":  req.DeviceID,
		"ownerId":   req.OwnerID,
		"status":    "active",
	}
	ps.logger.Debug("[ProjectService] STEP 2: Cloud API payload: %+v", payload)

	_, err = ps.cloudClient.PostWithAuth(
		"/projects",
		payload,
		req.AccessToken,
	)
	if err != nil {
		ps.logger.Error("[ProjectService] STEP 2 FAILED: Failed to notify cloud about project creation: %v", err)
		// Don't fail - local folder was created, cloud update is secondary
	} else {
		ps.logger.Info("[ProjectService] STEP 2 SUCCESS: Cloud notified about project creation")
	}

	ps.logger.Info("[ProjectService] CreateProject completed successfully: %s", req.ProjectID)
	return &CreateProjectResponse{OK: true, ProjectID: req.ProjectID}, nil
}

// CreateProjectWithSnapshot implements the full async event order:
// 1. Create project record in cloud database
// 2. Get projectId from cloud response
// 3. Create shared folder in Syncthing using projectId
// 4. Listen for folder scan completion
// 5. Browse files and generate JSON snapshot
// 6. Upload snapshot to Supabase storage
// This method is used when creating a project with an existing local path
func (ps *ProjectService) CreateProjectWithSnapshot(ctx context.Context, req *CreateProjectRequest) (*CreateProjectResponse, error) {
	ps.logger.Info("[ProjectService] CreateProjectWithSnapshot started for: %s", req.Name)
	ps.logger.Debug("[ProjectService] CreateProjectWithSnapshot request: projectId=%s, name=%s, localPath=%s, deviceId=%s, ownerId=%s",
		req.ProjectID, req.Name, req.LocalPath, req.DeviceID, req.OwnerID)

	// STEP 1: Create project in cloud database first
	ps.logger.Info("[ProjectService] STEP 1: Creating project in cloud database...")
	payload := map[string]interface{}{
		"name":       req.Name,
		"local_path": req.LocalPath,
		"deviceId":   req.DeviceID,
		"ownerId":    req.OwnerID,
		"status":     "active",
	}
	ps.logger.Debug("[ProjectService] STEP 1: Cloud API payload: %+v", payload)

	cloudResponse, err := ps.cloudClient.PostWithAuth(
		"/projects",
		payload,
		req.AccessToken,
	)
	if err != nil {
		ps.logger.Error("[ProjectService] STEP 1 FAILED: Failed to create project in cloud: %v", err)
		return &CreateProjectResponse{OK: false, Error: err.Error()}, err
	}

	ps.logger.Info("[ProjectService] STEP 1 SUCCESS: Project created in cloud")
	ps.logger.Debug("[ProjectService] STEP 1: Cloud response: %+v", cloudResponse)

	// Extract projectId from cloud response
	projectID := req.ProjectID
	if cloudProjectID, ok := cloudResponse["projectId"].(string); ok && cloudProjectID != "" {
		projectID = cloudProjectID
		ps.logger.Info("[ProjectService] Cloud assigned projectId: %s", projectID)
	}

	// STEP 2: Create Syncthing folder
	ps.logger.Info("[ProjectService] STEP 2: Creating Syncthing folder...")
	ps.logger.Debug("[ProjectService] STEP 2: Adding folder to Syncthing: id=%s, label=%s, path=%s", projectID, req.Name, req.LocalPath)
	err = ps.syncClient.AddFolder(projectID, req.Name, req.LocalPath)
	if err != nil {
		ps.logger.Error("[ProjectService] STEP 2 FAILED: Failed to create Syncthing folder: %v", err)
		return &CreateProjectResponse{OK: false, Error: err.Error()}, err
	}
	ps.logger.Info("[ProjectService] STEP 2 SUCCESS: Syncthing folder created: %s", projectID)

	// STEP 3: Asynchronously generate snapshot (don't block project creation)
	// Return success immediately, snapshot generation happens in background
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		ps.logger.Info("[ProjectService] STEP 3: Starting background snapshot generation...")

		// Wait for folder scan to complete
		ps.logger.Info("[ProjectService] STEP 3a: Waiting for Syncthing folder scan to complete...")
		err := ps.fileService.WaitForScanCompletion(ctx, projectID, 120)
		if err != nil {
			ps.logger.Error("[ProjectService] STEP 3a FAILED: Failed to wait for scan: %v", err)
			return
		}
		ps.logger.Info("[ProjectService] STEP 3a SUCCESS: Folder scan completed")

		// Generate snapshot
		ps.logger.Info("[ProjectService] STEP 3b: Generating file snapshot...")
		_, err = ps.fileService.GenerateSnapshot(ctx, projectID, req.AccessToken)
		if err != nil {
			ps.logger.Error("[ProjectService] STEP 3b FAILED: Failed to generate snapshot: %v", err)
			// Don't fail - snapshot is optional
			return
		}
		ps.logger.Info("[ProjectService] STEP 3b SUCCESS: File snapshot generated and uploaded")
	}()

	ps.logger.Info("[ProjectService] CreateProjectWithSnapshot completed successfully: %s", projectID)
	return &CreateProjectResponse{OK: true, ProjectID: projectID}, nil
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

	ps.logger.Info("[ProjectService] Syncthing folder removed, notifying cloud...")

	// Notify cloud about project deletion (non-blocking)
	err = ps.cloudClient.PutWithAuth(
		fmt.Sprintf("/projects/%s", projectID),
		map[string]interface{}{"status": "deleted"},
		accessToken,
	)
	if err != nil {
		ps.logger.Warn("[ProjectService] Failed to notify cloud about project deletion: %v", err)
		// Don't fail - folder was deleted locally
	} else {
		ps.logger.Info("[ProjectService] Cloud notified about project deletion")
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

	ps.logger.Info("[ProjectService] Device added to Syncthing, notifying cloud...")

	// Notify cloud about device addition (non-blocking)
	_, err = ps.cloudClient.PostWithAuth(
		fmt.Sprintf("/projects/%s/devices", projectID),
		map[string]interface{}{"deviceId": deviceID},
		accessToken,
	)
	if err != nil {
		ps.logger.Warn("[ProjectService] Failed to notify cloud about device addition: %v", err)
		// Don't fail - device was added locally
	} else {
		ps.logger.Info("[ProjectService] Cloud notified about device addition")
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

	ps.logger.Info("[ProjectService] Device removed from Syncthing, notifying cloud...")

	// Notify cloud about device removal (non-blocking)
	err = ps.cloudClient.PutWithAuth(
		fmt.Sprintf("/projects/%s/devices/%s", projectID, deviceID),
		map[string]interface{}{"status": "removed"},
		accessToken,
	)
	if err != nil {
		ps.logger.Warn("[ProjectService] Failed to notify cloud about device removal: %v", err)
		// Don't fail - device was removed locally
	} else {
		ps.logger.Info("[ProjectService] Cloud notified about device removal")
	}

	ps.logger.Info("[ProjectService] Device removed successfully from project: %s", projectID)
	return nil
}

// GetProjectStatus gets project snapshot and sync status
// Used for polling during snapshot generation
func (ps *ProjectService) GetProjectStatus(ctx context.Context, projectID string) (map[string]interface{}, error) {
	ps.logger.Debug("[ProjectService] Getting project status: %s", projectID)

	// Get Syncthing folder status
	status, err := ps.syncClient.GetFolderStatus(projectID)
	if err != nil {
		ps.logger.Error("[ProjectService] Failed to get folder status: %v", err)
		return nil, err
	}

	// Return current project status
	// In a real implementation, this could check a database or cache for snapshot generation status
	// For now, just return Syncthing status
	return map[string]interface{}{
		"projectId": projectID,
		"status":    status,
	}, nil
}
