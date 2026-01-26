@echo off
echo ========================================
echo CODEX INC - Production URL Updater
echo ========================================
echo.

REM Prompt for domain
set /p DOMAIN="Enter your domain (e.g., codexinc.com): "

if "%DOMAIN%"=="" (
    echo Error: Domain cannot be empty!
    pause
    exit /b 1
)

echo.
echo Updating all API URLs to: https://%DOMAIN%
echo.

REM Backup original files
echo Creating backups...
if not exist backups mkdir backups
copy js\api.js backups\api.js.bak >nul 2>&1
copy js\dashboard-unified.js backups\dashboard-unified.js.bak >nul 2>&1
copy js\dashboard-integrations.js backups\dashboard-integrations.js.bak >nul 2>&1
copy js\integrations-hub.js backups\integrations-hub.js.bak >nul 2>&1
copy js\workspace.js backups\workspace.js.bak >nul 2>&1
copy js\tasks.js backups\tasks.js.bak >nul 2>&1
copy js\source-code.js backups\source-code.js.bak >nul 2>&1
copy js\ai-pair.js backups\ai-pair.js.bak >nul 2>&1
copy settings.html backups\settings.html.bak >nul 2>&1

echo Backups created in 'backups' folder
echo.

REM Update API URLs
echo Updating js/api.js...
powershell -Command "(gc js/api.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/api.js"

echo Updating js/dashboard-unified.js...
powershell -Command "(gc js/dashboard-unified.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/dashboard-unified.js"

echo Updating js/dashboard-integrations.js...
powershell -Command "(gc js/dashboard-integrations.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/dashboard-integrations.js"

echo Updating js/integrations-hub.js...
powershell -Command "(gc js/integrations-hub.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/integrations-hub.js"

echo Updating js/workspace.js...
powershell -Command "(gc js/workspace.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/workspace.js"

echo Updating js/tasks.js...
powershell -Command "(gc js/tasks.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/tasks.js"

echo Updating js/source-code.js...
powershell -Command "(gc js/source-code.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/source-code.js"

echo Updating js/ai-pair.js...
powershell -Command "(gc js/ai-pair.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 js/ai-pair.js"

echo Updating settings.html...
powershell -Command "(gc settings.html) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding UTF8 settings.html"

echo.
echo ========================================
echo SUCCESS! All files updated.
echo ========================================
echo.
echo Next steps:
echo 1. Review the changes in your files
echo 2. Run 'prepare-deployment.bat' to package files
echo 3. Upload to your Spaceship hosting
echo.
echo To restore original files, copy from 'backups' folder
echo.
pause
