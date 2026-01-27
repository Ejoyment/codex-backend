@echo off
setlocal enabledelayedexpansion

echo ========================================
echo DEPLOY WITH VERSION TAG
echo ========================================
echo.

REM Get version tag from user
set /p "version=Enter version tag (e.g., v1.0.0): "
if "%version%"=="" (
    echo ERROR: Version tag is required
    pause
    exit /b 1
)

REM Get commit message
set /p "message=Enter commit message: "
if "%message%"=="" set "message=Release %version%"

echo.
echo [1/5] Adding changes...
git add .
echo ✓ Files added

echo.
echo [2/5] Committing...
git commit -m "%message%"
echo ✓ Committed

echo.
echo [3/5] Creating tag...
git tag -a %version% -m "%message%"
echo ✓ Tag created: %version%

echo.
echo [4/5] Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    git push origin master
)
echo ✓ Code pushed

echo.
echo [5/5] Pushing tags...
git push origin --tags
echo ✓ Tags pushed

echo.
echo ========================================
echo DEPLOYMENT COMPLETE
echo ========================================
echo.
echo Version: %version%
echo Message: %message%
echo.
echo Check deployment at:
echo https://dashboard.render.com
echo.

pause
