package nebula

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/vidsync/agent/internal/util"
)

// NebulaManager manages Nebula VPN process
type NebulaManager struct {
	dataDir string
	logger  *util.Logger
	process *exec.Cmd
	running bool
}

// NewNebulaManager creates a new Nebula manager
func NewNebulaManager(dataDir string, logger *util.Logger) *NebulaManager {
	return &NebulaManager{
		dataDir: dataDir,
		logger:  logger,
	}
}

// CheckElevationNeeded checks if TUN device creation requires elevation
func (nm *NebulaManager) CheckElevationNeeded() bool {
	// On Linux and macOS, creating TUN device typically requires elevated privileges
	return runtime.GOOS == "linux" || runtime.GOOS == "darwin"
}

// Start starts the Nebula process
func (nm *NebulaManager) Start() error {
	if nm.running {
		return nil
	}

	configPath := filepath.Join(nm.dataDir, "nebula.yml")

	// Check if config exists
	if _, err := os.Stat(configPath); err != nil {
		nm.logger.Warn("Nebula config not found at %s - skipping nebula start", configPath)
		return nil
	}

	// Determine binary path
	binaryName := "nebula"
	if runtime.GOOS == "windows" {
		binaryName = "nebula.exe"
	}

	// Try to find nebula binary
	binaryPath := filepath.Join(nm.dataDir, "..", "bin", "nebula", binaryName)

	// If not found, try in PATH
	if _, err := os.Stat(binaryPath); err != nil {
		binaryPath = "nebula"
	}

	nm.logger.Info("Starting Nebula with config: %s", configPath)

	cmd := exec.Command(binaryPath, "-config", configPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		nm.logger.Error("Failed to start Nebula: %v", err)
		return err
	}

	nm.process = cmd
	nm.running = true

	// Wait for process in background
	go func() {
		if err := cmd.Wait(); err != nil {
			nm.logger.Error("Nebula process exited: %v", err)
		}
		nm.running = false
	}()

	nm.logger.Info("Nebula started successfully")
	return nil
}

// Stop stops the Nebula process
func (nm *NebulaManager) Stop() error {
	if !nm.running || nm.process == nil {
		return nil
	}

	if err := nm.process.Process.Kill(); err != nil {
		nm.logger.Error("Failed to kill Nebula process: %v", err)
		return err
	}

	nm.running = false
	nm.logger.Info("Nebula stopped")
	return nil
}

// IsRunning returns whether Nebula is running
func (nm *NebulaManager) IsRunning() bool {
	return nm.running
}
