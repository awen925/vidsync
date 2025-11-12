package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
