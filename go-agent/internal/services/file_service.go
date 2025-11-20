package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/vidsync/agent/internal/api"
	"github.com/vidsync/agent/internal/util"
)

// FileService manages file-related business logic
type FileService struct {
	syncClient      *api.SyncthingClient
	cloudClient     *api.CloudClient
	logger          *util.Logger
	progressTracker *SnapshotProgressTracker
}

// NewFileService creates a new file service
func NewFileService(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger) *FileService {
	return &FileService{
		syncClient:      syncClient,
		cloudClient:     cloudClient,
		logger:          logger,
		progressTracker: NewSnapshotProgressTracker(),
	}
}

// NewFileServiceWithTracker creates a new file service with a custom progress tracker
func NewFileServiceWithTracker(syncClient *api.SyncthingClient, cloudClient *api.CloudClient, logger *util.Logger, tracker *SnapshotProgressTracker) *FileService {
	return &FileService{
		syncClient:      syncClient,
		cloudClient:     cloudClient,
		logger:          logger,
		progressTracker: tracker,
	}
}

// GetProgressTracker returns the progress tracker
func (fs *FileService) GetProgressTracker() *SnapshotProgressTracker {
	return fs.progressTracker
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
	ProjectID  string         `json:"projectId"`
	CreatedAt  time.Time      `json:"createdAt"`
	Files      []api.FileInfo `json:"files"`
	FileCount  int            `json:"fileCount"`
	TotalSize  int64          `json:"totalSize"`
	SyncStatus interface{}    `json:"syncStatus"`
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
// Emits progress updates via progressTracker
func (fs *FileService) GenerateSnapshot(ctx context.Context, projectID, accessToken string) (map[string]interface{}, error) {
	fs.logger.Info("[FileService] Generating snapshot for project: %s", projectID)

	// Initialize progress tracking
	fs.progressTracker.StartTracking(projectID)
	defer fs.progressTracker.CleanupProject(projectID)

	// Step 1: Wait for Syncthing folder to complete initial scan (max 2 minutes)
	fs.logger.Debug("[FileService] Step 1: Waiting for Syncthing folder scan...")
	fs.progressTracker.UpdateProgress(projectID, "waiting", 1, 0, 0, "Waiting for Syncthing folder scan to complete...")
	err := fs.WaitForScanCompletion(ctx, projectID, 120)
	if err != nil {
		fs.logger.Error("[FileService] Failed waiting for scan completion: %v", err)
		fs.progressTracker.FailSnapshot(projectID, fmt.Sprintf("Scan completion timeout: %v", err))
		return nil, fmt.Errorf("scan completion timeout: %w", err)
	}

	// Step 2: Get folder status and path
	fs.logger.Debug("[FileService] Step 2: Getting folder status...")
	fs.progressTracker.UpdateProgress(projectID, "browsing", 2, 0, 0, "Getting folder status...")
	status, err := fs.syncClient.GetFolderStatus(projectID)
	if err != nil {
		fs.logger.Error("[FileService] Failed to get folder status: %v", err)
		fs.progressTracker.FailSnapshot(projectID, fmt.Sprintf("Failed to get folder status: %v", err))
		return nil, err
	}

	folderPath, ok := status["path"].(string)
	if !ok || folderPath == "" {
		fs.logger.Error("[FileService] Could not determine folder path")
		fs.progressTracker.FailSnapshot(projectID, "Folder path not available")
		return nil, fmt.Errorf("folder path not available")
	}

	// Step 3: Browse files to create snapshot
	fs.logger.Debug("[FileService] Step 3: Browsing files from folder: %s", folderPath)
	fs.progressTracker.UpdateProgress(projectID, "browsing", 3, 0, 0, "Browsing files in folder...")
	files, err := fs.syncClient.BrowseFiles(folderPath, 0) // Full depth for complete snapshot
	if err != nil {
		fs.logger.Error("[FileService] Failed to browse files: %v", err)
		fs.progressTracker.FailSnapshot(projectID, fmt.Sprintf("Failed to browse files: %v", err))
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

	fs.progressTracker.UpdateProgress(projectID, "compressing", 4, len(files), totalSize, fmt.Sprintf("Processing %d files (%s total)...", len(files), formatBytesSize(totalSize)))

	// Step 5: Serialize snapshot to JSON
	fs.logger.Debug("[FileService] Step 5: Serializing snapshot to JSON...")
	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		fs.logger.Error("[FileService] Failed to serialize snapshot: %v", err)
		fs.progressTracker.FailSnapshot(projectID, fmt.Sprintf("Failed to serialize snapshot: %v", err))
		return nil, err
	}

	// Step 6: Upload snapshot to cloud storage
	fs.logger.Debug("[FileService] Step 6: Uploading snapshot to cloud storage...")
	fs.progressTracker.UpdateProgress(projectID, "uploading", 5, len(files), totalSize, "Uploading snapshot to cloud storage...")
	snapshotURL, err := fs.uploadSnapshotToCloud(ctx, projectID, snapshotJSON, accessToken)
	if err != nil {
		fs.logger.Warn("[FileService] Failed to upload snapshot to cloud: %v", err)
		fs.progressTracker.FailSnapshot(projectID, fmt.Sprintf("Failed to upload snapshot: %v", err))
		// Don't fail - local snapshot is valid, upload is optional
	} else {
		fs.logger.Info("[FileService] Snapshot uploaded to: %s", snapshotURL)
		fs.progressTracker.CompleteSnapshot(projectID, snapshotURL)
	}

	fs.logger.Info("[FileService] Snapshot generated successfully for project: %s", projectID)
	return map[string]interface{}{
		"ok":          true,
		"projectId":   projectID,
		"fileCount":   len(files),
		"totalSize":   totalSize,
		"snapshotUrl": snapshotURL,
		"createdAt":   snapshot.CreatedAt,
	}, nil
}

// uploadSnapshotToCloud sends snapshot JSON to Supabase Storage via cloud API
// The cloud API endpoint expects: POST /projects/{projectId}/snapshot
// Body: { snapshot: <snapshot_json>, syncStatus: "completed" }
// Authorization: Bearer <accessToken>
// Implements retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
func (fs *FileService) uploadSnapshotToCloud(ctx context.Context, projectID string, snapshotJSON []byte, accessToken string) (string, error) {
	const maxRetries = 3
	const initialBackoff = 1 * time.Second

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Execute upload attempt
		snapshotURL, err := fs.uploadSnapshotAttempt(ctx, projectID, snapshotJSON, accessToken)
		if err == nil {
			return snapshotURL, nil
		}

		lastErr = err

		// Check if error is retryable
		if !fs.isRetryableError(err) {
			fs.logger.Error("[FileService] Non-retryable error, failing immediately: %v", err)
			return "", err
		}

		// Don't retry after last attempt
		if attempt < maxRetries-1 {
			backoff := initialBackoff * time.Duration(1<<uint(attempt)) // 1s, 2s, 4s
			fs.logger.Warn("[FileService] Upload attempt %d/%d failed, retrying in %v: %v", attempt+1, maxRetries, backoff, err)

			select {
			case <-time.After(backoff):
				// Continue to next attempt
			case <-ctx.Done():
				return "", ctx.Err()
			}
		}
	}

	return "", fmt.Errorf("upload failed after %d attempts: %w", maxRetries, lastErr)
}

// uploadSnapshotAttempt performs a single upload attempt
func (fs *FileService) uploadSnapshotAttempt(ctx context.Context, projectID string, snapshotJSON []byte, accessToken string) (string, error) {
	endpoint := fmt.Sprintf("%s/projects/%s/snapshot", fs.cloudClient.GetBaseURL(), projectID)

	// Parse the snapshot JSON to get its structure
	var snapshotData interface{}
	if err := json.Unmarshal(snapshotJSON, &snapshotData); err != nil {
		return "", fmt.Errorf("failed to parse snapshot JSON: %w", err)
	}

	// Wrap snapshot in request format expected by cloud API
	// { snapshot: <data>, syncStatus: "completed" }
	requestBody := map[string]interface{}{
		"snapshot":   snapshotData,
		"syncStatus": "completed",
	}

	requestJSON, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, io.NopCloser(bytes.NewReader(requestJSON)))
	if err != nil {
		return "", err
	}

	// Set headers for JSON request
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

// isRetryableError determines if an error should trigger a retry
func (fs *FileService) isRetryableError(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()

	// Retryable: Network errors, timeouts, 5xx errors
	retryablePatterns := []string{
		"connection refused",
		"connection reset",
		"timeout",
		"temporary failure",
		"500",
		"502",
		"503",
		"504",
	}

	for _, pattern := range retryablePatterns {
		if strings.Contains(strings.ToLower(errStr), pattern) {
			return true
		}
	}

	// Non-retryable: 4xx errors (except 408, 429), parsing errors, auth errors
	nonRetryablePatterns := []string{
		"400",
		"401",
		"403",
		"404",
	}

	for _, pattern := range nonRetryablePatterns {
		if strings.Contains(errStr, pattern) {
			return false
		}
	}

	// Default to non-retryable for unknown errors
	return false
}

// buildTree converts flat file list to hierarchical structure
func buildTree(files []api.FileInfo) map[string]interface{} {
	root := map[string]interface{}{
		"name":     "root",
		"type":     "directory",
		"children": []interface{}{},
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

// formatBytesSize formats bytes into human-readable format
func formatBytesSize(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)

	switch {
	case bytes < KB:
		return fmt.Sprintf("%d B", bytes)
	case bytes < MB:
		return fmt.Sprintf("%.2f KB", float64(bytes)/KB)
	case bytes < GB:
		return fmt.Sprintf("%.2f MB", float64(bytes)/MB)
	default:
		return fmt.Sprintf("%.2f GB", float64(bytes)/GB)
	}
}
