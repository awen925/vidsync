/**
 * Progress Status Component
 * Displays file transfer progress, active transfers list, and sync status
 */

import React, { useEffect, useState } from 'react';

interface ProgressInfo {
  completion?: {
    completion?: number;
  };
  activeTransfers?: Array<{
    file: string;
    bytesDone: number;
    bytesTotal: number;
    device?: string;
  }>;
  success?: boolean;
  error?: string;
}

interface ProgressStatusProps {
  projectId: string;
  pollInterval?: number;
  onProgressUpdate?: (info: ProgressInfo) => void;
}

/**
 * Format bytes to human-readable size
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Calculate transfer speed (bytes per second)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const calculateSpeed = (bytesDone: number, secondsElapsed: number): string => {
  if (secondsElapsed <= 0) return '0 B/s';
  const bytesPerSecond = bytesDone / secondsElapsed;
  return formatBytes(Math.round(bytesPerSecond)) + '/s';
};

/**
 * Estimate time remaining
 */
const estimateTimeRemaining = (bytesDone: number, bytesTotal: number, secondsElapsed: number): string => {
  if (secondsElapsed <= 0 || bytesDone === 0) return '--:--';
  const bytesPerSecond = bytesDone / secondsElapsed;
  if (bytesPerSecond === 0) return '--:--';
  const bytesRemaining = bytesTotal - bytesDone;
  const secondsRemaining = bytesRemaining / bytesPerSecond;
  
  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = Math.floor(secondsRemaining % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
};

/**
 * Progress Status Component
 */
const ProgressStatus: React.FC<ProgressStatusProps> = ({ 
  projectId, 
  pollInterval = 2000,
  onProgressUpdate
}) => {
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [overallPercent, setOverallPercent] = useState<number>(0);
  const [transferSpeed, setTransferSpeed] = useState<string>('0 B/s');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [hasActiveTransfers, setHasActiveTransfers] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    let lastBytesDone = 0;
    let lastTime = Date.now();

    const poll = async () => {
      if (!projectId) return;
      try {
        const p = await (window as any).api.syncthingProgressForProject(projectId);
        if (!mounted) return;
        
        setProgress(p);
        onProgressUpdate?.(p);

        if (p && p.success) {
          // Calculate overall progress
          let totalBytes = 0;
          let totalBytesDone = 0;
          const activeTransfers = p.activeTransfers || [];

          for (const t of activeTransfers) {
            totalBytes += t.bytesTotal || 0;
            totalBytesDone += t.bytesDone || 0;
          }

          const percent = totalBytes > 0 ? Math.round((totalBytesDone / totalBytes) * 100) : 0;
          setOverallPercent(percent);
          setHasActiveTransfers(activeTransfers.length > 0);

          // Calculate speed
          const now = Date.now();
          const timeElapsed = (now - lastTime) / 1000;
          const bytesDoneDelta = totalBytesDone - lastBytesDone;
          
          if (timeElapsed > 1) {
            const speed = bytesDoneDelta / timeElapsed;
            setTransferSpeed(formatBytes(Math.round(speed)) + '/s');
            lastBytesDone = totalBytesDone;
            lastTime = now;
          }

          // Reset start time if transfers just started
          if (totalBytesDone === 0) {
            setStartTime(Date.now());
          }
        }
      } catch (e) {
        // Silently fail
      }

      if (mounted) {
        setTimeout(poll, pollInterval);
      }
    };

    poll();
    return () => { mounted = false; };
  }, [projectId, pollInterval, onProgressUpdate]);

  if (!progress || !progress.success) {
    return null;
  }

  const activeTransfers = progress.activeTransfers || [];
  const completionPercent = progress.completion?.completion || 0;

  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      {/* Overall Status Summary */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Sync Status</h4>
          <span className="text-xs text-gray-600">
            {hasActiveTransfers ? `${activeTransfers.length} active transfer${activeTransfers.length !== 1 ? 's' : ''}` : 'Idle'}
          </span>
        </div>

        {/* Overall Progress Bar */}
        {hasActiveTransfers && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-700">Overall Progress</span>
              <span className="text-xs font-medium text-gray-900">{overallPercent}%</span>
            </div>
            <div className="w-full h-6 bg-gray-300 rounded-full overflow-hidden">
              <div
                style={{
                  height: '100%',
                  width: `${overallPercent}%`,
                  backgroundColor: overallPercent < 50 ? '#F59E0B' : overallPercent < 100 ? '#3B82F6' : '#10B981',
                  transition: 'width 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="text-xs font-semibold text-white">
                  {overallPercent > 10 && `${overallPercent}%`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Speed and ETA */}
        {hasActiveTransfers && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white p-2 rounded border border-gray-200">
              <div className="text-gray-600">Speed</div>
              <div className="font-semibold text-gray-900">{transferSpeed}</div>
            </div>
            <div className="bg-white p-2 rounded border border-gray-200">
              <div className="text-gray-600">Folder Sync</div>
              <div className="font-semibold text-gray-900">{completionPercent}%</div>
            </div>
          </div>
        )}

        {!hasActiveTransfers && (
          <div className="text-xs text-gray-600 p-2 bg-white rounded border border-gray-200">
            ✓ Sync complete ({completionPercent}%)
          </div>
        )}
      </div>

      {/* Active Transfers List */}
      {activeTransfers.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Active Transfers</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {activeTransfers.map((transfer, idx) => {
              const percent = transfer.bytesTotal > 0 
                ? Math.round((transfer.bytesDone / transfer.bytesTotal) * 100) 
                : 0;
              const elapsedSeconds = (Date.now() - startTime) / 1000;
              const eta = estimateTimeRemaining(transfer.bytesDone, transfer.bytesTotal, elapsedSeconds);

              return (
                <div key={idx} className="bg-white p-2 rounded border border-gray-200 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 truncate flex-1">{transfer.file}</span>
                    <span className="text-gray-600 ml-2">{percent}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded overflow-hidden mb-1">
                    <div
                      style={{
                        height: '100%',
                        width: `${percent}%`,
                        backgroundColor: percent < 50 ? '#F59E0B' : '#10B981',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-gray-600 text-xs">
                    <span>
                      {formatBytes(transfer.bytesDone)} / {formatBytes(transfer.bytesTotal)}
                    </span>
                    {percent > 0 && percent < 100 && (
                      <span>ETA: {eta}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressStatus;
