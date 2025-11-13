/**
 * Logging utility for development/production environments
 * Filters debug logs in production and provides user-friendly messages
 */

const isDev = process.env.NODE_ENV === 'development';

// Categories to suppress in production (technical debug info)
const SUPPRESSED_CATEGORIES = new Set([
  '[Nebula] __dirname=',
  '[Nebula] candidate not found:',
  '[Nebula] attempting to spawn from:',
  '[Syncthing] __dirname=',
  '[Syncthing] candidate not found:',
  '[Syncthing] attempting to spawn from:',
  'Device info from agent:',
]);

// Messages that should always be shown (errors and important info)
const ALWAYS_SHOW = new Set([
  'Failed to start shared Syncthing',
  'TUN device not assigned',
  'Elevation succeeded',
  'Successfully extracted to',
  'Missing required file:',
  'Failed to',
  'Error:',
  'error:',
]);

/**
 * Filter function: determines if a message should be logged
 */
export const shouldLog = (message: string | undefined): boolean => {
  if (!message) return false;
  
  // In development, show everything
  if (isDev) return true;
  
  // In production, always show important messages
  for (const pattern of ALWAYS_SHOW) {
    if (message.includes(pattern)) return true;
  }
  
  // In production, suppress technical debug logs
  for (const pattern of SUPPRESSED_CATEGORIES) {
    if (message.includes(pattern)) return false;
  }
  
  // By default, show the message
  return true;
};

/**
 * Convert technical log messages to user-friendly messages
 */
export const getUserFriendlyMessage = (message: string): string => {
  const userMessages: { [key: string]: string } = {
    '[Nebula] started via': '✓ Network layer initialized',
    '[Syncthing] started via': '✓ File sync service started',
    'Nebula started via': '✓ Network layer initialized',
    'Syncthing started via': '✓ File sync service started',
    'Added folder for project': '✓ Folder added to sync',
    'Restarting Nebula after setcap': '⟳ Restarting network layer...',
    'Attempting automatic elevation with pkexec': '⟳ Requesting elevated access...',
    'Set node.key permissions to 0o600': '✓ Security permissions set',
    'Successfully extracted to': '✓ Installation completed',
    '[bundle:extract] Copied': '✓ Installation step completed',
    'TUN device not assigned': '⚠ Network access needs permission',
    'Nebula binary not found': '⚠ Network layer unavailable',
    'Syncthing binary not found': '⚠ File sync service unavailable',
  };
  
  // Return user-friendly version if available, otherwise original
  for (const [technical, friendly] of Object.entries(userMessages)) {
    if (message.includes(technical)) {
      return friendly;
    }
  }
  
  return message;
};

/**
 * Logger with filtering and user-friendly output
 */
export const logger = {
  log: (message?: any, ...args: any[]) => {
    const msg = message?.toString?.() || String(message);
    if (shouldLog(msg)) {
      console.log(msg, ...args);
    }
  },
  
  warn: (message?: any, ...args: any[]) => {
    const msg = message?.toString?.() || String(message);
    if (shouldLog(msg)) {
      // Show warnings in both dev and prod
      console.warn(msg, ...args);
    }
  },
  
  error: (message?: any, ...args: any[]) => {
    const msg = message?.toString?.() || String(message);
    // Always show errors
    console.error(msg, ...args);
  },
  
  info: (message?: any, ...args: any[]) => {
    const msg = message?.toString?.() || String(message);
    if (shouldLog(msg)) {
      console.info(msg, ...args);
    }
  },
  
  debug: (message?: any, ...args: any[]) => {
    if (isDev) {
      console.log(message, ...args);
    }
  },
};

/**
 * Create a logger for a specific service
 */
export const createServiceLogger = (serviceName: string) => {
  return {
    log: (message: string, ...args: any[]) => {
      logger.log(`[${serviceName}] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      logger.warn(`[${serviceName}] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      logger.error(`[${serviceName}] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      logger.debug(`[${serviceName}] ${message}`, ...args);
    },
  };
};

/**
 * Check if we're in development mode
 */
export const isDevelopment = (): boolean => isDev;
