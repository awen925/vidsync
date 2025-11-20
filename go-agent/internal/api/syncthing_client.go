package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// SyncthingClient is an HTTP client for Syncthing API
type SyncthingClient struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

// NewSyncthingClient creates a new Syncthing API client
func NewSyncthingClient(baseURL, apiKey string) *SyncthingClient {
	return &SyncthingClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// AddFolder adds a folder to Syncthing
func (sc *SyncthingClient) AddFolder(folderID, folderLabel, folderPath string) error {
	payload := map[string]interface{}{
		"id":              folderID,
		"label":           folderLabel,
		"path":            folderPath,
		"type":            "sendreceive",
		"devices":         []map[string]string{},
		"autoNormalize":   true,
		"rescanIntervalS": 3600,
	}

	return sc.postConfig("folders", payload)
}

// AddFolderReceiveOnly adds a folder to Syncthing with receiveonly type
// This is used when an invitee device joins a shared folder
// The invitee can only RECEIVE files, not send them back
func (sc *SyncthingClient) AddFolderReceiveOnly(folderID, folderLabel, folderPath string, ownerDeviceID string) error {
	payload := map[string]interface{}{
		"id":    folderID,
		"label": folderLabel,
		"path":  folderPath,
		"type":  "receiveonly", // ← KEY: Receive-only prevents uploads
		"devices": []map[string]string{
			{
				"deviceID": ownerDeviceID,
			},
		},
		"autoNormalize":   true,
		"rescanIntervalS": 3600,
	}

	return sc.postConfig("folders", payload)
}

// AddDevice adds a device to Syncthing
func (sc *SyncthingClient) AddDevice(deviceID, deviceName string) error {
	payload := map[string]interface{}{
		"deviceID":  deviceID,
		"name":      deviceName,
		"addresses": []string{"dynamic"},
	}

	return sc.postConfig("devices", payload)
}

// PauseFolder pauses a folder
func (sc *SyncthingClient) PauseFolder(folderID string) error {
	return sc.post(fmt.Sprintf("/rest/db/pause?folder=%s", folderID), nil)
}

// ResumeFolder resumes a folder
func (sc *SyncthingClient) ResumeFolder(folderID string) error {
	return sc.post(fmt.Sprintf("/rest/db/resume?folder=%s", folderID), nil)
}

// Rescan rescans a folder
func (sc *SyncthingClient) Rescan(folderID string) error {
	return sc.post(fmt.Sprintf("/rest/db/scan?folder=%s", folderID), nil)
}

// GetStatus gets Syncthing status
func (sc *SyncthingClient) GetStatus() (map[string]interface{}, error) {
	return sc.get("/rest/system/status")
}

// GetFolderStatus gets folder status
func (sc *SyncthingClient) GetFolderStatus(folderID string) (map[string]interface{}, error) {
	return sc.get(fmt.Sprintf("/rest/db/status?folder=%s", folderID))
}

// FileInfo represents file metadata for snapshot
type FileInfo struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	Size        int64     `json:"size"`
	IsDirectory bool      `json:"isDirectory"`
	ModTime     time.Time `json:"modTime"`
	Hash        string    `json:"hash,omitempty"`
}

// BrowseFiles returns a hierarchical file tree from a filesystem path
// Used after Syncthing folder is scanned
func (sc *SyncthingClient) BrowseFiles(folderPath string, maxDepth int) ([]FileInfo, error) {
	var files []FileInfo
	err := filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip inaccessible files
		}

		// Calculate depth
		relPath, _ := filepath.Rel(folderPath, path)
		depth := len(filepath.SplitList(relPath))
		if maxDepth > 0 && depth > maxDepth {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		files = append(files, FileInfo{
			Name:        info.Name(),
			Path:        relPath,
			Size:        info.Size(),
			IsDirectory: info.IsDir(),
			ModTime:     info.ModTime(),
		})

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to browse files: %w", err)
	}

	return files, nil
}

// RemoveFolder removes a folder from Syncthing
func (sc *SyncthingClient) RemoveFolder(folderID string) error {
	req, err := http.NewRequest("DELETE", sc.baseURL+"/rest/config/folders/"+folderID, nil)
	if err != nil {
		return err
	}
	return sc.doRequest(req)
}

// AddDeviceToFolder adds a device to a folder
func (sc *SyncthingClient) AddDeviceToFolder(folderID, deviceID string) error {
	// Get current folder config
	folderConfig, err := sc.get("/rest/config/folders/" + folderID)
	if err != nil {
		return err
	}

	// Add device to devices list
	devices, ok := folderConfig["devices"].([]interface{})
	if !ok {
		devices = []interface{}{}
	}

	// Check if device already exists
	for _, d := range devices {
		if device, ok := d.(map[string]interface{}); ok {
			if device["deviceID"] == deviceID {
				return nil // Device already in folder
			}
		}
	}

	// Add new device
	devices = append(devices, map[string]interface{}{
		"deviceID": deviceID,
	})
	folderConfig["devices"] = devices

	// Update folder config
	data, err := json.Marshal(folderConfig)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", sc.baseURL+"/rest/config/folders/"+folderID, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	return sc.doRequest(req)
}

// RemoveDeviceFromFolder removes a device from a folder
func (sc *SyncthingClient) RemoveDeviceFromFolder(folderID, deviceID string) error {
	// Get current folder config
	folderConfig, err := sc.get("/rest/config/folders/" + folderID)
	if err != nil {
		return err
	}

	// Remove device from devices list
	devices, ok := folderConfig["devices"].([]interface{})
	if !ok {
		return nil // No devices to remove
	}

	// Filter out the device
	var filteredDevices []interface{}
	for _, d := range devices {
		if device, ok := d.(map[string]interface{}); ok {
			if device["deviceID"] != deviceID {
				filteredDevices = append(filteredDevices, d)
			}
		} else {
			filteredDevices = append(filteredDevices, d)
		}
	}

	folderConfig["devices"] = filteredDevices

	// Update folder config
	data, err := json.Marshal(folderConfig)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", sc.baseURL+"/rest/config/folders/"+folderID, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	return sc.doRequest(req)
}

func (sc *SyncthingClient) postConfig(endpoint string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", sc.baseURL+"/rest/config/"+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	return sc.doRequest(req)
}

func (sc *SyncthingClient) post(endpoint string, payload interface{}) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewBuffer(data)
	}

	req, err := http.NewRequest("POST", sc.baseURL+endpoint, body)
	if err != nil {
		return err
	}

	return sc.doRequest(req)
}

func (sc *SyncthingClient) get(endpoint string) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", sc.baseURL+endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := sc.doReq(req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	return result, nil
}

func (sc *SyncthingClient) doRequest(req *http.Request) error {
	_, err := sc.doReq(req)
	return err
}

func (sc *SyncthingClient) doReq(req *http.Request) ([]byte, error) {
	req.Header.Set("X-API-Key", sc.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := sc.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("syncthing API error: %d - %s", resp.StatusCode, string(body))
	}

	return body, nil
}
