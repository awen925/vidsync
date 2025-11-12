package sync

import (
	"database/sql"
	"path/filepath"
	"sync"

	_ "github.com/mattn/go-sqlite3"
	"github.com/vidsync/agent/internal/util"
)

// Event represents a sync event
type Event struct {
	ProjectID string `json:"projectId"`
	Type      string `json:"type"` // fileUpdate, scanStart, scanComplete, paused, error, conflict
	Path      string `json:"path,omitempty"`
	Message   string `json:"message,omitempty"`
	Timestamp string `json:"timestamp"`
}

// SyncManager manages file synchronization
type SyncManager struct {
	dataDir  string
	dbPath   string
	db       *sql.DB
	logger   *util.Logger
	mu       sync.RWMutex
	running  bool
	eventCh  chan Event
	handlers []func(Event)
}

// NewSyncManager creates a new sync manager
func NewSyncManager(dataDir string, logger *util.Logger) *SyncManager {
	return &SyncManager{
		dataDir: dataDir,
		dbPath:  filepath.Join(dataDir, "sync.db"),
		logger:  logger,
		eventCh: make(chan Event, 100),
	}
}

// Start starts the sync manager
func (sm *SyncManager) Start() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if sm.running {
		return nil
	}

	// Initialize database
	db, err := sql.Open("sqlite3", sm.dbPath)
	if err != nil {
		return err
	}
	sm.db = db

	if err := sm.createTables(); err != nil {
		return err
	}

	sm.running = true
	sm.logger.Info("Sync manager started")

	// Start event processor
	go sm.processEvents()

	return nil
}

// Stop stops the sync manager
func (sm *SyncManager) Stop() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sm.running = false
	close(sm.eventCh)

	if sm.db != nil {
		return sm.db.Close()
	}
	return nil
}

// OnEvent registers an event handler
func (sm *SyncManager) OnEvent(handler func(Event)) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.handlers = append(sm.handlers, handler)
}

// EmitEvent emits a sync event
func (sm *SyncManager) EmitEvent(evt Event) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if sm.running {
		select {
		case sm.eventCh <- evt:
		default:
			sm.logger.Warn("Event channel full, dropping event")
		}
	}
}

func (sm *SyncManager) processEvents() {
	for evt := range sm.eventCh {
		sm.mu.RLock()
		handlers := make([]func(Event), len(sm.handlers))
		copy(handlers, sm.handlers)
		sm.mu.RUnlock()

		for _, handler := range handlers {
			handler(evt)
		}
	}
}

func (sm *SyncManager) createTables() error {
	query := `
	CREATE TABLE IF NOT EXISTS projects (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		path TEXT NOT NULL,
		auto_sync BOOLEAN DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sync_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_id TEXT NOT NULL,
		type TEXT NOT NULL,
		path TEXT,
		message TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(project_id) REFERENCES projects(id)
	);

	CREATE INDEX IF NOT EXISTS idx_sync_events_project ON sync_events(project_id);
	`

	_, err := sm.db.Exec(query)
	return err
}

// CreateProject creates a new sync project
func (sm *SyncManager) CreateProject(id, name, path string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	query := `
	INSERT INTO projects (id, name, path)
	VALUES (?, ?, ?)
	`

	_, err := sm.db.Exec(query, id, name, path)
	if err != nil {
		return err
	}

	sm.logger.Info("Created project: %s at %s", name, path)
	return nil
}

// ListProjects lists all sync projects
func (sm *SyncManager) ListProjects() ([]map[string]interface{}, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	query := "SELECT id, name, path, auto_sync FROM projects"
	rows, err := sm.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []map[string]interface{}
	for rows.Next() {
		var id, name, path string
		var autoSync bool
		if err := rows.Scan(&id, &name, &path, &autoSync); err != nil {
			return nil, err
		}
		projects = append(projects, map[string]interface{}{
			"id":       id,
			"name":     name,
			"path":     path,
			"autoSync": autoSync,
		})
	}

	return projects, rows.Err()
}

// DeleteProject deletes a sync project
func (sm *SyncManager) DeleteProject(id string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	query := "DELETE FROM projects WHERE id = ?"
	_, err := sm.db.Exec(query, id)
	return err
}
