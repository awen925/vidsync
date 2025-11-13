@echo off
REM Vidsync Device Cleanup Script for Windows
REM 
REM This script clears all Vidsync configuration from the current device,
REM allowing you to test the app as if it's running on a fresh device.
REM
REM Usage:
REM   cleanup-device.bat
REM
REM WARNING: This will delete:
REM   - %APPDATA%\vidsync\ (Electron user data, Syncthing config, Nebula config)
REM   - All running Syncthing and Nebula processes
REM
REM It will NOT delete:
REM   - System-wide Syncthing if installed
REM   - Application source code
REM   - Cloud data or remote devices

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo Vidsync Device Cleanup
echo ==========================================
echo.
echo WARNING: This will delete all local Vidsync configuration
echo Press Ctrl+C to cancel, or press any key to continue...
pause >nul

echo.
echo Stopping all Vidsync processes...

REM Kill Syncthing instances
taskkill /F /IM syncthing.exe >nul 2>&1 || echo.
timeout /t 1 /nobreak >nul

REM Kill Nebula instances
taskkill /F /FI "WINDOWTITLE eq nebula*" >nul 2>&1 || echo.
timeout /t 1 /nobreak >nul

echo ✓ Processes stopped
echo.

REM Backup config dirs before deletion
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (
  set datestr=%%c%%a%%b
)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (
  set timestr=%%a%%b
)
set BACKUP_DIR=%USERPROFILE%\.vidsync-backup-%datestr%-%timestr%

echo Backing up configuration to: %BACKUP_DIR%
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

if exist "%APPDATA%\vidsync" (
  xcopy "%APPDATA%\vidsync" "%BACKUP_DIR%\config-vidsync" /E /I /Q >nul 2>&1 || echo.
  echo ✓ Backed up %APPDATA%\vidsync
)

echo.
echo Removing configuration directories...

if exist "%APPDATA%\vidsync" (
  rmdir /S /Q "%APPDATA%\vidsync" >nul 2>&1 || echo Could not delete %APPDATA%\vidsync
  echo ✓ Removed %APPDATA%\vidsync
)

echo.
echo ==========================================
echo ✓ Cleanup complete!
echo ==========================================
echo.
echo Configuration backup saved at: %BACKUP_DIR%
echo.
echo Next steps:
echo   1. Start the app fresh: npm run dev
echo   2. Create a new project
echo   3. Set up network connection when prompted
echo.
pause
