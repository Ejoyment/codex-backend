@echo off
echo ========================================
echo   Dashboard Integration Update
echo ========================================
echo.
echo This will update your dashboard with integration support.
echo.
echo What will happen:
echo 1. Backup current dashboard.html to dashboard-old.html
echo 2. Replace dashboard.html with new integration-based version
echo 3. Restart backend to load new routes
echo.
pause
echo.
echo [1/3] Backing up current dashboard...
copy dashboard.html dashboard-old.html
echo ✅ Backup created: dashboard-old.html
echo.
echo [2/3] Installing new dashboard...
copy dashboard-new.html dashboard.html
echo ✅ New dashboard installed
echo.
echo [3/3] Please restart your backend:
echo    1. Go to your backend terminal
echo    2. Press Ctrl+C to stop it
echo    3. Run: start-backend.bat
echo.
echo ========================================
echo   Update Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Restart backend (see above)
echo 2. Refresh dashboard: http://localhost:5500/dashboard.html
echo 3. Connect integrations in Settings
echo.
echo If you want to revert:
echo    copy dashboard-old.html dashboard.html
echo.
pause
