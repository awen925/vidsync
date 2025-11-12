package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// CloudClient is an HTTP client for Cloud API
type CloudClient struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

// NewCloudClient creates a new Cloud API client
func NewCloudClient(baseURL, apiKey string) *CloudClient {
	return &CloudClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// RegisterDevice registers device with cloud
func (cc *CloudClient) RegisterDevice(deviceID, deviceName, platform string) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"deviceId":   deviceID,
		"deviceName": deviceName,
		"platform":   platform,
	}

	return cc.post("/devices/register", payload)
}

// ReportSyncEvent reports a sync event to cloud
func (cc *CloudClient) ReportSyncEvent(projectID, eventType, path, message string) error {
	payload := map[string]interface{}{
		"projectId": projectID,
		"type":      eventType,
		"path":      path,
		"message":   message,
		"timestamp": time.Now().Unix(),
	}

	_, err := cc.post("/sync/events", payload)
	return err
}

// ListProjects lists projects from cloud
func (cc *CloudClient) ListProjects() ([]map[string]interface{}, error) {
	result, err := cc.get("/projects")
	if err != nil {
		return nil, err
	}

	projects, ok := result["projects"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid projects response")
	}

	var projectList []map[string]interface{}
	for _, p := range projects {
		if pm, ok := p.(map[string]interface{}); ok {
			projectList = append(projectList, pm)
		}
	}

	return projectList, nil
}

// CreateProject creates a new project
func (cc *CloudClient) CreateProject(name, description string) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"name":        name,
		"description": description,
	}

	return cc.post("/projects", payload)
}

// AcceptInvitation accepts a project invitation
func (cc *CloudClient) AcceptInvitation(invitationID string) error {
	payload := map[string]interface{}{
		"invitationId": invitationID,
	}

	_, err := cc.post("/invitations/accept", payload)
	return err
}

func (cc *CloudClient) post(endpoint string, payload interface{}) (map[string]interface{}, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", cc.baseURL+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}

	return cc.doRequest(req)
}

func (cc *CloudClient) get(endpoint string) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", cc.baseURL+endpoint, nil)
	if err != nil {
		return nil, err
	}

	return cc.doRequest(req)
}

func (cc *CloudClient) doRequest(req *http.Request) (map[string]interface{}, error) {
	req.Header.Set("Authorization", "Bearer "+cc.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := cc.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("cloud API error: %d - %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return result, nil
}
