#!/bin/bash

# Phase 1 Testing Script
# Tests all 4 endpoints with cURL

BASE_URL="http://localhost:5000"
PROJECT_ID="test-project-001"
TEST_RESULTS=()
PASSED=0
FAILED=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Mock JWT token (you'll need to replace with real token)
JWT_TOKEN="mock-token-for-testing"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 1: SYNCTHING-FIRST TEST SUITE${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Helper function for tests
run_test() {
  local test_name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5
  
  echo -e "${YELLOW}Test: $test_name${NC}"
  echo "  Endpoint: $method $endpoint"
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" \
      -X GET "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $JWT_TOKEN" \
      -H "Content-Type: application/json")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" \
      -X POST "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $JWT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  elif [ "$method" = "PUT" ]; then
    response=$(curl -s -w "\n%{http_code}" \
      -X PUT "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $JWT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  echo "  Status: $http_code (expected: $expected_status)"
  
  if [ "$http_code" -eq "$expected_status" ] 2>/dev/null; then
    echo -e "  ${GREEN}✓ PASS${NC}"
    ((PASSED++))
    TEST_RESULTS+=("$test_name: PASS")
    echo ""
    return 0
  else
    echo -e "  ${RED}✗ FAIL${NC}"
    echo "  Response: ${body:0:200}..."
    ((FAILED++))
    TEST_RESULTS+=("$test_name: FAIL (got $http_code, expected $expected_status)")
    echo ""
    return 1
  fi
}

# ============================================
# SCENARIO 1: Basic Pagination (No Syncthing)
# ============================================
echo -e "${BLUE}SCENARIO 1: Basic Pagination${NC}"
echo ""

run_test "GET files - first page (500 limit)" \
  "GET" \
  "/projects/$PROJECT_ID/files-list?limit=500&offset=0" \
  "" \
  200

run_test "GET files - middle page" \
  "GET" \
  "/projects/$PROJECT_ID/files-list?limit=500&offset=5000" \
  "" \
  200

run_test "GET files - last page" \
  "GET" \
  "/projects/$PROJECT_ID/files-list?limit=500&offset=10000" \
  "" \
  200

run_test "GET files - past end (empty)" \
  "GET" \
  "/projects/$PROJECT_ID/files-list?limit=500&offset=11000" \
  "" \
  200

echo ""

# ============================================
# SCENARIO 2: Snapshot Metadata
# ============================================
echo -e "${BLUE}SCENARIO 2: Snapshot Metadata${NC}"
echo ""

run_test "GET snapshot-metadata" \
  "GET" \
  "/projects/$PROJECT_ID/snapshot-metadata" \
  "" \
  200

echo ""

# ============================================
# SCENARIO 3: Refresh Snapshot (Owner only)
# ============================================
echo -e "${BLUE}SCENARIO 3: Refresh Snapshot${NC}"
echo ""

run_test "PUT refresh-snapshot (owner)" \
  "PUT" \
  "/projects/$PROJECT_ID/refresh-snapshot" \
  '{}' \
  200

echo ""

# ============================================
# SCENARIO 4: Sync Start
# ============================================
echo -e "${BLUE}SCENARIO 4: Sync Start${NC}"
echo ""

run_test "POST sync-start" \
  "POST" \
  "/projects/$PROJECT_ID/sync-start" \
  '{"deviceId":"syncthing-device-id"}' \
  200

echo ""

# ============================================
# SCENARIO 5: Access Control
# ============================================
echo -e "${BLUE}SCENARIO 5: Access Control${NC}"
echo ""

# Test with missing auth token (should get 401 or 403)
response=$(curl -s -w "\n%{http_code}" \
  -X GET "$BASE_URL/projects/$PROJECT_ID/files-list" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq "401" ] || [ "$http_code" -eq "403" ]; then
  echo -e "${YELLOW}Test: Missing auth token${NC}"
  echo -e "  ${GREEN}✓ PASS (got $http_code - access denied)${NC}"
  ((PASSED++))
  TEST_RESULTS+=("Missing auth token: PASS")
else
  echo -e "${YELLOW}Test: Missing auth token${NC}"
  echo -e "  ${RED}✗ FAIL (got $http_code, expected 401/403)${NC}"
  ((FAILED++))
  TEST_RESULTS+=("Missing auth token: FAIL (got $http_code)")
fi

echo ""

# ============================================
# TEST SUMMARY
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

for result in "${TEST_RESULTS[@]}"; do
  if [[ $result == *"PASS"* ]]; then
    echo -e "${GREEN}✓ $result${NC}"
  else
    echo -e "${RED}✗ $result${NC}"
  fi
done

echo ""
echo -e "Total: ${GREEN}$PASSED PASSED${NC}, ${RED}$FAILED FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
