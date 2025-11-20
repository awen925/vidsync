/**
 * ProgressClient handles real-time progress updates from the Go agent
 * Uses Server-Sent Events (SSE) for streaming updates with polling fallback
 */

export interface SnapshotProgressEvent {
  projectId: string;
  step: string; // 'waiting' | 'browsing' | 'compressing' | 'uploading' | 'completed' | 'failed'
  stepNumber: number; // 0-6
  totalSteps: number; // 6
  progress: number; // 0-100
  fileCount: number;
  totalSize: string; // 'KB', 'MB', 'GB' formatted
  message: string;
  snapshotUrl?: string;
  error?: string;
  timestamp: string;
}

export type ProgressCallback = (event: SnapshotProgressEvent) => void;
export type ErrorCallback = (error: Error) => void;
export type StatusCallback = (status: 'connected' | 'disconnected' | 'reconnecting') => void;

export class ProgressClient {
  private eventSource: EventSource | null = null;
  private projectId: string | null = null;
  private progressCallback: ProgressCallback | null = null;
  private errorCallback: ErrorCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1s
  private maxReconnectDelay = 30000; // Cap at 30s
  private logger: any;
  private baseURL = 'http://localhost:5001/api/v1';

  constructor(logger: any) {
    this.logger = logger;
  }

  /**
   * Start listening to progress updates for a project
   */
  start(
    projectId: string,
    onProgress: ProgressCallback,
    onError?: ErrorCallback,
    onStatus?: StatusCallback
  ): void {
    this.projectId = projectId;
    this.progressCallback = onProgress;
    this.errorCallback = onError || (() => {});
    this.statusCallback = onStatus || (() => {});

    this.logger.debug(`[ProgressClient] Starting for project: ${projectId}`);
    this.connectSSE();
  }

  /**
   * Connect via Server-Sent Events
   */
  private connectSSE(): void {
    if (!this.projectId) return;

    try {
      const url = `${this.baseURL}/projects/${this.projectId}/progress/stream`;
      this.logger.debug(`[ProgressClient] Connecting to SSE: ${url}`);

      this.eventSource = new EventSource(url);

      // Handle incoming progress events
      this.eventSource.addEventListener('message', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as SnapshotProgressEvent;
          this.logger.debug(
            `[ProgressClient] Received progress: ${data.step} (${data.progress}%)`
          );
          this.reconnectAttempts = 0; // Reset on successful message
          this.progressCallback?.(data);

          // Auto-cleanup on terminal state
          if (data.step === 'completed' || data.step === 'failed') {
            this.logger.debug(
              `[ProgressClient] Progress terminal state: ${data.step}`
            );
            setTimeout(() => this.stop(), 500);
          }
        } catch (err) {
          this.logger.error(
            `[ProgressClient] Failed to parse progress event: ${err}`
          );
        }
      });

      // Handle connection open
      this.eventSource.addEventListener('open', () => {
        this.logger.debug('[ProgressClient] SSE connection established');
        this.statusCallback?.('connected');
        this.reconnectAttempts = 0;
      });

      // Handle errors
      this.eventSource.addEventListener('error', () => {
        this.logger.warn(
          `[ProgressClient] SSE connection error (attempt ${this.reconnectAttempts + 1})`
        );
        this.statusCallback?.('disconnected');
        this.handleSSEError();
      });
    } catch (error) {
      this.logger.error(
        `[ProgressClient] SSE connection failed: ${error}`
      );
      this.handleSSEError();
    }
  }

  /**
   * Handle SSE connection error with reconnection logic
   */
  private handleSSEError(): void {
    this.eventSource?.close();
    this.eventSource = null;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `[ProgressClient] Max reconnection attempts reached, falling back to polling`
      );
      this.startPolling();
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 15s, 30s...
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.logger.debug(
      `[ProgressClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );
    this.statusCallback?.('reconnecting');

    setTimeout(() => this.connectSSE(), delay);
  }

  /**
   * Start polling as fallback for SSE failure
   */
  private startPolling(): void {
    if (!this.projectId) return;

    this.logger.debug('[ProgressClient] Starting polling fallback');
    this.statusCallback?.('connected'); // Consider polling as "connected"

    this.pollingInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.baseURL}/projects/${this.projectId}/progress`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as SnapshotProgressEvent;
        this.logger.debug(
          `[ProgressClient] Polled progress: ${data.step} (${data.progress}%)`
        );
        this.progressCallback?.(data);

        // Auto-cleanup on terminal state
        if (data.step === 'completed' || data.step === 'failed') {
          this.logger.debug(
            `[ProgressClient] Progress terminal state: ${data.step}`
          );
          this.stop();
        }
      } catch (error) {
        this.logger.error(`[ProgressClient] Polling failed: ${error}`);
        this.errorCallback?.(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }, 1000); // Poll every 1 second
  }

  /**
   * Stop listening to progress updates
   */
  stop(): void {
    this.logger.debug('[ProgressClient] Stopping progress listener');

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.statusCallback?.('disconnected');
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.eventSource !== null || this.pollingInterval !== null;
  }

  /**
   * Check if using polling fallback
   */
  isPolling(): boolean {
    return this.pollingInterval !== null;
  }
}

export default ProgressClient;
