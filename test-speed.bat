@echo off
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║              DASHBOARD SPEED TEST                          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo [1/2] Checking backend...
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo       ✓ Backend is running
) else (
    echo       ✗ Backend is NOT running
    echo.
    echo       Start backend first:
    echo       ^> start-backend.bat
    echo.
    pause
    exit /b 1
)

echo.
echo [2/2] Speed optimizations applied:
echo       ✓ Parallel API loading (Promise.all)
echo       ✓ 3-5 second timeouts added
echo       ✓ Non-blocking subscription badge
echo       ✓ Fallback data on errors
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo   STEP 1: Test API Speed
echo   ─────────────────────────────
echo   Open: http://localhost:5500/test-api-speed.html
echo.
echo   This will show you the speed of each API endpoint.
echo   All should be ^< 500ms for good performance.
echo.
echo   STEP 2: Open Dashboard
echo   ─────────────────────────────
echo   Open: http://localhost:5500/dashboard-new.html
echo.
echo   Should load in ^< 1 second now!
echo.
echo   STEP 3: Check Console (F12)
echo   ─────────────────────────────
echo   Look for:
echo   • "Starting parallel data loading..."
echo   • "All data loaded, rendering dashboard..."
echo   • No timeout errors
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo Expected Load Times:
echo   Health Check:    ^< 50ms
echo   User Profile:    ^< 200ms
echo   Subscription:    ^< 200ms
echo   Dashboard Data:  ^< 500ms
echo   ─────────────────────────────
echo   TOTAL:           ^< 1 second
echo.
echo If Still Slow:
echo   1. Check backend console for slow queries
echo   2. Check MongoDB connection
echo   3. Look at Network tab (F12) for slow requests
echo   4. Increase timeout values if needed
echo.
echo ════════════════════════════════════════════════════════════
echo.
pause
