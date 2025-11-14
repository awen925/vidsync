# Task #6 Implementation - Error Handling & Retry Logic

## Objective
Add robust error handling, automatic retries with exponential backoff, and user-friendly error recovery flows for device pairing operations.

## Changes Required

### 1. Cloud API - Enhanced Error Responses (routes.ts)
- Add more detailed error messages
- Include retry-able vs non-retry-able error codes
- Add request ID for debugging

### 2. Electron UI - Retry Logic (ProjectDetailPage.tsx)
- Exponential backoff for failed API calls
- Retry countdown display
- User-friendly error messages
- Recovery buttons (Retry, Cancel)
- Connection status indication

### 3. API Hook - Retry Wrapper (useCloudApi.ts)
- Create reusable retry utility
- Exponential backoff calculation
- Jitter for distributed retries
- Max retry configuration

## Implementation Details

### Retry Strategy
```
Attempt 1: Immediate
Attempt 2: Wait 1s (1000ms)
Attempt 3: Wait 2s (2000ms)  
Attempt 4: Wait 4s (4000ms)
Attempt 5: Wait 8s (8000ms)
Attempt 6: Wait 16s (16000ms)
Max: 5 retries (total ~31 seconds)
Jitter: ±20% randomization
```

### Error Categories
```
Network Errors (RETRYABLE)
├─ Connection timeout
├─ Connection refused
└─ Network unreachable

Server Errors (RETRYABLE)
├─ 500 Internal Server Error
├─ 502 Bad Gateway
├─ 503 Service Unavailable
└─ 504 Gateway Timeout

Client Errors (NON-RETRYABLE)
├─ 400 Bad Request
├─ 401 Unauthorized
├─ 404 Not Found
└─ 409 Conflict

Pairing-Specific Errors (RETRYABLE)
├─ Database connection lost
├─ Folder not found
└─ Device offline
```

## File Changes Needed

### File 1: cloud/src/api/pairings/routes.ts
**Changes:**
- Add error categorization
- Include error codes (retryable: true/false)
- Add request logging with timestamps
- Better error messages

### File 2: electron/src/renderer/hooks/useCloudApi.ts
**Changes:**
- Add withRetry utility function
- Exponential backoff implementation
- Jitter calculation
- Retry count tracking

### File 3: electron/src/renderer/pages/Projects/ProjectDetailPage.tsx
**Changes:**
- Add retry state management
- Display retry countdown
- Show retry attempt count
- Add error recovery UI
- Implement exponential backoff display

## Success Criteria

✅ **Must Have**
- Failed pairings retry automatically (3 times minimum)
- User sees countdown for next retry
- Clear error messages for different failure types
- Network errors don't crash the app
- Recovery without app restart

✅ **Should Have**
- Exponential backoff with jitter
- Visual retry progress indicator
- Manual retry button
- Cancel retry option
- Detailed error logging

✅ **Must NOT Do**
- Retry on authentication failures
- Show technical error codes to users
- Block UI during retries
- Retry forever (max 5 attempts)

## Testing Strategy

1. **Network Failure Simulation**
   - Disconnect network
   - Verify retry attempts
   - Check countdown display
   - Reconnect and verify recovery

2. **Server Error Simulation**
   - Stop cloud server
   - Start test and verify retries
   - Restart server
   - Verify successful retry

3. **Timeout Simulation**
   - Set short timeout (1 second)
   - Trigger pairing operation
   - Verify retries with backoff
   - Increase timeout and verify success

4. **User Interaction**
   - Click retry manually
   - Click cancel
   - Verify state cleanup

## Implementation Time Estimate
- API error handling: 30 min
- Retry wrapper utility: 20 min
- UI integration: 40 min
- Testing & validation: 20 min
- **Total: ~2-3 hours**

---

**Status**: Ready to implement
**Priority**: HIGH
**Blocking**: Task #7, #8
