package services

import (
	"sync"
	"time"
)

// SnapshotProgressEvent represents a progress update during snapshot generation
type SnapshotProgressEvent struct {
	ProjectID   string    `json:"projectId"`
	Step        string    `json:"step"`                  // "waiting", "browsing", "compressing", "uploading", "completed", "failed"
	StepNumber  int       `json:"stepNumber"`            // 1-6
	TotalSteps  int       `json:"totalSteps"`            // Always 6
	Progress    int       `json:"progress"`              // 0-100 overall percentage
	FileCount   int       `json:"fileCount"`             // Current file count (if known)
	TotalSize   int64     `json:"totalSize"`             // Current total size (if known)
	Message     string    `json:"message"`               // Human-readable message
	SnapshotURL string    `json:"snapshotUrl,omitempty"` // URL when completed
	Error       string    `json:"error,omitempty"`       // Error message if failed
	Timestamp   time.Time `json:"timestamp"`
}

// SnapshotProgressTracker tracks progress of snapshot generation
type SnapshotProgressTracker struct {
	mu          sync.RWMutex
	trackers    map[string]*ProjectProgressTracker      // projectId -> tracker
	subscribers map[string][]chan SnapshotProgressEvent // projectId -> list of subscribers
}

// ProjectProgressTracker tracks progress for a single project
type ProjectProgressTracker struct {
	ProjectID    string
	CurrentStep  string
	StepNumber   int
	FileCount    int
	TotalSize    int64
	StartTime    time.Time
	EstimatedEnd time.Time
	LastUpdate   time.Time
	SnapshotURL  string
	Error        string
	IsComplete   bool
	IsFailed     bool
}

// NewSnapshotProgressTracker creates a new progress tracker
func NewSnapshotProgressTracker() *SnapshotProgressTracker {
	return &SnapshotProgressTracker{
		trackers:    make(map[string]*ProjectProgressTracker),
		subscribers: make(map[string][]chan SnapshotProgressEvent),
	}
}

// StartTracking initializes tracking for a project
func (spt *SnapshotProgressTracker) StartTracking(projectID string) {
	spt.mu.Lock()
	defer spt.mu.Unlock()

	tracker := &ProjectProgressTracker{
		ProjectID:   projectID,
		CurrentStep: "waiting",
		StepNumber:  1,
		StartTime:   time.Now(),
		LastUpdate:  time.Now(),
	}

	spt.trackers[projectID] = tracker
	spt.subscribers[projectID] = []chan SnapshotProgressEvent{}
}

// UpdateProgress updates progress for a project
func (spt *SnapshotProgressTracker) UpdateProgress(projectID string, step string, stepNum int, fileCount int, totalSize int64, message string) {
	spt.mu.Lock()
	tracker, exists := spt.trackers[projectID]
	if !exists {
		spt.mu.Unlock()
		return
	}

	tracker.CurrentStep = step
	tracker.StepNumber = stepNum
	tracker.FileCount = fileCount
	tracker.TotalSize = totalSize
	tracker.LastUpdate = time.Now()

	// Calculate estimated time
	if stepNum > 0 {
		elapsed := time.Since(tracker.StartTime)
		avgTimePerStep := elapsed / time.Duration(stepNum)
		remainingSteps := 6 - stepNum
		tracker.EstimatedEnd = time.Now().Add(avgTimePerStep * time.Duration(remainingSteps))
	}

	subscribers := spt.subscribers[projectID]
	spt.mu.Unlock()

	// Create and send event
	// Calculate progress with better granularity
	// Step 1: 10%, Step 2: 20%, Step 3: 50%, Step 4: 75%, Step 5: 95%, Step 6: 100%
	var progressPct int
	switch stepNum {
	case 1:
		progressPct = 10
	case 2:
		progressPct = 20
	case 3:
		progressPct = 50
	case 4:
		progressPct = 75
	case 5:
		progressPct = 95
	case 6:
		progressPct = 100
	default:
		progressPct = 0
	}

	event := SnapshotProgressEvent{
		ProjectID:  projectID,
		Step:       step,
		StepNumber: stepNum,
		TotalSteps: 6,
		Progress:   progressPct,
		FileCount:  fileCount,
		TotalSize:  totalSize,
		Message:    message,
		Timestamp:  time.Now(),
	}

	// Broadcast to all subscribers
	for _, ch := range subscribers {
		select {
		case ch <- event:
		default:
			// Don't block if subscriber is slow
		}
	}
}

// CompleteSnapshot marks snapshot generation as complete
func (spt *SnapshotProgressTracker) CompleteSnapshot(projectID string, snapshotURL string) {
	spt.mu.Lock()
	tracker, exists := spt.trackers[projectID]
	if !exists {
		spt.mu.Unlock()
		return
	}

	tracker.IsComplete = true
	tracker.SnapshotURL = snapshotURL
	tracker.LastUpdate = time.Now()

	subscribers := spt.subscribers[projectID]
	spt.mu.Unlock()

	// Send completion event
	event := SnapshotProgressEvent{
		ProjectID:   projectID,
		Step:        "completed",
		StepNumber:  6,
		TotalSteps:  6,
		Progress:    100,
		SnapshotURL: snapshotURL,
		Message:     "Snapshot generation completed successfully",
		Timestamp:   time.Now(),
	}

	for _, ch := range subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

// FailSnapshot marks snapshot generation as failed
func (spt *SnapshotProgressTracker) FailSnapshot(projectID string, errMsg string) {
	spt.mu.Lock()
	tracker, exists := spt.trackers[projectID]
	if !exists {
		spt.mu.Unlock()
		return
	}

	tracker.IsFailed = true
	tracker.Error = errMsg
	tracker.LastUpdate = time.Now()

	subscribers := spt.subscribers[projectID]
	spt.mu.Unlock()

	// Send failure event
	event := SnapshotProgressEvent{
		ProjectID:  projectID,
		Step:       "failed",
		StepNumber: 0,
		TotalSteps: 6,
		Progress:   0,
		Error:      errMsg,
		Message:    "Snapshot generation failed: " + errMsg,
		Timestamp:  time.Now(),
	}

	for _, ch := range subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

// GetProgress returns current progress for a project
func (spt *SnapshotProgressTracker) GetProgress(projectID string) *SnapshotProgressEvent {
	spt.mu.RLock()
	tracker, exists := spt.trackers[projectID]
	spt.mu.RUnlock()

	if !exists {
		return nil
	}

	event := &SnapshotProgressEvent{
		ProjectID:  projectID,
		Step:       tracker.CurrentStep,
		StepNumber: tracker.StepNumber,
		TotalSteps: 6,
		Progress:   (tracker.StepNumber * 100) / 6,
		FileCount:  tracker.FileCount,
		TotalSize:  tracker.TotalSize,
		Timestamp:  tracker.LastUpdate,
	}

	if tracker.IsComplete {
		event.Step = "completed"
		event.StepNumber = 6
		event.Progress = 100
		event.SnapshotURL = tracker.SnapshotURL
		event.Message = "Snapshot generation completed successfully"
	} else if tracker.IsFailed {
		event.Step = "failed"
		event.Error = tracker.Error
		event.Message = "Snapshot generation failed: " + tracker.Error
	}

	return event
}

// Subscribe returns a channel for progress updates for a project
func (spt *SnapshotProgressTracker) Subscribe(projectID string) chan SnapshotProgressEvent {
	spt.mu.Lock()
	defer spt.mu.Unlock()

	ch := make(chan SnapshotProgressEvent, 10) // Buffer to avoid blocking

	// Ensure tracker exists
	if _, exists := spt.trackers[projectID]; !exists {
		spt.trackers[projectID] = &ProjectProgressTracker{
			ProjectID:  projectID,
			StartTime:  time.Now(),
			LastUpdate: time.Now(),
		}
	}

	spt.subscribers[projectID] = append(spt.subscribers[projectID], ch)
	return ch
}

// Unsubscribe removes a subscriber
func (spt *SnapshotProgressTracker) Unsubscribe(projectID string, ch chan SnapshotProgressEvent) {
	spt.mu.Lock()
	defer spt.mu.Unlock()

	subscribers, exists := spt.subscribers[projectID]
	if !exists {
		return
	}

	// Remove channel from slice
	for i, subscriber := range subscribers {
		if subscriber == ch {
			spt.subscribers[projectID] = append(subscribers[:i], subscribers[i+1:]...)
			close(ch)
			return
		}
	}
}

// CleanupProject removes tracking data for a project
func (spt *SnapshotProgressTracker) CleanupProject(projectID string) {
	spt.mu.Lock()
	defer spt.mu.Unlock()

	delete(spt.trackers, projectID)

	// Close all subscriber channels
	if subscribers, exists := spt.subscribers[projectID]; exists {
		for _, ch := range subscribers {
			close(ch)
		}
		delete(spt.subscribers, projectID)
	}
}
