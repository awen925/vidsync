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
	logger  interface{} // For compatibility, can be nil
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

// GetBaseURL returns the base URL of the cloud client
func (cc *CloudClient) GetBaseURL() string {
	return cc.baseURL
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

// PostWithAuth is like Post but uses Bearer token auth instead of API key
func (cc *CloudClient) PostWithAuth(endpoint string, payload interface{}, bearerToken string) (map[string]interface{}, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", cc.baseURL+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}

	// Set Bearer token - will not be overwritten by doRequest since we check if already set
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	// Log the payload being sent
	if cc.logger != nil {
		fmt.Printf("[CloudClient] POST %s\n", endpoint)
		fmt.Printf("[CloudClient] Payload: %+v\n", payload)
		fmt.Printf("[CloudClient] Authorization: Bearer %s...\n", bearerToken[:min(len(bearerToken), 20)])
	}

	return cc.doRequest(req)
}

// PutWithAuth updates a resource with Bearer token auth
func (cc *CloudClient) PutWithAuth(endpoint string, payload interface{}, bearerToken string) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PUT", cc.baseURL+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	// Set Bearer token - will not be overwritten by doRequest since we check if already set
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	// Log the payload being sent
	if cc.logger != nil {
		fmt.Printf("[CloudClient] PUT %s\n", endpoint)
		fmt.Printf("[CloudClient] Payload: %+v\n", payload)
	}

	_, err = cc.doRequest(req)
	return err
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (cc *CloudClient) get(endpoint string) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", cc.baseURL+endpoint, nil)
	if err != nil {
		return nil, err
	}

	return cc.doRequest(req)
}

func (cc *CloudClient) doRequest(req *http.Request) (map[string]interface{}, error) {
	// Only set API key if Authorization header is not already set
	// (PostWithAuth/PutWithAuth set their own Bearer token)
	if req.Header.Get("Authorization") == "" {
		req.Header.Set("Authorization", "Bearer "+cc.apiKey)
	}
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	if cc.logger != nil {
		fmt.Printf("[CloudClient] Request: %s %s\n", req.Method, req.URL.String())
		fmt.Printf("[CloudClient] Headers: %+v\n", req.Header)
	}

	resp, err := cc.client.Do(req)
	if err != nil {
		if cc.logger != nil {
			fmt.Printf("[CloudClient] Request error: %v\n", err)
		}
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if cc.logger != nil {
		fmt.Printf("[CloudClient] Response status: %d\n", resp.StatusCode)
		fmt.Printf("[CloudClient] Response body: %s\n", string(body))
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
