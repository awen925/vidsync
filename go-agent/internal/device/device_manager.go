package device

import (
	"database/sql"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

// DeviceInfo represents device identity
type DeviceInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
	Token    string `json:"token"`
}

// DeviceManager manages local device identity
type DeviceManager struct {
	dataDir string
	dbPath  string
	db      *sql.DB
	device  *DeviceInfo
}

// NewDeviceManager creates a new device manager
func NewDeviceManager(dataDir string) *DeviceManager {
	return &DeviceManager{
		dataDir: dataDir,
		dbPath:  filepath.Join(dataDir, "device.db"),
	}
}

// Init initializes the device manager
func (dm *DeviceManager) Init() error {
	// Open or create SQLite database
	db, err := sql.Open("sqlite3", dm.dbPath)
	if err != nil {
		return err
	}
	dm.db = db

	// Create tables if not exists
	if err := dm.createTables(); err != nil {
		return err
	}

	// Load or create device info
	device, err := dm.loadDevice()
	if err != nil {
		// Create new device
		device = &DeviceInfo{
			ID:       uuid.New().String(),
			Name:     "vidsync-" + uuid.New().String()[:8],
			Platform: os.Getenv("GOOS"),
			Token:    uuid.New().String(),
		}
		if err := dm.saveDevice(device); err != nil {
			return err
		}
	}

	dm.device = device
	return nil
}

// GetDeviceID returns the device ID
func (dm *DeviceManager) GetDeviceID() string {
	if dm.device == nil {
		return ""
	}
	return dm.device.ID
}

// GetDeviceInfo returns device info
func (dm *DeviceManager) GetDeviceInfo() *DeviceInfo {
	return dm.device
}

func (dm *DeviceManager) createTables() error {
	query := `
	CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		name TEXT,
		platform TEXT,
		token TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := dm.db.Exec(query)
	return err
}

func (dm *DeviceManager) loadDevice() (*DeviceInfo, error) {
	query := "SELECT id, name, platform, token FROM devices LIMIT 1"
	row := dm.db.QueryRow(query)

	var device DeviceInfo
	err := row.Scan(&device.ID, &device.Name, &device.Platform, &device.Token)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrNoDevice
		}
		return nil, err
	}

	return &device, nil
}

func (dm *DeviceManager) saveDevice(device *DeviceInfo) error {
	query := `
	INSERT OR REPLACE INTO devices (id, name, platform, token)
	VALUES (?, ?, ?, ?)
	`
	_, err := dm.db.Exec(query, device.ID, device.Name, device.Platform, device.Token)
	return err
}

// Close closes the database connection
func (dm *DeviceManager) Close() error {
	if dm.db != nil {
		return dm.db.Close()
	}
	return nil
}
