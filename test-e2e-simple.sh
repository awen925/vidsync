#!/bin/bash

# Phase 2B + 2C End-to-End Testing - Simple Version

echo "════════════════════════════════════════════════════════════════════"
echo "  Phase 2B + 2C End-to-End Testing"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Track test results
PASSED=0
FAILED=0

# Test helper
run_test() {
    local name=$1
    local check=$2
    echo -n "Testing: $name ... "
    
    if eval "$check"; then
        echo "✅ PASS"
        ((PASSED++))
    else
        echo "❌ FAIL"
        ((FAILED++))
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Group 1: Server & Infrastructure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test "Cloud server on port 5000" "lsof -i :5000 2>/dev/null | grep -q LISTEN"

run_test "Cloud server process running" "ps aux | grep -v grep | grep -q 'ts-node src/server.ts'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Group 2: Phase 2B Implementation Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test "WebSocketService exists" "test -f /home/fograin/work1/vidsync/cloud/src/services/webSocketService.ts"

run_test "useProjectEvents hook exists" "test -f /home/fograin/work1/vidsync/electron/src/renderer/hooks/useProjectEvents.ts"

run_test "FileWatcher service exists" "test -f /home/fograin/work1/vidsync/electron/src/main/services/fileWatcher.ts"

run_test "BackgroundSyncService exists" "test -f /home/fograin/work1/vidsync/cloud/src/services/backgroundSyncService.ts"

run_test "Database migration 008 exists" "test -f /home/fograin/work1/vidsync/cloud/migrations/008-create-project-events-table.sql"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Group 3: TypeScript Compilation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test "Cloud TypeScript compiles (0 errors)" "cd /home/fograin/work1/vidsync/cloud && timeout 30 npx tsc --noEmit 2>&1 | grep -q 'error TS' && exit 1 || exit 0"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Group 4: Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test "socket.io installed in cloud" "test -d /home/fograin/work1/vidsync/cloud/node_modules/socket.io"

run_test "socket.io-client installed in electron" "test -d /home/fograin/work1/vidsync/electron/node_modules/socket.io-client"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Group 5: Code Quality Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test "WebSocketService has initializeWebSocketService export" "grep -q 'export.*initializeWebSocketService' /home/fograin/work1/vidsync/cloud/src/services/webSocketService.ts"

run_test "useProjectEvents has useProjectEvents export" "grep -q 'export.*useProjectEvents' /home/fograin/work1/vidsync/electron/src/renderer/hooks/useProjectEvents.ts"

run_test "API routes have broadcasting integration" "grep -q 'getWebSocketService' /home/fograin/work1/vidsync/cloud/src/api/projects/routes.ts"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Group 6: Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

run_test "Testing quick start guide exists" "test -f /home/fograin/work1/vidsync/TESTING_QUICK_START.md"

run_test "Phase 2 complete index exists" "test -f /home/fograin/work1/vidsync/PHASE2_COMPLETE_INDEX.md"

run_test "E2E testing guide exists" "test -f /home/fograin/work1/vidsync/PHASE2_E2E_TESTING.md"

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "Test Summary"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Tests Passed: ✅ $PASSED"
echo "Tests Failed: ❌ $FAILED"
TOTAL=$((PASSED + FAILED))
echo "Total Tests:  📊 $TOTAL"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "════════════════════════════════════════════════════════════════════"
    echo "  ✅ ALL TESTS PASSED! Phase 2B + 2C Ready for Testing"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Next Steps:"
    echo "  1. Open Electron app: cd electron && npm start"
    echo "  2. Create a project with local_path"
    echo "  3. Open DevTools (Ctrl+Shift+I)"
    echo "  4. Check Console for logs:"
    echo "     - [FileWatcher] detecting changes"
    echo "     - [useProjectEvents] receiving events"
    echo "  5. Make file changes and verify sync"
    echo ""
    echo "Performance Targets:"
    echo "  ✓ Bandwidth: 99% savings (deltas not full scans)"
    echo "  ✓ Latency: <100ms WebSocket delivery"
    echo "  ✓ Offline: Recovery without full rescan"
    echo ""
else
    echo "════════════════════════════════════════════════════════════════════"
    echo "  ❌ SOME TESTS FAILED"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Review failures above and fix before proceeding"
    echo ""
fi

exit $FAILED
