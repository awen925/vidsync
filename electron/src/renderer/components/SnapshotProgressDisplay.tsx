import React from 'react';
import { AlertCircle, CheckCircle, Loader, AlertTriangle } from 'lucide-react';
import { SnapshotProgressEvent } from '../services/progressClient';

interface SnapshotProgressDisplayProps {
  progress: SnapshotProgressEvent | null;
  error: Error | null;
  status: 'idle' | 'connected' | 'disconnected' | 'reconnecting';
  isLoading?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  waiting: 'Waiting for Syncthing',
  browsing: 'Scanning Files',
  compressing: 'Processing Metadata',
  uploading: 'Uploading to Cloud',
  completed: 'Completed',
  failed: 'Failed',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  waiting: 'Waiting for Syncthing scan to complete...',
  browsing: 'Scanning files in the folder...',
  compressing: 'Processing file metadata...',
  uploading: 'Uploading snapshot to cloud storage...',
  completed: 'Snapshot generated successfully!',
  failed: 'Failed to generate snapshot.',
};

/**
 * Real-time snapshot progress display component
 * Shows progress bar, step indicator, and status messages
 */
export function SnapshotProgressDisplay({
  progress,
  error,
  status,
  isLoading = false,
}: SnapshotProgressDisplayProps) {
  if (!progress && !isLoading) {
    return null;
  }

  const currentProgress = progress?.progress ?? 0;
  const currentStep = progress?.step ?? 'waiting';
  const currentStepNum = progress?.stepNumber ?? 0;
  const totalSteps = progress?.totalSteps ?? 6;

  const isTerminal = currentStep === 'completed' || currentStep === 'failed';
  const isError = currentStep === 'failed' || error;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      {/* Header with status icon */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Generating Snapshot
        </h3>
        <div className="flex items-center gap-2">
          {isError ? (
            <AlertCircle className="w-5 h-5 text-red-500" />
          ) : currentStep === 'completed' ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : status === 'reconnecting' ? (
            <AlertTriangle className="w-5 h-5 text-yellow-500 animate-pulse" />
          ) : (
            <Loader className="w-5 h-5 text-blue-500 animate-spin" />
          )}
          <span className="text-sm font-medium text-gray-600">
            {status === 'reconnecting'
              ? 'Reconnecting...'
              : status === 'disconnected'
                ? 'Disconnected'
                : isTerminal
                  ? currentStep === 'completed'
                    ? 'Complete'
                    : 'Failed'
                  : 'In Progress'}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {STEP_LABELS[currentStep] || currentStep}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {currentProgress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isError
                ? 'bg-red-500'
                : currentStep === 'completed'
                  ? 'bg-green-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">
          Step {currentStepNum} of {totalSteps}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < currentStepNum
                  ? isError
                    ? 'bg-red-500'
                    : 'bg-green-500'
                  : i === currentStepNum - 1
                    ? isError
                      ? 'bg-red-300'
                      : 'bg-blue-500'
                    : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Message and details */}
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          {STEP_DESCRIPTIONS[currentStep] || progress?.message}
        </p>

        {/* File count and size */}
        {progress && progress.fileCount > 0 && (
          <p className="text-xs text-gray-500">
            {progress.fileCount} files • {progress.totalSize} total
          </p>
        )}

        {/* Error message */}
        {(isError || error) && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">
              {error?.message || progress?.error || 'An error occurred'}
            </p>
          </div>
        )}

        {/* Success message with URL */}
        {currentStep === 'completed' && progress?.snapshotUrl && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
            <p className="text-sm text-green-700 font-medium">
              ✓ Snapshot created successfully!
            </p>
            <p className="text-xs text-green-600 mt-1 truncate">
              {progress.snapshotUrl}
            </p>
          </div>
        )}
      </div>

      {/* Connection status indicator */}
      {status !== 'idle' && (
        <div className="pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            {status === 'reconnecting'
              ? '🔄 Connection unstable, reconnecting...'
              : status === 'disconnected'
                ? '⚠️ Connection lost, attempting to reconnect...'
                : '✓ Connection stable'}
          </p>
        </div>
      )}
    </div>
  );
}

export default SnapshotProgressDisplay;
