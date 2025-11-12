package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// Config holds application configuration
type Config struct {
	// Data directory for local storage
	DataDir string

	// API configuration
	APIPort int
	APIHost string

	// Syncthing configuration
	SyncthingBinary string
	SyncthingPort   int
	SyncthingAPIKey string

	// Nebula configuration
	NebulaEnabled bool
	NebulaBinary  string
	NebulaConfig  string

	// Cloud configuration
	CloudURL  string
	CloudKey  string
	CloudPort int

	// Device configuration
	DeviceID string

	// Logging
	LogLevel string
}

// Load loads configuration from environment and defaults
func Load() (*Config, error) {
	// Load .env file if exists
	_ = godotenv.Load()

	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "/tmp"
	}

	dataDir := filepath.Join(homeDir, ".vidsync")
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, err
	}

	cfg := &Config{
		DataDir:         dataDir,
		APIHost:         "127.0.0.1",
		APIPort:         29999,
		SyncthingPort:   8384,
		SyncthingBinary: "syncthing",
		NebulaEnabled:   true,
		NebulaBinary:    "nebula",
		CloudURL:        getEnv("CLOUD_URL", "http://localhost:3000"),
		CloudPort:       3000,
		LogLevel:        getEnv("LOG_LEVEL", "info"),
	}

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
