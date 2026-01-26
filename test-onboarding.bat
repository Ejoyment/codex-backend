@echo off
echo ========================================
echo Testing Onboarding Flow
echo ========================================
echo.

REM Check if backend is running
echo [1/3] Checking backend...
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Backend is NOT running
    echo Please run: start-backend.bat
    echo.
    pause
    exit /b 1
) else (
    echo ✅ Backend is running
)
echo.

REM Check if user email is provided
if "%1"=="" (
    echo [2/3] No email provided
    echo Usage: test-onboarding.bat your-email@example.com
    echo.
    pause
    exit /b 1
)

echo [2/3] Resetting onboarding for: %1
node reset-onboarding.js %1
echo.

echo [3/3] Next Steps:
echo ========================================
echo 1. Clear your browser cache (Ctrl+Shift+Delete)
echo 2. Or use Incognito/Private window
echo 3. Go to: http://localhost:5500/sign_in.html
echo 4. Sign in with: %1
echo 5. You should see the onboarding flow!
echo ========================================
echo.
pause
