@echo off
echo ========================================
echo CODEX INC Backend Starter
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [1/3] Installing dependencies...
    echo This may take a minute...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies
        echo Make sure Node.js is installed: https://nodejs.org/
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
) else (
    echo [1/3] Dependencies already installed
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo [2/3] ERROR: .env file not found!
    echo.
    echo Please create a .env file with your configuration.
    echo You can copy .env.example and fill in your values.
    echo.
    pause
    exit /b 1
) else (
    echo [2/3] .env file found
    echo.
)

REM Start the server
echo [3/3] Starting backend server...
echo.
echo ========================================
echo Server is starting...
echo Press Ctrl+C to stop the server
echo ========================================
echo.

node server.js

pause
