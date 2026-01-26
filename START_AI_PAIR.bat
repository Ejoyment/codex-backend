@echo off
echo ========================================
echo AI Pair Programming - Quick Start
echo ========================================
echo.

echo Step 1: Checking dependencies...
echo.
call npm list @google/generative-ai @octokit/rest socket.io diff 2>nul
if errorlevel 1 (
    echo Dependencies not found. Installing...
    call npm install
) else (
    echo Dependencies already installed!
)

echo.
echo Step 2: Checking Gemini API Key...
echo.
findstr /C:"GEMINI_API_KEY=" .env | findstr /V /C:"GEMINI_API_KEY=$" >nul
if errorlevel 1 (
    echo.
    echo ⚠️  WARNING: GEMINI_API_KEY not set in .env file!
    echo.
    echo To use AI Pair Programming:
    echo 1. Go to: https://makersuite.google.com/app/apikey
    echo 2. Create an API key
    echo 3. Add it to .env file: GEMINI_API_KEY=your_key_here
    echo 4. Restart the backend
    echo.
    pause
) else (
    echo ✓ Gemini API Key is configured!
)

echo.
echo Step 3: Starting backend server...
echo.
echo Backend will start on http://localhost:3000
echo Frontend should be on http://localhost:5500
echo.
echo AI Pair Programming available at:
echo http://localhost:5500/ai-pair.html
echo.
echo Press Ctrl+C to stop the server
echo.
node server.js
