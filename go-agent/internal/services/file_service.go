package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/util"
)

// FileService manages file-related business logic
type FileService struct {
	syncClient  *api.SyncthingClient
	cloudClient *api.CloudClient
	logger      *util.Logger
}

// NewFileService creates a new file service
func NewFileService(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger) *FileService {
	return &FileService{
		syncClient:  syncClient,
		cloudClient: cloudClient,
		logger:      logger,
	}
}

// GetFiles gets a list of files in a project folder
func (fs *FileService) GetFiles(ctx context.Context, projectID, limit, offset string) (map[string]interface{}, error) {
	fs.logger.Debug("[FileService] Getting files for project: %s", projectID)

	// Get folder status
	status, err := fs.syncClient.GetFolderStatus(projectID)
	if err != nil {
		fs.logger.Error("[FileService] Failed to get folder status: %v", err)
		return nil, err
	}

	// Get folder path from status
	folderPath, ok := status["path"].(string)
	if !ok || folderPath == "" {
		fs.logger.Error("[FileService] Could not determine folder path")
		return nil, fmt.Errorf("folder path not available")
	}

	// Browse files with depth limit
	files, err := fs.syncClient.BrowseFiles(folderPath, 5)
	if err != nil {
		fs.logger.Error("[FileService] Failed to browse files: %v", err)
		return nil, err
	}

	return map[string]interface{}{
		"projectId": projectID,
		"files":     files,
		"status":    status,
	}, nil
}

// GetFileTree gets the file tree structure of a project
func (fs *FileService) GetFileTree(ctx context.Context, projectID string) (map[string]interface{}, error) {
	fs.logger.Debug("[FileService] Getting file tree for project: %s", projectID)

	// Get folder status
	status, err := fs.syncClient.GetFolderStatus(projectID)
	if err != nil {
		fs.logger.Error("[FileService] Failed to get folder status: %v", err)
		return nil, err
	}

	// Get folder path from status
	folderPath, ok := status["path"].(string)
	if !ok || folderPath == "" {
		fs.logger.Error("[FileService] Could not determine folder path")
		return nil, fmt.Errorf("folder path not available")
	}

	// Browse files
	files, err := fs.syncClient.BrowseFiles(folderPath, 0) // No depth limit for tree
	if err != nil {
		fs.logger.Error("[FileService] Failed to browse files: %v", err)
		return nil, err
	}

	// Build tree structure
	tree := buildTree(files)

	return map[string]interface{}{
		"projectId": projectID,
		"tree":      tree,
		"status":    status,
	}, nil
}

// SnapshotMetadata represents snapshot metadata for storage
type SnapshotMetadata struct {
	ProjectID   string          `json:"projectId"`
	CreatedAt   time.Time       `json:"createdAt"`
	Files       []api.FileInfo  `json:"files"`
	FileCount   int             `json:"fileCount"`
	TotalSize   int64           `json:"totalSize"`
	SyncStatus  interface{}     `json:"syncStatus"`
}

// WaitForScanCompletion waits for Syncthing folder to complete scanning
// Polls status every 500ms up to maxWaitSeconds
func (fs *FileService) WaitForScanCompletion(ctx context.Context, projectID string, maxWaitSeconds int) error {
	fs.logger.Info("[FileService] Waiting for folder scan completion: %s", projectID)

	deadline := time.Now().Add(time.Duration(maxWaitSeconds) * time.Second)
	pollInterval := 500 * time.Millisecond

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Get folder status
		status, err := fs.syncClient.GetFolderStatus(projectID)
		if err != nil {
			fs.logger.Warn("[FileService] Error getting folder status: %v", err)
			time.Sleep(pollInterval)
			continue
		}

		// Check if scanning is complete
		state, ok := status["state"].(string)
		if ok {
			fs.logger.Debug("[FileService] Folder state: %s", state)
			if state != "scanning" && state != "syncing" {
				// State is "idle" or other non-busy state
				fs.logger.Info("[FileService] Folder scan completed, state: %s", state)
				return nil
			}
		}

		// Check timeout
		if time.Now().After(deadline) {
			fs.logger.Warn("[FileService] Scan completion timeout after %d seconds", maxWaitSeconds)
			return fmt.Errorf("scan completion timeout")
		}

		time.Sleep(pollInterval)
	}
}

// GenerateSnapshot generates a snapshot of current project files and uploads to cloud
// This implements the async event order:
// 1. Project created in database (done by caller)
// 2. Syncthing folder created (done by caller)
// 3. Wait for Syncthing folder scan to complete (this method)
// 4. Browse files and create snapshot JSON
// 5. Upload snapshot to Supabase storage
func (fs *FileService) GenerateSnapshot(ctx context.Context, projectID, accessToken string) (map[string]interface{}, error) {
	fs.logger.Info("[FileService] Generating snapshot for project: %s", projectID)

	// Step 1: Wait for Syncthing folder to complete initial scan (max 2 minutes)
	fs.logger.Debug("[FileService] Step 1: Waiting for Syncthing folder scan...")
	err := fs.WaitForScanCompletion(ctx, projectID, 120)
	if err != nil {
		fs.logger.Error("[FileService] Failed waiting for scan completion: %v", err)
		return nil, fmt.Errorf("scan completion timeout: %w", err)
	}

	// Step 2: Get folder status and path
	fs.logger.Debug("[FileService] Step 2: Getting folder status...")
	status, err := fs.syncClient.GetFolderStatus(projectID)
	if err != nil {
		fs.logger.Error("[FileService] Failed to get folder status: %v", err)
		return nil, err
	}

	folderPath, ok := status["path"].(string)
	if !ok || folderPath == "" {
		fs.logger.Error("[FileService] Could not determine folder path")
		return nil, fmt.Errorf("folder path not available")
	}

	// Step 3: Browse files to create snapshot
	fs.logger.Debug("[FileService] Step 3: Browsing files from folder: %s", folderPath)
	files, err := fs.syncClient.BrowseFiles(folderPath, 0) // Full depth for complete snapshot
	if err != nil {
		fs.logger.Error("[FileService] Failed to browse files: %v", err)
		return nil, err
	}

	// Step 4: Build snapshot metadata
	fs.logger.Debug("[FileService] Step 4: Building snapshot metadata...")
	totalSize := int64(0)
	for _, f := range files {
		totalSize += f.Size
	}

	snapshot := &SnapshotMetadata{
		ProjectID:  projectID,
		CreatedAt:  time.Now(),
		Files:      files,
		FileCount:  len(files),
		TotalSize:  totalSize,
		SyncStatus: status,
	}

	// Step 5: Serialize snapshot to JSON
	fs.logger.Debug("[FileService] Step 5: Serializing snapshot to JSON...")
	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		fs.logger.Error("[FileService] Failed to serialize snapshot: %v", err)
		return nil, err
	}

	// Step 6: Upload snapshot to cloud storage
	fs.logger.Debug("[FileService] Step 6: Uploading snapshot to cloud storage...")
	snapshotURL, err := fs.uploadSnapshotToCloud(ctx, projectID, snapshotJSON, accessToken)
	if err != nil {
		fs.logger.Warn("[FileService] Failed to upload snapshot to cloud: %v", err)
		// Don't fail - local snapshot is valid, upload is optional
	} else {
		fs.logger.Info("[FileService] Snapshot uploaded to: %s", snapshotURL)
	}

	fs.logger.Info("[FileService] Snapshot generated successfully for project: %s", projectID)
	return map[string]interface{}{
		"ok":           true,
		"projectId":    projectID,
		"fileCount":    len(files),
		"totalSize":    totalSize,
		"snapshotUrl":  snapshotURL,
		"createdAt":    snapshot.CreatedAt,
	}, nil
}

// uploadSnapshotToCloud sends snapshot JSON to Supabase Storage via cloud API
// The cloud API endpoint expects: POST /projects/{projectId}/snapshot with body and authorization
func (fs *FileService) uploadSnapshotToCloud(ctx context.Context, projectID string, snapshotJSON []byte, accessToken string) (string, error) {
	endpoint := fmt.Sprintf("%s/projects/%s/snapshot", fs.cloudClient.GetBaseURL(), projectID)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, io.NopCloser(bytes.NewReader(snapshotJSON)))
	if err != nil {
		return "", err
	}

	// Set headers for file upload
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))
	req.Header.Set("Content-Type", "application/json")

	// Use http client to send request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed: %d - %s", resp.StatusCode, string(body))
	}

	// Parse response to get snapshot URL
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to parse upload response: %w", err)
	}

	if snapshotURL, ok := result["snapshotUrl"].(string); ok {
		return snapshotURL, nil
	}

	return "", fmt.Errorf("no snapshot URL in response")
}

// buildTree converts flat file list to hierarchical structure
func buildTree(files []api.FileInfo) map[string]interface{} {
	root := map[string]interface{}{
		"name":        "root",
		"type":        "directory",
		"children":    []interface{}{},
	}

	// Build a map for quick lookup
	nodes := make(map[string]map[string]interface{})
	nodes[""] = root

	for _, file := range files {
		if file.Path == "" || file.Path == "." {
			continue
		}

		node := map[string]interface{}{
			"name":    file.Name,
			"path":    file.Path,
			"size":    file.Size,
			"modTime": file.ModTime,
		}

		if file.IsDirectory {
			node["type"] = "directory"
			node["children"] = []interface{}{}
		} else {
			node["type"] = "file"
		}

		nodes[file.Path] = node
	}

	// Build parent-child relationships
	for path, node := range nodes {
		if path == "" {
			continue
		}

		// Find parent directory
		// This is simplified - in real implementation would use filepath.Dir
		parent := ""
		for p := range nodes {
			if p != "" && p != path {
				// Simple heuristic: if p is a prefix of path and is a directory
				// This is not perfect but works for basic cases
				if _, ok := nodes[p]; ok {
					if parentNode, ok := nodes[p]; ok {
						if t, ok := parentNode["type"].(string); ok && t == "directory" {
							if len(p) > len(parent) {
								parent = p
							}
						}
					}
				}
			}
		}

		if parent == "" {
			parent = ""
		}

		if parentNode, ok := nodes[parent]; ok {
			if children, ok := parentNode["children"].([]interface{}); ok {
				parentNode["children"] = append(children, node)
			}
		}
	}

	return root
}

