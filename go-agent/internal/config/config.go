package config

import (
	"os"
	"path/filepath"
	"regexp"

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

	// Supabase configuration
	SupabaseURL            string
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string

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
		DataDir:                dataDir,
		APIHost:                "127.0.0.1",
		APIPort:                29999,
		SyncthingPort:          8384,
		SyncthingBinary:        "syncthing",
		SyncthingAPIKey:        getSyncthingAPIKey(dataDir),
		NebulaEnabled:          true,
		NebulaBinary:           "nebula",
		CloudURL:               getEnv("CLOUD_URL", "http://localhost:5000/api"),
		CloudKey:               getEnv("CLOUD_API_KEY", ""),
		CloudPort:              5000,
		SupabaseURL:            getEnv("SUPABASE_URL", "https://ucnrohdiyepmdrsxkhyq.supabase.co"),
		SupabaseAnonKey:        getEnv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbnJvaGRpeWVwbWRyc3hraHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTEyNjEsImV4cCI6MjA3ODUyNzI2MX0.TpgQqBUVvs1_3yPaCxGsPrS2d27axdE_ISzhY1mhSzQ"),
		SupabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbnJvaGRpeWVwbWRyc3hraHlxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk1MTI2MSwiZXhwIjoyMDc4NTI3MjYxfQ.008ajRq4aGKtUZb4K1DVJ7eDr15Lcsw2sDV0m2UoCaM"),
		LogLevel:               getEnv("LOG_LEVEL", "info"),
	}

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// getSyncthingAPIKey reads the API key from environment or Syncthing's config file
func getSyncthingAPIKey(dataDir string) string {
	// First, try to get from environment variable (passed by Electron)
	if apiKey := os.Getenv("SYNCTHING_API_KEY"); apiKey != "" {
		return apiKey
	}

	// Try to read from Syncthing config file
	configPath := filepath.Join(os.ExpandEnv("$HOME"), ".config", "vidsync", "syncthing", "shared", "config.xml")

	// Also try alternative paths
	alternativePaths := []string{
		filepath.Join(os.ExpandEnv("$HOME"), ".config", "Syncthing", "config.xml"),
		filepath.Join(dataDir, "syncthing", "config.xml"),
	}

	allPaths := append([]string{configPath}, alternativePaths...)

	for _, path := range allPaths {
		if content, err := os.ReadFile(path); err == nil {
			// Extract API key from XML: <apikey>...</apikey>
			re := regexp.MustCompile(`<apikey>([^<]+)<\/apikey>`)
			if matches := re.FindSubmatch(content); len(matches) > 1 {
				return string(matches[1])
			}
		}
	}

	return ""
}
