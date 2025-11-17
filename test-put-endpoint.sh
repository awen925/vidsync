#!/bin/bash

# Test PUT /api/projects/:id endpoint
# Make sure you have a valid token and project ID

# Configuration
API_URL="http://localhost:5000/api"
PROJECT_ID="06f86d42-74b9-45e4-9d2d-8c33a12f98f2"  # From error message
AUTH_TOKEN="${VIDSYNC_AUTH_TOKEN:-your-token-here}"

echo "Testing PUT /api/projects/:id endpoint"
echo "========================================"
echo "API URL: $API_URL"
echo "Project ID: $PROJECT_ID"
echo ""

# Test 1: Update name only
echo "Test 1: Update project name"
curl -X PUT "$API_URL/projects/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "Updated Project Name",
    "description": "Updated description",
    "local_path": null
  }' \
  -v

echo ""
echo ""
echo "Test completed!"
