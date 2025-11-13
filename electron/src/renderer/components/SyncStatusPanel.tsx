/**
 * Sync Status Panel Component
 * Displays real-time synchronization status across connected devices
 */

import React, { useEffect, useState } from 'react';

interface SyncStatusInfo {
  running: boolean;
  folderConfigured: boolean;
  deviceCount?: number;
  lastSyncTime?: string;
  status?: string;
}

interface SyncStatusPanelProps {
  projectId: string;
  pollInterval?: number;
}

/**
 * Format timestamp to relative time
 */
const formatRelativeTime = (timestamp?: string): string => {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/**
 * Sync Status Panel Component
 */
const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({ 
  projectId, 
  pollInterval = 3000 
}) => {
  const [status, setStatus] = useState<SyncStatusInfo | null>(null);
  const [syncHealth, setSyncHealth] = useState<'healthy' | 'warning' | 'error'>('error');

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      if (!projectId) return;
      try {
        const s = await (window as any).api.syncthingStatusForProject(projectId);
        if (!mounted) return;
        
        setStatus(s || { running: false, folderConfigured: false });

        // Determine health status
        if (!s || !s.running) {
          setSyncHealth('error');
        } else if (s.folderConfigured) {
          setSyncHealth('healthy');
        } else {
          setSyncHealth('warning');
        }
      } catch (e) {
        if (mounted) setSyncHealth('error');
      }

      if (mounted) {
        setTimeout(poll, pollInterval);
      }
    };

    poll();
    return () => { mounted = false; };
  }, [projectId, pollInterval]);

  if (!status) {
    return null;
  }

  const statusColors = {
    healthy: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', indicator: 'bg-green-500' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-900', indicator: 'bg-yellow-500' },
    error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', indicator: 'bg-red-500' },
  };

  const colors = statusColors[syncHealth];

  return (
    <div className={`mt-4 p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
      <div className="flex items-center">
        {/* Status Indicator */}
        <div className={`w-3 h-3 rounded-full ${colors.indicator} mr-3`} />

        {/* Status Text */}
        <div className="flex-1">
          <div className={`text-sm font-semibold ${colors.text}`}>
            {syncHealth === 'healthy' && '✓ Sync Ready'}
            {syncHealth === 'warning' && '⚠ Waiting for Configuration'}
            {syncHealth === 'error' && '✗ Service Not Running'}
          </div>
          <div className={`text-xs ${colors.text} opacity-75`}>
            {status.running ? (
              <>
                Service active · 
                {status.folderConfigured && (
                  <>
                    Folder configured · Last sync: {formatRelativeTime(status.lastSyncTime)}
                  </>
                )}
                {!status.folderConfigured && ' Waiting for folder setup'}
              </>
            ) : (
              'File sync service is not running'
            )}
          </div>
        </div>

        {/* Status Details */}
        <div className="text-right">
          <div className={`text-lg font-bold ${colors.text}`}>
            {status.running ? '●' : '○'}
          </div>
          <div className={`text-xs ${colors.text} opacity-75`}>
            {status.running ? 'Active' : 'Inactive'}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      {status.running && status.folderConfigured && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-20">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className={`${colors.text} opacity-75`}>Status:</span>
              <span className={`block font-semibold ${colors.text}`}>{status.status || 'Ready'}</span>
            </div>
            <div>
              <span className={`${colors.text} opacity-75`}>Connected Devices:</span>
              <span className={`block font-semibold ${colors.text}`}>{status.deviceCount || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncStatusPanel;
