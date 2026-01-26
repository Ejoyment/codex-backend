@echo off
echo.
echo ========================================
echo Checking GitHub Integration
echo ========================================
echo.
echo Running database check...
echo.
node check-integrations.js
echo.
echo ========================================
echo.
echo If GitHub shows "Connected: true" above but dashboard
echo shows it as not connected, then the issue is in the
echo dashboard API query.
echo.
echo Next steps:
echo 1. Check what "Connected integrations:" shows in browser console
echo 2. The API might be filtering it out incorrectly
echo.
pause
