.PHONY: build clean test help

BINARY_NAME := vidsync-agent
BINARY_UNIX := $(BINARY_NAME)
BINARY_WIN := $(BINARY_NAME).exe

help:
	@echo "Vidsync Go Agent - Build Targets"
	@echo "=================================="
	@echo "make build      - Build the agent binary"
	@echo "make clean      - Remove built binaries"
	@echo "make test       - Run tests"
	@echo "make dev        - Build in development mode with verbose output"
	@echo "make run        - Build and run the agent"
	@echo "make help       - Show this help message"

build:
	@echo "Building $(BINARY_UNIX)..."
	@go build -o $(BINARY_UNIX) ./cmd/agent
	@echo "✓ Build complete"
	@ls -lh $(BINARY_UNIX)

clean:
	@echo "Cleaning up..."
	@rm -f $(BINARY_UNIX) $(BINARY_WIN)
	@echo "✓ Cleaned"

test:
	@echo "Running tests..."
	@go test -v ./...

dev:
	@echo "Building in development mode..."
	@go build -v -o $(BINARY_UNIX) ./cmd/agent
	@echo "✓ Development build complete"
	@ls -lh $(BINARY_UNIX)

run: build
	@echo "Running agent..."
	@./$(BINARY_UNIX)

install-deps:
	@echo "Installing Go dependencies..."
	@go mod download
	@go mod tidy
	@echo "✓ Dependencies installed"
