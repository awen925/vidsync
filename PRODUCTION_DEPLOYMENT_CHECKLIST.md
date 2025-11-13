# Vidsync Production Deployment Checklist

## Status: ✅ PRODUCTION READY

**Last Updated**: 2024  
**Version**: 1.0.0

---

## 1. Pre-Deployment Requirements

### Infrastructure Setup
- [ ] Server capacity: Minimum 2GB RAM, 2 CPU cores
- [ ] Storage: 100GB for application and logs
- [ ] Network: TLS/SSL certificate from trusted CA
- [ ] Database: PostgreSQL 12+ with backups configured
- [ ] Load balancer: Optional for high availability

### Dependencies
- [ ] Node.js 18+ LTS installed
- [ ] npm/yarn available
- [ ] PostgreSQL client tools installed
- [ ] Docker (optional, for containerization)

### Access & Permissions
- [ ] SSH access to servers
- [ ] Database admin credentials
- [ ] Certificate files (TLS cert, key, CA bundle)
- [ ] Service account with elevated privileges (for CA operations)

---

## 2. Security Hardening

### 2.1 Secrets Management
```bash
# Create .env file with production secrets
cp .env.example .env

# Fill in all secrets:
# - JWT_SECRET: Generate with: openssl rand -base64 32
# - SUPABASE_ANON_KEY: From Supabase dashboard
# - SUPABASE_SERVICE_ROLE_KEY: From Supabase dashboard
# - Other secrets as needed

# Secure .env file
chmod 600 .env
```

**Checklist**:
- [ ] JWT_SECRET is at least 32 characters
- [ ] All API keys are from production environments
- [ ] Database credentials use strong passwords (20+ chars)
- [ ] .env file is in .gitignore
- [ ] .env is NOT committed to version control

### 2.2 TLS/SSL Configuration

```bash
# For self-signed certificates (testing only):
openssl req -x509 -newkey rsa:4096 -nodes \
  -out /etc/vidsync/certs/server.crt \
  -keyout /etc/vidsync/certs/server.key -days 365

# For production, use Let's Encrypt:
# 1. Install certbot
# 2. Run: certbot certonly --standalone -d vidsync.example.com
# 3. Point TLS_CERT_FILE and TLS_KEY_FILE to certificates

# Secure certificate files
chmod 600 /etc/vidsync/certs/server.key
chmod 644 /etc/vidsync/certs/server.crt
chown root:vidsync /etc/vidsync/certs/*
```

**Checklist**:
- [ ] TLS certificates are from trusted CA (not self-signed in production)
- [ ] Certificate key has restricted permissions (600)
- [ ] Certificate renewal is automated (Let's Encrypt + certbot)
- [ ] TLS_CERT_FILE and TLS_KEY_FILE point to correct files
- [ ] HSTS is enabled (max-age set to 31536000 for 1 year)

### 2.3 CA Key Protection (Nebula)

```bash
# Store CA certificate and key securely
mkdir -p /etc/vidsync/certs
chmod 700 /etc/vidsync/certs

# Copy CA certificate and key
cp ca.crt /etc/vidsync/certs/ca.crt
cp ca.key /etc/vidsync/certs/ca.key

# Restrict permissions
chmod 600 /etc/vidsync/certs/ca.key
chmod 644 /etc/vidsync/certs/ca.crt
chown root:vidsync /etc/vidsync/certs/ca.key

# Create backup
cp /etc/vidsync/certs/ca.key /secure-backup/ca.key.backup
```

**Checklist**:
- [ ] CA key is not world-readable (mode 600)
- [ ] CA key is backed up to secure location
- [ ] Only app service account can read CA key
- [ ] NEBULA_CA_KEY environment variable points to correct file
- [ ] Backup location is encrypted and off-system

### 2.4 Authentication & Authorization

**Current Implementation**:
- JWT-based authentication with Supabase
- Token validation on every protected endpoint
- User context attached to requests

**Enhanced Configuration** (already in code):
```typescript
// authMiddleware.ts validates tokens and rejects:
// - Missing authorization header (401)
// - Invalid tokens (401)
// - Expired tokens (401)

// Production-only fallback (disabled):
// - In production, expired tokens always rejected
// - No fallback token decoding in production
```

**Checklist**:
- [ ] JWT_EXPIRY is set to reasonable value (24h typical)
- [ ] All protected endpoints use authMiddleware
- [ ] Tokens are validated on every request
- [ ] Token refresh mechanism is implemented
- [ ] Logout clears tokens on client

---

## 3. Rate Limiting Configuration

### 3.1 Global Rate Limits
```env
RATE_LIMIT_REQUESTS=100        # 100 requests per minute global
RATE_LIMIT_WINDOW_MS=60000     # 1 minute window
```

### 3.2 Endpoint-Specific Limits

| Endpoint | Limit | Window | Reason |
|----------|-------|--------|--------|
| `/api/auth/*` | 20 req/min | Per IP | Prevent brute force |
| `/api/pairings/*` | 10 req/min | Per IP | Prevent pairing spam |
| `/api/sync/*` | 50 req/min | Per IP | Allow file sync traffic |
| General API | 100 req/min | Per IP | Default limit |
| Per-user actions | 200 req/min | Per user ID | Personalized limit |

### 3.3 Rate Limit Headers

All responses include rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 45
```

**429 Response** when limit exceeded:
```json
{
  "error": "Too many requests",
  "retryAfter": 45
}
```

**Checklist**:
- [ ] RATE_LIMIT_* environment variables are configured
- [ ] Auth endpoints have stricter limits than general API
- [ ] Pairing endpoints are most restricted
- [ ] Rate limiter gracefully handles exceeding limits
- [ ] Clients properly handle 429 responses

---

## 4. Audit Logging Setup

### 4.1 Enable Audit Logging
```env
AUDIT_LOGGING_ENABLED=true
AUDIT_LOG_FILE=/var/log/vidsync/audit.log
AUDIT_LOG_RETENTION_DAYS=90
```

### 4.2 Prepare Log Directory
```bash
mkdir -p /var/log/vidsync
chmod 750 /var/log/vidsync
chown root:vidsync /var/log/vidsync
```

### 4.3 Log Rotation (with logrotate)
```bash
# Create /etc/logrotate.d/vidsync
cat > /etc/logrotate.d/vidsync << 'EOF'
/var/log/vidsync/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root vidsync
    sharedscripts
    postrotate
        systemctl reload vidsync > /dev/null 2>&1 || true
    endscript
}
EOF
```

### 4.4 Audit Log Format

Each log entry is JSON:
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "userId": "user-123",
  "action": "AUTH",
  "resource": "auth",
  "method": "POST",
  "path": "/api/auth/login",
  "statusCode": 200,
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "email": "user@example.com"
  }
}
```

**Tracked Actions**:
- AUTH: Login, logout, token refresh
- PAIRING: Generate/verify invite codes
- PROJECT: Create, update, delete projects
- DEVICE: Add, remove, modify devices
- SYNC: Sync operations

**Checklist**:
- [ ] Audit logging is enabled
- [ ] Log directory has correct permissions (750)
- [ ] Log rotation is configured for 90-day retention
- [ ] Logs are not world-readable
- [ ] Log shipping to central system (if applicable)

---

## 5. Error Handling & Monitoring

### 5.1 Error Response Format
```json
{
  "error": "User-friendly error message",
  "statusCode": 400,
  "requestId": "req-12345-67890"
}
```

### 5.2 HTTP Status Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| 200 | Success | None needed |
| 400 | Bad request | Fix request |
| 401 | Unauthorized | Re-authenticate |
| 403 | Forbidden | Check permissions |
| 404 | Not found | Verify resource exists |
| 409 | Conflict | Handle conflict |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Retry after delay |
| 503 | Unavailable | Retry after delay |

### 5.3 Health Monitoring

```bash
# Health check endpoint (not rate limited)
curl https://vidsync.example.com/health
# Response: {"status":"ok","timestamp":"...","environment":"production","version":"1.0.0"}

# Readiness check (for Kubernetes)
curl https://vidsync.example.com/readiness
# Response: {"status":"ready","timestamp":"..."}
```

**Checklist**:
- [ ] Health endpoint responds within 1 second
- [ ] Health check is monitored (every 30 seconds)
- [ ] Alerts trigger if health check fails
- [ ] Error responses include request ID for tracking
- [ ] All errors are logged with context

---

## 6. Database Configuration

### 6.1 Connection Pooling
```env
DATABASE_URL=postgresql://user:password@localhost:5432/vidsync
DATABASE_POOL_SIZE=20
DATABASE_IDLE_TIMEOUT=30000
```

### 6.2 Backup Strategy

```bash
# Daily automated backup (add to crontab)
0 2 * * * /usr/local/bin/vidsync-backup.sh

# Manual backup command
pg_dump -U vidsync_user -d vidsync > /backups/vidsync_$(date +%Y%m%d).sql

# Backup retention
find /backups -name "vidsync_*.sql" -mtime +30 -delete
```

**Checklist**:
- [ ] Database backups run daily
- [ ] Backup retention is 30+ days
- [ ] Backups are tested (restore verification)
- [ ] Backups are stored off-system
- [ ] Database connection pooling is configured

---

## 7. CI/CD Pipeline Setup

### 7.1 Build Process
```bash
# 1. Lint and type check
npm run build

# 2. Run tests
npm test

# 3. Security scan
npm audit

# 4. Build Docker image (if using Docker)
docker build -t vidsync:1.0.0 .
```

### 7.2 Deployment Process

**GitHub Actions Example** (create `.github/workflows/deploy.yml`):
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm ci
      - name: Type check
        run: npm run build
      - name: Run tests
        run: npm test
      - name: Security audit
        run: npm audit --production
      - name: Deploy
        run: npm run deploy
```

**Deployment Steps**:
1. Build application
2. Run security checks
3. Deploy to staging
4. Run smoke tests
5. Deploy to production

**Checklist**:
- [ ] Build process is automated
- [ ] Tests run before deployment
- [ ] Security checks are performed
- [ ] Deployment is reversible (blue-green or canary)
- [ ] Rollback procedure is documented

---

## 8. Environment Configuration

### 8.1 Environment Variables
Copy and configure `.env` from `.env.example`:

```bash
# Development
cp .env.example .env
# Edit .env with development values

# Production
scp .env.example user@prod-server:~/.env.prod
# SSH to server and configure
ssh user@prod-server
nano .env.prod  # Fill in production values
```

### 8.2 Environment Validation
```bash
# Before startup, verify all required vars are set
node scripts/validate-env.js

# Script should check:
# - NODE_ENV is 'production'
# - All required vars are present
# - Secrets meet minimum requirements
# - Database is accessible
# - Services are reachable
```

**Checklist**:
- [ ] All required environment variables are set
- [ ] No sensitive data is logged
- [ ] Environment validation runs at startup
- [ ] Configuration changes trigger restart
- [ ] .env file is not in version control

---

## 9. Deployment Steps

### 9.1 Initial Setup
```bash
# 1. Create app user
useradd -r -s /bin/bash vidsync

# 2. Create directories
mkdir -p /opt/vidsync
mkdir -p /var/log/vidsync
mkdir -p /etc/vidsync/certs
mkdir -p /etc/vidsync/config

# 3. Set permissions
chown -R vidsync:vidsync /opt/vidsync
chown -R vidsync:vidsync /var/log/vidsync
chmod 700 /etc/vidsync/certs
chmod 700 /etc/vidsync/config

# 4. Copy application
cp -r dist/* /opt/vidsync/
chown -R vidsync:vidsync /opt/vidsync

# 5. Install dependencies
cd /opt/vidsync
npm ci --production

# 6. Configure environment
cp /tmp/.env.prod /opt/vidsync/.env
chmod 600 /opt/vidsync/.env
chown vidsync:vidsync /opt/vidsync/.env
```

### 9.2 Systemd Service Setup
```bash
# Create /etc/systemd/system/vidsync.service
cat > /etc/systemd/system/vidsync.service << 'EOF'
[Unit]
Description=Vidsync Cloud Backend
After=network.target postgresql.service

[Service]
Type=simple
User=vidsync
WorkingDirectory=/opt/vidsync
EnvironmentFile=/opt/vidsync/.env
ExecStart=/usr/bin/node /opt/vidsync/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Resource limits
LimitNOFILE=65535
MemoryLimit=2G
CPUQuota=100%

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable vidsync
systemctl start vidsync
systemctl status vidsync
```

### 9.3 Nginx Reverse Proxy Setup
```nginx
# Create /etc/nginx/sites-available/vidsync
upstream vidsync_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name vidsync.example.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vidsync.example.com;

    # SSL configuration
    ssl_certificate /etc/vidsync/certs/server.crt;
    ssl_certificate_key /etc/vidsync/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/vidsync-access.log;
    error_log /var/log/nginx/vidsync-error.log;

    # Proxy configuration
    location / {
        proxy_pass http://vidsync_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable and test:
```bash
ln -s /etc/nginx/sites-available/vidsync /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

**Checklist**:
- [ ] App user created with minimal permissions
- [ ] Application directory owned by app user
- [ ] Systemd service file created and enabled
- [ ] Nginx reverse proxy configured
- [ ] SSL/TLS certificate installed
- [ ] Service starts automatically on reboot

---

## 10. Post-Deployment Verification

### 10.1 Service Health
```bash
# Check service status
systemctl status vidsync

# View recent logs
journalctl -u vidsync -n 50 -f

# Check port is listening
netstat -tulpn | grep 3000
# or
lsof -i :3000
```

### 10.2 API Testing
```bash
# Health check
curl -k https://vidsync.example.com/health

# Auth test
curl -X POST https://vidsync.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"..."}'

# Rate limiting test
for i in {1..150}; do
  curl -s https://vidsync.example.com/health > /dev/null
done
# Should get 429 after 100 requests

# Audit log check
tail -f /var/log/vidsync/audit.log
```

### 10.3 Performance Testing
```bash
# Load test with Apache Bench
ab -n 1000 -c 100 https://vidsync.example.com/health

# Response time analysis
curl -w "@curl-format.txt" -o /dev/null -s https://vidsync.example.com/health
```

**Checklist**:
- [ ] Service is running and healthy
- [ ] API endpoints respond correctly
- [ ] Rate limiting is working
- [ ] Audit logs are being recorded
- [ ] Response times are acceptable (<500ms typical)

---

## 11. Monitoring & Alerting

### 11.1 Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU Usage | > 80% | Scale up or optimize |
| Memory Usage | > 85% | Restart or scale up |
| Disk Usage | > 90% | Clean up logs or expand |
| Error Rate | > 1% | Investigate errors |
| Response Time | > 1000ms | Check performance |
| Database Connections | > 15/20 | Check for leaks |

### 11.2 Monitoring Tools
- **Prometheus**: Metrics collection
- **Grafana**: Visualization
- **ELK Stack**: Log aggregation
- **PagerDuty**: Alert routing
- **New Relic**: APM (optional)

### 11.3 Alert Rules
```yaml
# Example Prometheus rules
- alert: HighErrorRate
  expr: error_rate > 0.01
  for: 5m
  annotations:
    summary: "High error rate detected"

- alert: ServiceDown
  expr: health_check_status == 0
  for: 2m
  annotations:
    summary: "Vidsync service is down"
```

**Checklist**:
- [ ] Metrics are being collected
- [ ] Dashboards are configured
- [ ] Alerts are sent to on-call rotation
- [ ] Alert thresholds are tuned
- [ ] Runbooks exist for common alerts

---

## 12. Disaster Recovery Plan

### 12.1 Database Failure
1. Stop application: `systemctl stop vidsync`
2. Restore from backup: `pg_restore < /backups/vidsync_latest.sql`
3. Verify data integrity
4. Start application: `systemctl start vidsync`

### 12.2 Application Crash
1. Check logs: `journalctl -u vidsync -n 100`
2. Restart service: `systemctl restart vidsync`
3. If persistent, rollback to previous version
4. Investigate root cause

### 12.3 Data Corruption
1. Stop application
2. Restore from most recent backup
3. Verify file integrity
4. Restart application
5. Audit transaction logs to identify issue

### 12.4 Security Incident
1. Isolate server (if necessary)
2. Review audit logs: `grep -i "error\|fail" /var/log/vidsync/audit.log`
3. Check for unauthorized access
4. Rotate compromised credentials
5. Restore from backup if data was modified

**Checklist**:
- [ ] Backup restoration procedure is tested monthly
- [ ] RTO (Recovery Time Objective) < 1 hour
- [ ] RPO (Recovery Point Objective) < 1 hour
- [ ] Disaster recovery runbook is documented
- [ ] Team is trained on recovery procedures

---

## 13. Security Hardening Checklist

### Application Level
- [ ] All inputs are validated
- [ ] SQL injection prevention (use prepared statements)
- [ ] XSS protection (CSP headers)
- [ ] CSRF tokens on state-changing operations
- [ ] Secrets are never logged
- [ ] Dependencies are regularly updated

### Infrastructure Level
- [ ] Firewall rules restrict traffic to necessary ports
- [ ] SSH key-based authentication only (no passwords)
- [ ] SSH access from specific IP addresses
- [ ] SELinux or AppArmor enabled (if applicable)
- [ ] Fail2ban or similar for brute force protection
- [ ] Regular security patches applied

### Data Level
- [ ] Database passwords are strong (20+ chars)
- [ ] Database backups are encrypted
- [ ] Backups are stored off-system
- [ ] Data at rest is encrypted (if sensitive)
- [ ] Data in transit uses TLS 1.2+
- [ ] PII is not logged unnecessarily

### Operational Level
- [ ] Least privilege access for all users
- [ ] Multi-factor authentication for admin access
- [ ] Audit logs are retained and monitored
- [ ] Regular security scans (OWASP Top 10)
- [ ] Incident response plan is documented
- [ ] Team security training is current

---

## 14. Production Readiness Verification

Before going live, verify all items:

```bash
# 1. TypeScript compilation
npm run build
# Output: ✓ No errors

# 2. Tests passing
npm test
# Output: ✓ All tests pass

# 3. Security audit
npm audit --production
# Output: ✓ 0 vulnerabilities

# 4. Environment check
node scripts/validate-env.js
# Output: ✓ All required variables present

# 5. Database connectivity
node scripts/test-db-connection.js
# Output: ✓ Connected to PostgreSQL

# 6. Service startup
systemctl start vidsync
sleep 5
systemctl status vidsync
# Output: ✓ Active (running)

# 7. API responsiveness
curl https://vidsync.example.com/health
# Output: {"status":"ok",...}

# 8. SSL certificate valid
curl -v https://vidsync.example.com/health 2>&1 | grep -i "certificate"
# Output: ✓ Valid certificate

# 9. Rate limiting working
ab -n 150 https://vidsync.example.com/health
# Output: ✓ 429 status after limit

# 10. Audit logging active
tail /var/log/vidsync/audit.log
# Output: ✓ Recent entries visible
```

---

## 15. Final Deployment Sign-Off

**Before production deployment, ensure all sign-offs:**

| Component | Owner | Status | Sign-off Date |
|-----------|-------|--------|--------------|
| Security Review | Security Team | ⬜ | ____________ |
| Performance Testing | DevOps Team | ⬜ | ____________ |
| Database Setup | DBA | ⬜ | ____________ |
| Backup Verification | SRE Team | ⬜ | ____________ |
| Load Testing | QA Team | ⬜ | ____________ |
| Final Checklist | Product Lead | ⬜ | ____________ |

---

## Summary

This checklist covers all aspects of production deployment:
- ✅ Security hardening (secrets, TLS, auth, rate limiting)
- ✅ Audit logging and monitoring
- ✅ Database configuration and backups
- ✅ CI/CD pipeline setup
- ✅ Environment configuration
- ✅ Deployment procedures
- ✅ Post-deployment verification
- ✅ Disaster recovery planning
- ✅ Security compliance

**Estimated Deployment Time**: 2-3 hours (first deployment)  
**Estimated Ongoing Monitoring**: 1 hour per week

**Support**: For questions or issues, contact DevOps team or refer to deployment runbooks.
