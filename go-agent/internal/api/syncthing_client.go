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
			Jar:     nil, // Explicitly disable cookie jar to prevent automatic cookie sending
		},
	}
}

// AddFolder adds a folder to Syncthing
func (sc *SyncthingClient) AddFolder(folderID, folderLabel, folderPath string) error {
	// Syncthing API only requires id and path for folder creation
	// Other fields like label, type, etc. can be added/modified separately if needed
	payload := map[string]interface{}{
		"id":   folderID,
		"path": folderPath,
	}

	fmt.Printf("[SyncthingClient] AddFolder payload: id=%s, path=%s\n", folderID, folderPath)
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

// GetFolderConfig gets folder configuration (includes path)
func (sc *SyncthingClient) GetFolderConfig(folderID string) (map[string]interface{}, error) {
	return sc.get(fmt.Sprintf("/rest/config/folders/%s", folderID))
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
	endpoint := "/rest/config/folders/" + folderID
	fmt.Printf("[SyncthingClient] DELETE %s\n", endpoint)
	req, err := http.NewRequest("DELETE", sc.baseURL+endpoint, nil)
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

	endpoint := "/rest/config/folders/" + folderID
	fmt.Printf("[SyncthingClient] PUT %s payload: %s\n", endpoint, string(data))
	req, err := http.NewRequest("PUT", sc.baseURL+endpoint, bytes.NewBuffer(data))
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

	endpoint := "/rest/config/folders/" + folderID
	fmt.Printf("[SyncthingClient] PUT %s payload: %s\n", endpoint, string(data))
	req, err := http.NewRequest("PUT", sc.baseURL+endpoint, bytes.NewBuffer(data))
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

	url := sc.baseURL + "/rest/config/" + endpoint
	fmt.Printf("[SyncthingClient] Calling: POST %s\n", url)
	fmt.Printf("[SyncthingClient] Payload: %s\n", string(data))

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(data))
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
		fmt.Printf("[SyncthingClient] POST %s payload: %s\n", endpoint, string(data))
		body = bytes.NewBuffer(data)
	}

	req, err := http.NewRequest("POST", sc.baseURL+endpoint, body)
	if err != nil {
		return err
	}

	return sc.doRequest(req)
}

func (sc *SyncthingClient) get(endpoint string) (map[string]interface{}, error) {
	fmt.Printf("[SyncthingClient] GET %s\n", endpoint)
	req, err := http.NewRequest("GET", sc.baseURL+endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := sc.doReq(req, false)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}
	// fmt.Printf("[SyncthingClient] GET response: %s\n", string(resp))

	return result, nil
}

func (sc *SyncthingClient) doRequest(req *http.Request) error {
	_, err := sc.doReq(req, false)
	return err
}

func (sc *SyncthingClient) doReq(req *http.Request, retried bool) ([]byte, error) {
	req.Header.Set("X-API-Key", sc.apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Explicitly remove any cookies to prevent interference with Syncthing API
	req.Header.Del("Cookie")

	// Log the API key being used for verification
	apiKeyPreview := sc.apiKey
	if len(sc.apiKey) > 20 {
		apiKeyPreview = sc.apiKey[:20] + "..."
	}
	fmt.Printf("[SyncthingClient] %s %s - Using X-API-Key: %s\n", req.Method, req.URL.Path, apiKeyPreview)
	fmt.Printf("[SyncthingClient] Headers: X-API-Key=%s, Content-Type=%s, Cookie=%v\n", apiKeyPreview, "application/json", req.Header.Get("Cookie"))

	resp, err := sc.client.Do(req)
	if err != nil {
		fmt.Printf("[SyncthingClient] Request error: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[SyncthingClient] Error reading response body: %v\n", err)
		return nil, err
	}

	fmt.Printf("[SyncthingClient] Response status: %d, body length: %d\n", resp.StatusCode, len(body))
	// fmt.Printf("[SyncthingClient] Response body: %s\n", string(body))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fmt.Printf("[SyncthingClient] ✗ API error: %d - %s\n", resp.StatusCode, string(body))
		return nil, fmt.Errorf("syncthing API error: %d - %s", resp.StatusCode, string(body))
	}

	fmt.Printf("[SyncthingClient] ✓ API success: %d\n", resp.StatusCode)
	return body, nil
}
