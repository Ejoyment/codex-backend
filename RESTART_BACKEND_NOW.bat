@echo off
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║              RESTART BACKEND - INTEGRATION FIX             ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Fixed the issue:
echo   - Integration model uses "provider" field
echo   - Dashboard API was looking for "platform" field
echo   - Also fixed: isActive vs connected, providerUsername vs username
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo IMPORTANT: You MUST restart the backend for this fix to work!
echo.
echo Steps:
echo   1. Close the backend terminal (Ctrl+C)
echo   2. Run: start-backend.bat
echo   3. Refresh dashboard in browser
echo.
echo ════════════════════════════════════════════════════════════
echo.
pause
