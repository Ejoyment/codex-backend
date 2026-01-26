@echo off
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║         DIAGNOSE DASHBOARD LOADING ISSUE                   ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo The integration sections are stuck on "Loading your integrations..."
echo.
echo Let's find out why:
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo   STEP 1: Run Diagnostic Tool
echo   ─────────────────────────────
echo   Open: http://localhost:5500/check-dashboard-console.html
echo.
echo   This will show you:
echo   • Is auth token present?
echo   • Is API responding?
echo   • Is data structure correct?
echo   • What's the exact error?
echo.
echo   STEP 2: Check Dashboard Console
echo   ─────────────────────────────
echo   1. Open: http://localhost:5500/dashboard-new.html
echo   2. Press F12 (open console)
echo   3. Look for red errors
echo   4. Look for these messages:
echo      - "Starting parallel data loading..."
echo      - "All data loaded in Xms"
echo      - "Dashboard data exists, calling renderDashboard()"
echo.
echo   STEP 3: Check Network Tab
echo   ─────────────────────────────
echo   1. F12 → Network tab
echo   2. Look for /api/dashboard/data request
echo   3. Check status (should be 200)
echo   4. Click on it to see response
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo Common Issues:
echo.
echo   1. API Not Responding
echo      → Restart backend: start-backend.bat
echo.
echo   2. Auth Token Expired
echo      → Sign in again: http://localhost:5500/sign_in.html
echo.
echo   3. MongoDB Not Connected
echo      → Check backend console for MongoDB errors
echo      → Verify .env file has correct MONGODB_URI
echo.
echo   4. JavaScript Error
echo      → Check console for red error messages
echo      → Look at error stack trace
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo Safety Feature Added:
echo   After 10 seconds, if still loading, dashboard will show
echo   an error message with a refresh button automatically.
echo.
echo ════════════════════════════════════════════════════════════
echo.
pause
