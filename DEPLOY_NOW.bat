@echo off
REM One-click deployment script

title CODEX INC - Auto Deploy

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║   CODEX INC - AUTO DEPLOY TO GITHUB  ║
echo  ╚═══════════════════════════════════════╝
echo.

REM Check for changes
git status --short > temp_check.txt
set /p has_changes=<temp_check.txt
del temp_check.txt

if "%has_changes%"=="" (
    echo No changes to deploy.
    echo.
    timeout /t 3 >nul
    exit /b 0
)

echo Changes detected! Deploying...
echo.

REM Add all changes
git add .

REM Commit with timestamp
set "msg=Auto-deploy: %date% %time%"
git commit -m "%msg%"

REM Push to GitHub
git push origin main 2>nul
if %errorlevel% neq 0 (
    git push origin master 2>nul
)

if %errorlevel% equ 0 (
    echo.
    echo ✓ Successfully deployed to GitHub!
    echo ✓ Render will auto-deploy in 2-3 minutes
    echo.
    echo Check status: https://dashboard.render.com
    echo.
) else (
    echo.
    echo ✗ Deployment failed!
    echo Check your GitHub authentication.
    echo.
)

timeout /t 5
