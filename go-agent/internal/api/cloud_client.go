package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
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

	fmt.Printf("[CloudClient] POST %s\n", endpoint)
	fmt.Printf("[CloudClient] Payload: %s\n", string(data))

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

	fmt.Printf("[CloudClient] POST %s\n", endpoint)
	fmt.Printf("[CloudClient] Payload: %s\n", string(data))
	tokenPreview := bearerToken
	if len(bearerToken) > 20 {
		tokenPreview = bearerToken[:20] + "..."
	}
	fmt.Printf("[CloudClient] Authorization: Bearer %s\n", tokenPreview)

	req, err := http.NewRequest("POST", cc.baseURL+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}

	// Set Bearer token - will not be overwritten by doRequest since we check if already set
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	return cc.doRequest(req)
}

// PostMultipartWithAuth sends a multipart form request with Bearer token auth
// Used for file uploads like snapshots
// fileFieldName is the form field name for the file (usually "file")
// fileData is the binary file data
// formFields are additional form fields (map of field name to value)
func (cc *CloudClient) PostMultipartWithAuth(endpoint string, fileFieldName string, fileData []byte, formFields map[string]string, bearerToken string) (map[string]interface{}, error) {
	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add file field using CreateFormFile (not CreateFormField)
	// This properly sets the Content-Disposition header for file uploads
	part, err := writer.CreateFormFile(fileFieldName, "snapshot.json.gz")
	if err != nil {
		return nil, fmt.Errorf("failed to create file form field: %w", err)
	}

	if _, err := part.Write(fileData); err != nil {
		return nil, fmt.Errorf("failed to write file data: %w", err)
	}

	// Add additional form fields
	for fieldName, fieldValue := range formFields {
		if err := writer.WriteField(fieldName, fieldValue); err != nil {
			return nil, fmt.Errorf("failed to write form field %s: %w", fieldName, err)
		}
	}

	// Close multipart writer to finalize the body
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	fmt.Printf("[CloudClient] POST %s (multipart)\n", endpoint)
	fmt.Printf("[CloudClient] File field: %s (%d bytes)\n", fileFieldName, len(fileData))
	fmt.Printf("[CloudClient] Form fields: %v\n", formFields)
	tokenPreview := bearerToken
	if len(bearerToken) > 20 {
		tokenPreview = bearerToken[:20] + "..."
	}
	fmt.Printf("[CloudClient] Authorization: Bearer %s\n", tokenPreview)

	req, err := http.NewRequest("POST", cc.baseURL+endpoint, body)
	if err != nil {
		return nil, err
	}

	// Set Bearer token
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	// Set Content-Type to multipart/form-data with boundary
	req.Header.Set("Content-Type", writer.FormDataContentType())

	return cc.doRequest(req)
}

// PutWithAuth updates a resource with Bearer token auth
func (cc *CloudClient) PutWithAuth(endpoint string, payload interface{}, bearerToken string) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	fmt.Printf("[CloudClient] PUT %s\n", endpoint)
	fmt.Printf("[CloudClient] Payload: %s\n", string(data))
	tokenPreview := bearerToken
	if len(bearerToken) > 20 {
		tokenPreview = bearerToken[:20] + "..."
	}
	fmt.Printf("[CloudClient] Authorization: Bearer %s\n", tokenPreview)

	req, err := http.NewRequest("PUT", cc.baseURL+endpoint, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	// Set Bearer token - will not be overwritten by doRequest since we check if already set
	req.Header.Set("Authorization", "Bearer "+bearerToken)

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
	fmt.Printf("[CloudClient] GET %s\n", endpoint)
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

	fmt.Printf("[CloudClient] Request: %s %s\n", req.Method, req.URL.String())

	resp, err := cc.client.Do(req)
	if err != nil {
		fmt.Printf("[CloudClient] ✗ Request error: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[CloudClient] ✗ Error reading response body: %v\n", err)
		return nil, err
	}

	fmt.Printf("[CloudClient] Response status: %d, body length: %d\n", resp.StatusCode, len(body))
	fmt.Printf("[CloudClient] Response body: %s\n", string(body))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fmt.Printf("[CloudClient] ✗ API error: %d - %s\n", resp.StatusCode, string(body))
		return nil, fmt.Errorf("cloud API error: %d - %s", resp.StatusCode, string(body))
	}

	fmt.Printf("[CloudClient] ✓ API success: %d\n", resp.StatusCode)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return result, nil
}
