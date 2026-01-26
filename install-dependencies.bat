@echo off
echo ========================================
echo Installing CODEX INC Dependencies
echo ========================================
echo.
echo This will install all required packages...
echo Please wait, this may take 1-2 minutes...
echo.

call npm install

if errorlevel 1 (
    echo.
    echo ========================================
    echo ERROR: Installation failed!
    echo ========================================
    echo.
    echo Possible solutions:
    echo 1. Make sure Node.js is installed
    echo 2. Check your internet connection
    echo 3. Try running as Administrator
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Dependencies installed
echo ========================================
echo.
echo You can now run: start-backend.bat
echo.
pause
