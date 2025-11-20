import React from 'react';
import { X } from 'lucide-react';
import SnapshotProgressDisplay from './SnapshotProgressDisplay';
import useSnapshotProgress from '../hooks/useSnapshotProgress';

interface SnapshotProgressModalProps {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (snapshotUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Modal dialog for displaying snapshot generation progress
 * Automatically closes on completion or error (with delay for user to see result)
 */
export function SnapshotProgressModal({
  projectId,
  isOpen,
  onClose,
  onComplete,
  onError,
}: SnapshotProgressModalProps) {
  const { progress, error, status } = useSnapshotProgress(projectId, {
    autoStop: false,
  });

  // Handle completion
  React.useEffect(() => {
    if (progress?.step === 'completed' && progress.snapshotUrl) {
      onComplete?.(progress.snapshotUrl);
      // Auto-close after 2 seconds to let user see success
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [progress?.step, progress?.snapshotUrl, onComplete, onClose]);

  // Handle errors
  React.useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Modal header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {progress?.step === 'completed' ? 'Snapshot Ready' : 'Generating Snapshot'}
          </h2>
          {progress?.step === 'completed' || progress?.step === 'failed' ? (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-5 h-5" />
          )}
        </div>

        {/* Modal content */}
        <div className="p-6">
          <SnapshotProgressDisplay
            progress={progress}
            error={error}
            status={status}
            isLoading={!progress}
          />
        </div>

        {/* Modal footer */}
        {(progress?.step === 'completed' || progress?.step === 'failed') && (
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
            >
              {progress.step === 'completed' ? 'Done' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SnapshotProgressModal;
