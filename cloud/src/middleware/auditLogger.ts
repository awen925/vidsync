import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditLogEntry {
  timestamp: string;
  userId?: string;
  action: string;
  resource: string;
  method: string;
  path: string;
  statusCode: number;
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, any>;
  error?: string;
}

class AuditLogger {
  private logFile: string;
  private enabled: boolean;
  private logQueue: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.enabled = process.env.AUDIT_LOGGING_ENABLED === 'true';
    this.logFile = process.env.AUDIT_LOG_FILE || '/var/log/vidsync/audit.log';

    if (this.enabled) {
      this.ensureLogDirectory();
      this.startBatchFlushing();
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
    }
  }

  /**
   * Start batch flushing of logs (every 5 seconds)
   */
  private startBatchFlushing(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000);
  }

  /**
   * Log an audit event
   */
  log(entry: Partial<AuditLogEntry>): void {
    if (!this.enabled) return;

    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action: entry.action || 'unknown',
      resource: entry.resource || 'unknown',
      method: entry.method || 'UNKNOWN',
      path: entry.path || '/',
      statusCode: entry.statusCode || 0,
      ipAddress: entry.ipAddress || 'unknown',
      ...entry,
    };

    this.logQueue.push(auditEntry);

    // Flush if queue gets large
    if (this.logQueue.length >= 100) {
      this.flush();
    }
  }

  /**
   * Flush queued logs to file
   */
  private flush(): void {
    if (this.logQueue.length === 0) return;

    const entries = this.logQueue.splice(0);
    const lines = entries
      .map((e) => JSON.stringify(e))
      .join('\n')
      .concat('\n');

    try {
      fs.appendFileSync(this.logFile, lines, { mode: 0o640 });
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }

  /**
   * Get recent audit logs (for dashboard/admin)
   * @param limit Number of entries to retrieve
   * @param filter Optional filter criteria
   */
  getRecentLogs(
    limit: number = 100,
    filter?: Partial<AuditLogEntry>
  ): AuditLogEntry[] {
    if (!fs.existsSync(this.logFile)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.length > 0);

      const entries: AuditLogEntry[] = lines
        .slice(-limit * 2) // Read extra to account for filtering
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is AuditLogEntry => e !== null);

      // Apply filter if provided
      if (filter) {
        return entries
          .filter((e) => {
            if (filter.userId && e.userId !== filter.userId) return false;
            if (filter.action && e.action !== filter.action) return false;
            if (filter.resource && e.resource !== filter.resource) return false;
            return true;
          })
          .slice(-limit);
      }

      return entries.slice(-limit);
    } catch (err) {
      console.error('Failed to read audit logs:', err);
      return [];
    }
  }
}

// Create singleton instance
export const auditLogger = new AuditLogger();

/**
 * Middleware to automatically log all requests
 */
export function auditLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!process.env.AUDIT_LOGGING_ENABLED || process.env.AUDIT_LOGGING_ENABLED === 'false') {
    return next();
  }

  // Capture response status
  const originalSend = res.send;
  let statusCode = res.statusCode;

  res.send = function (data: any) {
    statusCode = res.statusCode;
    return originalSend.call(this, data);
  };

  // Log after response is sent
  res.on('finish', () => {
    const userId = (req as any).user?.id;
    const ipAddress = getClientIp(req);

    // Determine action from method and path
    let action = req.method;
    if (req.path.includes('/auth/')) action = 'AUTH';
    if (req.path.includes('/pairings/')) action = 'PAIRING';
    if (req.path.includes('/projects/')) action = 'PROJECT';
    if (req.path.includes('/devices/')) action = 'DEVICE';

    auditLogger.log({
      userId,
      action,
      resource: extractResource(req.path),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ipAddress,
      userAgent: req.get('user-agent'),
      details: extractRelevantDetails(req, action),
      error: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
    });
  });

  next();
}

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Extract resource name from path
 */
function extractResource(path: string): string {
  const parts = path.split('/').filter((p) => p.length > 0);
  return parts[1] || 'unknown';
}

/**
 * Extract relevant details from request based on action
 */
function extractRelevantDetails(
  req: Request,
  action: string
): Record<string, any> {
  const details: Record<string, any> = {};

  if (action === 'PAIRING') {
    const body = (req as any).body || {};
    details.deviceId = body.deviceId;
    details.inviteCode = body.inviteCode ? 'provided' : 'not-provided';
  }

  if (action === 'PROJECT') {
    const params = (req as any).params || {};
    details.projectId = params.id;
  }

  if (action === 'DEVICE') {
    const params = (req as any).params || {};
    details.deviceId = params.id;
  }

  return details;
}

/**
 * Shutdown audit logger gracefully
 */
process.on('SIGTERM', () => {
  auditLogger.shutdown();
});

process.on('SIGINT', () => {
  auditLogger.shutdown();
});

// Export the logger for use in handlers
export default auditLogger;
