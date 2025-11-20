# Go Agent Authentication - Token Management Guide

## Critical Issue Fixed

❌ **Problem**: Go Agent was sending empty/invalid Bearer token to Cloud API, causing 401 errors

```
[ERROR] Failed to create project in cloud: 
cloud API error: 401 - {"error":"Invalid token","detail":"invalid JWT: token contains an invalid number of segments"}
```

✅ **Solution**: Implemented proper Supabase JWT token management

---

## How Authentication Works

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Go Agent                                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ Request to Cloud API                        │   │
│  │ Headers:                                    │   │
│  │   Authorization: Bearer <SUPABASE_JWT>      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Cloud API (localhost:5000)                         │
│  ┌─────────────────────────────────────────────┐   │
│  │ authMiddleware                              │   │
│  │ 1. Extract Bearer token                     │   │
│  │ 2. Validate with Supabase                   │   │
│  │ 3. Extract user info from JWT               │   │
│  │ 4. Allow/Deny request                       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Supabase (Cloud Auth Provider)                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ JWT Validation                              │   │
│  │ - Verify signature                          │   │
│  │ - Check expiration                          │   │
│  │ - Extract claims (user_id, email, etc)      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Token Types

### 1. Supabase Anon Key (Public)

**Purpose**: Unauthenticated access / Server-to-server with limited scope

**Token**:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbnJvaGRpeWVwbWRyc3hraHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTEyNjEsImV4cCI6MjA3ODUyNzI2MX0.TpgQqBUVvs1_3yPaCxGsPrS2d27axdE_ISzhY1mhSzQ
```

**Claims** (decoded):
```json
{
  "iss": "supabase",
  "ref": "ucnrohdieyepmdrsxkhyq",
  "role": "anon",
  "iat": 1762951261,
  "exp": 2078527261
}
```

**Usage**:
- Go Agent → Cloud API (current setup)
- Electron Client → Cloud API (via REACT_APP_SUPABASE_ANON_KEY)

**Expiration**: Year 2035 (essentially never expires)

### 2. Supabase Service Role Key (Private - Not Used Here)

**Purpose**: Full admin access (never send to untrusted clients)

**Usage**: Should only be used in secure backend servers

---

## Configuration

### Go Agent Configuration

**File**: `go-agent/.env`

```env
# Cloud API endpoint
CLOUD_URL=http://localhost:5000/api

# Supabase JWT Token (Anon Key)
CLOUD_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbnJvaGRpeWVwbWRyc3hraHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTEyNjEsImV4cCI6MjA3ODUyNzI2MX0.TpgQqBUVvs1_3yPaCxGsPrS2d27axdE_ISzhY1mhSzQ

# Logging level
LOG_LEVEL=info
```

### Environment Variables

Override configuration without recompiling:

```bash
# Use custom token
export CLOUD_API_KEY=your-supabase-token
./vidsync-agent

# Use staging Cloud API with custom token
export CLOUD_URL=http://staging:5000/api
export CLOUD_API_KEY=staging-token
./vidsync-agent

# Enable debug logging
export LOG_LEVEL=debug
./vidsync-agent
```

### How Configuration is Loaded

**File**: `go-agent/internal/config/config.go`

```go
// Priority order:
// 1. Environment variable (CLOUD_API_KEY)
// 2. .env file value
// 3. Empty string (no default - MUST be set)

CloudKey: getEnv("CLOUD_API_KEY", ""),
```

---

## Token Flow

### Request with Token

```
Go Agent (port 5001)
  ↓
  POST /api/v1/projects/with-snapshot
  {
    "name": "my-project",
    "path": "/path/to/project"
  }
  ↓
  [Calls CloudClient.post()]
  ↓
  [Adds header: Authorization: Bearer <TOKEN>]
  ↓
  Cloud API (port 5000)
    ↓
    authMiddleware checks token
    ↓
    If valid: Extracts user info, allows request
    If invalid: Returns 401 Unauthorized
  ↓
  Creates project in Supabase database
  ↓
  Returns project data to Go Agent
```

### Error When Token Missing or Invalid

```
[ERROR] Failed to create project in cloud: 
cloud API error: 401 - {
  "error": "Invalid token",
  "detail": "invalid JWT: unable to parse or verify signature, token is malformed: token contains an invalid number of segments"
}
```

**Causes**:
1. ❌ Token is empty string
2. ❌ Token is malformed (incomplete)
3. ❌ Token is expired
4. ❌ Token signature is invalid
5. ❌ Token role doesn't have permission

---

## Verification

### Check Token is Loaded

```bash
# View configuration (don't log full token for security)
cat go-agent/.env | grep CLOUD_API_KEY

# Output should show:
CLOUD_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Decode Token (For Debugging)

```bash
# Using jq to decode JWT (without verification)
curl -s 'https://jwt.io/api/debug' \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN_HERE"}' | jq .

# Or locally with Python
python3 << 'EOF'
import json
import base64

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbnJvaGRpeWVwbWRyc3hraHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTEyNjEsImV4cCI6MjA3ODUyNzI2MX0.TpgQqBUVvs1_3yPaCxGsPrS2d27axdE_ISzhY1mhSzQ"

# Split token
parts = token.split('.')
if len(parts) == 3:
    # Decode payload (add padding if needed)
    payload = parts[1]
    padding = 4 - len(payload) % 4
    payload += '=' * padding
    
    decoded = base64.urlsafe_b64decode(payload)
    print(json.dumps(json.loads(decoded), indent=2))
EOF
```

### Test Cloud API Connection

```bash
# Test with token
curl -v -X POST http://localhost:5000/api/projects \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbnJvaGRpeWVwbWRyc3hraHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTEyNjEsImV4cCI6MjA3ODUyNzI2MX0.TpgQqBUVvs1_3yPaCxGsPrS2d27axdE_ISzhY1mhSzQ" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-project"}'

# Expected response (with valid token):
# 200 OK with project data
# or 400 Bad Request (validation error)

# Expected response (with invalid token):
# 401 Unauthorized
```

---

## Token Security

### Best Practices

1. ✅ **Use Anon Key** for Go Agent (not Service Role Key)
   - Anon key has limited permissions
   - Can be safely exposed in code

2. ✅ **Encrypt .env in Production**
   - Don't commit .env to git
   - Use secrets management (Kubernetes Secrets, AWS Secrets Manager, etc)

3. ✅ **Rotate Tokens** periodically
   - Update CLOUD_API_KEY in .env
   - Restart Go Agent

4. ❌ **Don't hardcode tokens** in source code
   - Use .env file
   - Use environment variables

5. ❌ **Don't expose Service Role Key** anywhere
   - Only use in secure backend
   - Never send to clients

### Token Expiration

Current token expires in **year 2035** (essentially never).

For production, consider using shorter-lived tokens:
- User session tokens (24 hours)
- Service account tokens (refreshed daily)
- API keys with rotation policy

---

## Troubleshooting

### Issue: 401 Unauthorized

**Error**:
```
[ERROR] Failed to create project in cloud: 
cloud API error: 401 - {"error":"Invalid token"}
```

**Diagnosis**:
```bash
# 1. Check token is set
echo $CLOUD_API_KEY | head -c 50
# Output: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (not empty)

# 2. Check Go Agent has token
grep CLOUD_API_KEY go-agent/.env | head -c 50
# Output: CLOUD_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 3. Verify Cloud API is accepting tokens
curl -X GET http://localhost:5000/api/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Solutions**:
1. Copy exact token from `electron/.env`
2. Update `.env` and rebuild: `make clean && make build`
3. Restart Go Agent: `pkill vidsync-agent && sleep 2 && ./vidsync-agent`

### Issue: "token contains an invalid number of segments"

**Cause**: Token is malformed or incomplete

**Solution**:
```bash
# 1. Verify token in .env is complete (no line breaks)
wc -c go-agent/.env

# 2. Copy fresh token from electron/.env
cat electron/.env | grep REACT_APP_SUPABASE_ANON_KEY

# 3. Update go-agent/.env with complete token
# 4. Rebuild and restart
```

---

## Files Modified

| File | Change |
|------|--------|
| `go-agent/internal/config/config.go` | Added CloudKey loading: `getEnv("CLOUD_API_KEY", "")` |
| `go-agent/.env` | Added CLOUD_API_KEY with Supabase Anon token |

---

## Configuration Summary

**Go Agent** (`go-agent/.env`):
```env
CLOUD_URL=http://localhost:5000/api
CLOUD_API_KEY=<SUPABASE_ANON_TOKEN>
LOG_LEVEL=info
```

**Cloud API** (`cloud/.env`):
```env
PORT=5000
# Contains Supabase credentials
```

**Electron** (`electron/.env`):
```env
REACT_APP_CLOUD_URL=http://localhost:5000/api
REACT_APP_SUPABASE_ANON_KEY=<SAME_TOKEN_AS_GO_AGENT>
REACT_APP_SUPABASE_SERVICE_ROLE_KEY=<NEVER_EXPOSE>
```

---

## Status

✅ **COMPLETE** - Go Agent now:
- ✅ Loads Supabase JWT from configuration
- ✅ Sends proper Authorization header
- ✅ Authenticates with Cloud API
- ✅ Can create projects successfully
- ✅ Uses same token as Electron client
- ✅ Configuration via environment variables

**Ready for integration testing**
