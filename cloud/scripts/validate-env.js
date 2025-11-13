#!/usr/bin/env node

/**
 * Environment Validation Script
 * Validates all required environment variables and configuration before startup
 * 
 * Usage: node scripts/validate-env.js
 */

const fs = require('fs');
const path = require('path');

const results = [];
let hasErrors = false;
let hasWarnings = false;

function log(level, message) {
  const colors = {
    error: '\x1b[31m',
    warning: '\x1b[33m',
    success: '\x1b[32m',
    info: '\x1b[36m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[level]}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

function validateRequired(envVar, message, options = {}) {
  const value = process.env[envVar];

  if (!value) {
    results.push({
      valid: false,
      message: message || `${envVar} is not set`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `${envVar} is not set`);
    return;
  }

  if (options.minLength && value.length < options.minLength) {
    results.push({
      valid: false,
      message: `${envVar} must be at least ${options.minLength} characters`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `${envVar} is too short (minimum ${options.minLength} chars)`);
    return;
  }

  if (options.regex && !options.regex.test(value)) {
    results.push({
      valid: false,
      message: `${envVar} format is invalid`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `${envVar} format is invalid`);
    return;
  }

  log('success', `✓ ${envVar} is configured`);
}

function validateOptional(envVar, description, defaultValue) {
  const value = process.env[envVar] || defaultValue;

  if (!value) {
    results.push({
      valid: true,
      message: `${envVar} is optional and not set`,
      level: 'warning',
    });
    hasWarnings = true;
    log('warning', `${envVar} is optional (not set)`);
    return;
  }

  log('success', `✓ ${envVar} is configured`);
}

function validateEnum(envVar, validValues, description) {
  const value = process.env[envVar];

  if (!value) {
    results.push({
      valid: false,
      message: `${envVar} is not set`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `${envVar} is not set`);
    return;
  }

  if (!validValues.includes(value)) {
    results.push({
      valid: false,
      message: `${envVar} must be one of: ${validValues.join(', ')}`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `${envVar} must be one of: ${validValues.join(', ')}`);
    return;
  }

  log('success', `✓ ${envVar} is set to: ${value}`);
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('         Vidsync Environment Configuration Validator');
console.log('════════════════════════════════════════════════════════════\n');

// ========== REQUIRED VARIABLES ==========
log('info', 'Checking required variables...\n');

validateRequired('NODE_ENV', 'NODE_ENV must be set');
validateEnum('NODE_ENV', ['development', 'production', 'staging'], 'Environment');

validateRequired('PORT', 'PORT must be set (default: 3000)');
if (process.env.PORT) {
  const port = parseInt(process.env.PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    hasErrors = true;
    log('error', `PORT must be a valid port number (1-65535), got ${process.env.PORT}`);
  } else {
    log('success', `✓ PORT is valid: ${port}`);
  }
}

validateRequired(
  'SUPABASE_URL',
  'SUPABASE_URL is required (from Supabase dashboard)',
  { regex: /^https:\/\/.+\.supabase\.co/ }
);

validateRequired(
  'SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY is required',
  { minLength: 20 }
);

validateRequired(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY is required',
  { minLength: 20 }
);

validateRequired(
  'JWT_SECRET',
  'JWT_SECRET must be at least 32 characters (generate with: openssl rand -base64 32)',
  { minLength: 32 }
);

validateOptional('JWT_EXPIRY', 'JWT expiry duration', '24h');

// ========== NEBULA CONFIGURATION ==========
log('info', '\nChecking Nebula configuration...\n');

validateRequired('NEBULA_NETWORK_CIDR', 'NEBULA_NETWORK_CIDR is required');
validateRequired('NEBULA_LIGHTHOUSE_IPS', 'NEBULA_LIGHTHOUSE_IPS is required');

// Only validate CA files if in production
if (process.env.NODE_ENV === 'production') {
  const caCertFile = process.env.NEBULA_CA_CERT || '/etc/vidsync/certs/ca.crt';
  const caKeyFile = process.env.NEBULA_CA_KEY || '/etc/vidsync/certs/ca.key';

  if (!fs.existsSync(caCertFile)) {
    results.push({
      valid: false,
      message: `Nebula CA certificate not found: ${caCertFile}`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `Nebula CA certificate not found: ${caCertFile}`);
  } else {
    log('success', `✓ Nebula CA certificate found: ${caCertFile}`);
  }

  if (!fs.existsSync(caKeyFile)) {
    results.push({
      valid: false,
      message: `Nebula CA key not found: ${caKeyFile}`,
      level: 'error',
    });
    hasErrors = true;
    log('error', `Nebula CA key not found: ${caKeyFile}`);
  } else {
    log('success', `✓ Nebula CA key found: ${caKeyFile}`);
  }
}

// ========== RATE LIMITING ==========
log('info', '\nChecking rate limiting configuration...\n');

validateOptional('RATE_LIMIT_REQUESTS', 'Global rate limit requests', '100');
validateOptional('RATE_LIMIT_WINDOW_MS', 'Rate limit window', '60000');
validateOptional('RATE_LIMIT_AUTH', 'Auth endpoint rate limit', '20');
validateOptional('RATE_LIMIT_PAIRING', 'Pairing endpoint rate limit', '10');
validateOptional('RATE_LIMIT_SYNC', 'Sync endpoint rate limit', '50');

// ========== AUDIT LOGGING ==========
log('info', '\nChecking audit logging configuration...\n');

validateOptional('AUDIT_LOGGING_ENABLED', 'Audit logging', 'true');
validateOptional('AUDIT_LOG_FILE', 'Audit log file', '/var/log/vidsync/audit.log');
validateOptional('AUDIT_LOG_RETENTION_DAYS', 'Audit log retention', '90');

// Check if audit log directory exists if logging is enabled
if (process.env.AUDIT_LOGGING_ENABLED === 'true' && process.env.NODE_ENV === 'production') {
  const logDir = path.dirname(process.env.AUDIT_LOG_FILE || '/var/log/vidsync/audit.log');
  if (!fs.existsSync(logDir)) {
    log('warning', `Audit log directory will be created: ${logDir}`);
  } else {
    log('success', `✓ Audit log directory exists: ${logDir}`);
  }
}

// ========== SECURITY ==========
log('info', '\nChecking security configuration...\n');

validateOptional(
  'CORS_ORIGINS',
  'CORS allowed origins',
  'http://localhost:3000'
);

validateOptional('ENABLE_TLS', 'TLS/SSL enabled', 'false');

if (process.env.ENABLE_TLS === 'true' && process.env.NODE_ENV === 'production') {
  const tlsCert = process.env.TLS_CERT_FILE;
  const tlsKey = process.env.TLS_KEY_FILE;

  if (tlsCert && !fs.existsSync(tlsCert)) {
    hasErrors = true;
    log('error', `TLS certificate not found: ${tlsCert}`);
  } else if (tlsCert) {
    log('success', `✓ TLS certificate found: ${tlsCert}`);
  }

  if (tlsKey && !fs.existsSync(tlsKey)) {
    hasErrors = true;
    log('error', `TLS key not found: ${tlsKey}`);
  } else if (tlsKey) {
    log('success', `✓ TLS key found: ${tlsKey}`);
  }
}

validateOptional('HSTS_MAX_AGE', 'HSTS max-age', '31536000');

// ========== LOGGING ==========
log('info', '\nChecking logging configuration...\n');

validateOptional('LOG_LEVEL', 'Log level', 'info');
validateOptional('LOG_FILE', 'Log file', '/var/log/vidsync/app.log');
validateOptional('LOG_MAX_SIZE', 'Log max size', '10m');
validateOptional('LOG_MAX_FILES', 'Log max files', '10');

// ========== DATABASE ==========
log('info', '\nChecking database configuration...\n');

validateRequired(
  'DATABASE_URL',
  'DATABASE_URL must be set (postgresql://user:password@host:5432/dbname)',
  { regex: /^postgresql:\/\/.+/ }
);

validateOptional('DATABASE_POOL_SIZE', 'Database pool size', '20');
validateOptional('DATABASE_IDLE_TIMEOUT', 'Database idle timeout', '30000');

// ========== BACKUP ==========
log('info', '\nChecking backup configuration...\n');

validateOptional('BACKUP_ENABLED', 'Backups enabled', 'true');
validateOptional('BACKUP_SCHEDULE', 'Backup schedule (cron)', '0 2 * * *');
validateOptional('BACKUP_RETENTION_DAYS', 'Backup retention', '30');
validateOptional('BACKUP_LOCATION', 'Backup location', '/backups/vidsync');

// ========== FEATURE FLAGS ==========
log('info', '\nChecking feature flags...\n');

validateOptional('FEATURE_DEVICE_PAIRING', 'Device pairing feature', 'true');
validateOptional('FEATURE_AUDIT_LOG', 'Audit logging feature', 'true');
validateOptional('FEATURE_ADVANCED_SYNC', 'Advanced sync feature', 'true');

// ========== SUMMARY ==========
console.log('\n════════════════════════════════════════════════════════════');

const totalChecks = results.length;
const errorCount = results.filter((r) => r.level === 'error').length;
const warningCount = results.filter((r) => r.level === 'warning').length;

if (hasErrors) {
  log('error', `\n❌ VALIDATION FAILED: ${errorCount} error(s), ${warningCount} warning(s)\n`);
  process.exit(1);
} else if (hasWarnings) {
  log(
    'warning',
    `\n⚠️  VALIDATION PASSED WITH WARNINGS: ${warningCount} warning(s)\n`
  );
  process.exit(0);
} else {
  log('success', `\n✅ VALIDATION PASSED: All checks completed successfully!\n`);
  process.exit(0);
}
