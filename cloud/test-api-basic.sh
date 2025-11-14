#!/bin/bash

# Phase 2B Testing Script
# This script tests the API endpoints without needing authentication
# It assumes the cloud server is running on http://localhost:5000

API_URL="http://localhost:5000/api"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Phase 2B API Testing (No Auth Required)          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Health check - can we reach the server?
echo "[Test 1] Server Health Check"
echo "GET http://localhost:5000"
curl -s http://localhost:5000 2>&1 || echo "Server not responding"
echo ""
echo ""

# Test 2: Check if auth endpoint exists
echo "[Test 2] Auth Endpoint Check"
echo "GET $API_URL/auth/status (without token)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/auth/status" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"
echo ""
echo ""

# Test 3: Try to list projects without auth
echo "[Test 3] List Projects (should fail - no auth)"
echo "GET $API_URL/projects"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/projects" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "HTTP Code: $HTTP_CODE"
echo "Response: $BODY"
echo ""
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  To test with auth, you need to:"                          ║"
echo "║  1. Create a test user via sign-up endpoint                ║"
echo "║  2. Get an auth token                                      ║"
echo "║  3. Use token in Authorization header for other endpoints  ║"
echo "╚════════════════════════════════════════════════════════════╝"
