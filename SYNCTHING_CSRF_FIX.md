# Syncthing CSRF Token Fix - Go Agent

## Problem
The Go Agent was receiving **403 Forbidden - CSRF Error** when making state-changing requests (POST/PUT/DELETE) to Syncthing API.

```
[ERROR] Failed to create Syncthing folder: syncthing API error: 403 - CSRF Error
```

## Root Cause
Syncthing enforces CSRF protection on all state-changing requests (POST, PUT, DELETE). The requests must include a valid CSRF token in the `X-CSRF-Token` header.

The Go Agent's `SyncthingClient` was:
- ✗ NOT fetching CSRF tokens
- ✗ NOT sending CSRF tokens in request headers
- ✗ NOT handling CSRF errors with retry

## Solution Implemented

### 1. Added CSRF Token Management to SyncthingClient

```go
type SyncthingClient struct {
	baseURL    string
	apiKey     string
	client     *http.Client
	csrfToken  string        // Store cached token
	csrfMutex  sync.Mutex    // Thread-safe access
}
```

### 2. Implemented CSRF Token Fetching

```go
func (sc *SyncthingClient) getCsrfToken() (string, error) {
	// Return cached token if available
	if sc.csrfToken != "" {
		return sc.csrfToken, nil
	}

	// Fetch from Syncthing root endpoint
	// Try multiple extraction methods:
	// 1. X-CSRF-Token header
	// 2. Set-Cookie header (CSRF-Token-XXXXX=token)
	// 3. HTML body (csrfToken = "...")
}
```

### 3. Updated Request Handler with CSRF Token

```go
func (sc *SyncthingClient) doReq(req *http.Request, retried bool) ([]byte, error) {
	req.Header.Set("X-API-Key", sc.apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Add CSRF token for state-changing requests
	if req.Method != "GET" {
		csrfToken, err := sc.getCsrfToken()
		if err != nil {
			return nil, fmt.Errorf("failed to get CSRF token: %w", err)
		}
		req.Header.Set("X-CSRF-Token", csrfToken)  // ✅ Send token
	}

	resp, err := sc.client.Do(req)
	// ...
}
```

### 4. Implemented CSRF Error Retry Logic

```go
// Handle CSRF error with retry
if resp.StatusCode == 403 && strings.Contains(string(body), "CSRF") && !retried {
	// Clear invalid CSRF token
	sc.clearCsrfToken()
	
	// Retry request with fresh token (only once to avoid loops)
	return sc.doReq(reqCopy, true)
}
```

## Key Features

✅ **Token Caching** - Reuses CSRF token across multiple requests (thread-safe)
✅ **Multiple Extraction Methods** - Handles different Syncthing response formats
✅ **Automatic Retry** - On 403 CSRF error, fetches fresh token and retries once
✅ **Thread-Safe** - Uses mutex to prevent concurrent token access issues
✅ **Minimal Changes** - Transparent to existing SyncthingClient API

## Updated Methods

The following methods now properly include CSRF tokens:
- `AddFolder()` - POST to `/rest/config/folders`
- `AddFolderReceiveOnly()` - POST to `/rest/config/folders`
- `AddDevice()` - POST to `/rest/config/devices`
- `PauseFolder()` - POST to `/rest/db/pause`
- `ResumeFolder()` - POST to `/rest/db/resume`
- `Rescan()` - POST to `/rest/db/scan`
- `UpdateFolder()` - PUT to `/rest/config/folders/{id}`
- `RemoveFolder()` - DELETE to `/rest/config/folders/{id}`
- `AddDeviceToFolder()` - PUT to `/rest/config/folders/{id}`
- `RemoveDeviceFromFolder()` - PUT to `/rest/config/folders/{id}`
- All other state-changing operations

## Expected Result

After this fix, project creation should work without CSRF errors:

```
[INFO] STEP 2: Creating Syncthing folder...
✓ Syncthing folder created (CSRF token fetched and used)
[INFO] Cloud notified about project creation
```

## Files Modified

- `/home/fograin/work1/vidsync/go-agent/internal/api/syncthing_client.go`
  - Added CSRF token caching with mutex
  - Added `getCsrfToken()` method with multiple extraction strategies
  - Added `clearCsrfToken()` method
  - Updated `doReq()` to:
    - Accept `retried` parameter for tracking retries
    - Fetch CSRF tokens for non-GET requests
    - Automatically retry on 403 CSRF errors

## Build Status

✅ Go Agent rebuilt successfully (13M binary)
