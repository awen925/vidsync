/**
 * Syncthing Configuration
 * 
 * To enable Syncthing support, ensure you have:
 * 1. Syncthing running locally or on a remote server
 * 2. Syncthing API enabled and accessible
 * 3. API key configured in environment or passed at runtime
 */

export const SYNCTHING_CONFIG = {
  // Default Syncthing host and port
  DEFAULT_HOST: process.env.SYNCTHING_HOST || 'localhost',
  DEFAULT_PORT: parseInt(process.env.SYNCTHING_PORT || '8384'),
  
  // API key - pass per-request or set in environment
  API_KEY: process.env.SYNCTHING_API_KEY || null,
  
  // Connection timeout
  TIMEOUT_MS: parseInt(process.env.SYNCTHING_TIMEOUT || '30000'),
  
  // Folder defaults
  FOLDER_TYPE: 'sendreceive', // 'sendreceive' or 'receiveonly'
  RESCAN_INTERVAL: 3600, // seconds
  
  // Enable FS watcher for immediate sync detection
  FS_WATCHER_ENABLED: true,
  FS_WATCHER_DELAY: 5, // seconds
};

/**
 * Setup Instructions for Syncthing
 * 
 * 1. Install Syncthing:
 *    Ubuntu/Debian: sudo apt-get install syncthing
 *    macOS: brew install syncthing
 *    Windows: Download from https://syncthing.net/downloads
 * 
 * 2. Start Syncthing:
 *    syncthing
 * 
 * 3. Access Web UI:
 *    Open http://localhost:8384 in your browser
 * 
 * 4. Enable REST API:
 *    - Go to Settings
 *    - Check "Enable REST API"
 *    - Generate API Key
 *    - Save the API Key
 * 
 * 5. Configure Environment:
 *    Set these environment variables:
 *    - SYNCTHING_HOST=localhost (or your server IP)
 *    - SYNCTHING_PORT=8384 (or configured port)
 *    - SYNCTHING_API_KEY=your_api_key_here
 * 
 * 6. Add Devices:
 *    - In Web UI: Add → New Device
 *    - Enter device ID (found in device settings)
 *    - Share folders with this device
 * 
 * 7. Create Folders:
 *    - Folders tab → New Folder
 *    - Set folder ID (use project ID for consistency)
 *    - Set folder path
 *    - Select devices to share with
 *    - Save
 */
