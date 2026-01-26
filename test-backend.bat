@echo off
echo ========================================
echo Testing CODEX INC Backend
echo ========================================
echo.
echo Starting server for 5 seconds...
echo.

start /B node server.js > server-log.txt 2>&1

timeout /t 5 /nobreak > nul

echo.
echo Checking server log...
echo.
type server-log.txt
echo.
echo ========================================
echo.
echo If you see "Server running on port 3000", it works!
echo.
echo To start the server properly, run: start-backend.bat
echo.
pause

taskkill /F /IM node.exe > nul 2>&1
