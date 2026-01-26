@echo off
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║           DEBUG DASHBOARD ISSUES                           ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo [1/4] Checking backend...
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo       ✓ Backend is running
) else (
    echo       ✗ Backend is NOT running
    echo.
    echo       Please start the backend:
    echo       ^> start-backend.bat
    echo.
    pause
    exit /b 1
)

echo.
echo [2/4] Testing dashboard API endpoint...
echo       Attempting to fetch dashboard data...
echo       (This will fail if not logged in - that's OK)
echo.
curl -s http://localhost:3000/api/dashboard/data
echo.

echo.
echo [3/4] Fixes applied:
echo       ✓ User profile loading moved to dashboard-integrations.js
echo       ✓ Added loadUserProfile() method
echo       ✓ Added loadSubscriptionBadge() method
echo       ✓ Removed duplicate code from HTML
echo       ✓ Added console logging for debugging
echo.

echo [4/4] How to debug:
echo ════════════════════════════════════════════════════════════
echo.
echo   STEP 1: Open Dashboard
echo   ─────────────────────────────
echo   Navigate to: http://localhost:5500/dashboard-new.html
echo.
echo   STEP 2: Open Browser Console (F12)
echo   ─────────────────────────────
echo   Look for these console messages:
echo   • "Loading dashboard data..."
echo   • "Dashboard data loaded: {...}"
echo   • "Connected integrations: [...]"
echo   • "Rendering integration sections..."
echo   • "GitHub: connected=..., allowed=..., hasData=..."
echo.
echo   STEP 3: Check for Errors
echo   ─────────────────────────────
echo   Common issues:
echo   • "No auth token found" → Not logged in
echo   • "Failed to fetch" → Backend not running
echo   • "401 Unauthorized" → Token expired, sign in again
echo   • "Integration sections container not found" → HTML issue
echo.
echo   STEP 4: Check Network Tab
echo   ─────────────────────────────
echo   • Look for /api/auth/me request
echo   • Look for /api/subscription/current request
echo   • Look for /api/dashboard/data request
echo   • Check if they return 200 OK
echo   • Check response data
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo Expected Console Output (when working):
echo   Loading dashboard data...
echo   Dashboard data response: {success: true, data: {...}}
echo   Dashboard data loaded: {tier: "...", ...}
echo   Connected integrations: [...]
echo   Allowed integrations: [...]
echo   Rendering integration sections...
echo   GitHub: connected=false, allowed=true, hasData=false
echo   Discord: connected=false, allowed=true, hasData=false
echo   ...
echo   Integration sections rendered successfully
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo If User Profile Still Shows "Loading...":
echo   1. Check browser console for errors
echo   2. Verify /api/auth/me returns user data
echo   3. Check if authToken exists in localStorage
echo   4. Try signing in again
echo.
echo If Integrations Not Showing:
echo   1. Check console logs for integration data
echo   2. Verify /api/dashboard/data returns data
echo   3. Check if integrationSections container exists
echo   4. Look for JavaScript errors
echo.
echo ════════════════════════════════════════════════════════════
echo.
pause
