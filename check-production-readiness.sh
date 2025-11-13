#!/usr/bin/env bash

# Vidsync Production Readiness Check
# This script verifies all components are ready for production deployment

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Vidsync Production Readiness Verification Report          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

# Function to check status
check_status() {
    local name=$1
    local result=$2
    
    if [ $result -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $name"
        ((passed++))
    else
        echo -e "${RED}❌ FAIL${NC}: $name"
        ((failed++))
    fi
}

# ========== BUILD CHECKS ==========
echo "📦 BUILD CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# TypeScript compilation
if cd /home/fograin/work1/vidsync/cloud && npm run build > /dev/null 2>&1; then
    check_status "TypeScript compilation" 0
else
    check_status "TypeScript compilation" 1
fi

# Check key files exist
[ -f "/home/fograin/work1/vidsync/cloud/src/app.ts" ]
check_status "app.ts exists" $?

[ -f "/home/fograin/work1/vidsync/cloud/src/middleware/rateLimiter.ts" ]
check_status "rateLimiter.ts exists" $?

[ -f "/home/fograin/work1/vidsync/cloud/src/middleware/auditLogger.ts" ]
check_status "auditLogger.ts exists" $?

[ -f "/home/fograin/work1/vidsync/cloud/scripts/validate-env.js" ]
check_status "validate-env.js exists" $?

# ========== CONFIGURATION CHECKS ==========
echo ""
echo "⚙️  CONFIGURATION CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ -f "/home/fograin/work1/vidsync/.env.example" ]
check_status ".env.example exists" $?

grep -q "NODE_ENV" /home/fograin/work1/vidsync/.env.example
check_status ".env.example has NODE_ENV" $?

grep -q "JWT_SECRET" /home/fograin/work1/vidsync/.env.example
check_status ".env.example has JWT_SECRET" $?

grep -q "RATE_LIMIT" /home/fograin/work1/vidsync/.env.example
check_status ".env.example has RATE_LIMIT settings" $?

grep -q "AUDIT_LOGGING" /home/fograin/work1/vidsync/.env.example
check_status ".env.example has AUDIT_LOGGING settings" $?

# ========== DOCUMENTATION CHECKS ==========
echo ""
echo "📚 DOCUMENTATION CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in {1..9}; do
    [ -f "/home/fograin/work1/vidsync/TASK${i}_COMPLETE.md" ]
    check_status "TASK${i}_COMPLETE.md exists" $?
done

[ -f "/home/fograin/work1/vidsync/PRODUCTION_DEPLOYMENT_CHECKLIST.md" ]
check_status "PRODUCTION_DEPLOYMENT_CHECKLIST.md exists" $?

[ -f "/home/fograin/work1/vidsync/PROJECT_COMPLETION_SUMMARY.md" ]
check_status "PROJECT_COMPLETION_SUMMARY.md exists" $?

[ -f "/home/fograin/work1/vidsync/DOCUMENTATION_INDEX.md" ]
check_status "DOCUMENTATION_INDEX.md exists" $?

# ========== SECURITY CHECKS ==========
echo ""
echo "🔒 SECURITY CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

grep -q "rateLimiter" /home/fograin/work1/vidsync/cloud/src/app.ts
check_status "Rate limiter imported in app.ts" $?

grep -q "auditLogger" /home/fograin/work1/vidsync/cloud/src/app.ts
check_status "Audit logger imported in app.ts" $?

grep -q "X-Content-Type-Options" /home/fograin/work1/vidsync/cloud/src/app.ts
check_status "Security headers configured" $?

grep -q "JWT_SECRET" /home/fograin/work1/vidsync/cloud/src/middleware/authMiddleware.ts
check_status "JWT authentication configured" $?

# ========== CODE QUALITY CHECKS ==========
echo ""
echo "✨ CODE QUALITY CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for any obvious syntax errors in key files
if node -c /home/fograin/work1/vidsync/cloud/scripts/validate-env.js > /dev/null 2>&1; then
    check_status "validate-env.js syntax" 0
else
    check_status "validate-env.js syntax" 1
fi

# Check package.json for build script
grep -q '"build"' /home/fograin/work1/vidsync/cloud/package.json
check_status "Build script exists in package.json" $?

# ========== COMPONENT CHECKS ==========
echo ""
echo "🔧 COMPONENT CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ -f "/home/fograin/work1/vidsync/electron/src/renderer/components/ProgressStatus.tsx" ]
check_status "ProgressStatus.tsx exists" $?

[ -f "/home/fograin/work1/vidsync/electron/src/renderer/components/SyncStatusPanel.tsx" ]
check_status "SyncStatusPanel.tsx exists" $?

[ -f "/home/fograin/work1/vidsync/electron/src/main/logger.ts" ]
check_status "logger.ts exists" $?

# ========== SCRIPT CHECKS ==========
echo ""
echo "🛠️  SCRIPT CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ -f "/home/fograin/work1/vidsync/test-device-pairing.sh" ]
check_status "test-device-pairing.sh exists" $?

[ -f "/home/fograin/work1/vidsync/cleanup-device.sh" ]
check_status "cleanup-device.sh exists" $?

[ -f "/home/fograin/work1/vidsync/cleanup-device-mac.sh" ]
check_status "cleanup-device-mac.sh exists" $?

# ========== SUMMARY ==========
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

total=$((passed + failed))
percentage=$((passed * 100 / total))

echo ""
echo "📊 RESULTS:"
echo "  ✅ Passed: $passed"
echo "  ❌ Failed: $failed"
echo "  📈 Total:  $total"
echo "  💯 Score:  ${percentage}%"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CHECKS PASSED - READY FOR PRODUCTION 🎉${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Copy: cp .env.example .env"
    echo "  2. Edit: nano .env (fill in production values)"
    echo "  3. Validate: node cloud/scripts/validate-env.js"
    echo "  4. Deploy: Follow PRODUCTION_DEPLOYMENT_CHECKLIST.md"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  SOME CHECKS FAILED - REVIEW REQUIRED ⚠️${NC}"
    echo ""
    exit 1
fi
