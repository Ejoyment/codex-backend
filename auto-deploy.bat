@echo off
setlocal enabledelayedexpansion

echo ========================================
echo AUTO-DEPLOY TO GITHUB
echo ========================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not in PATH
    echo Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

REM Check if we're in a git repository
if not exist ".git" (
    echo ERROR: Not a git repository
    echo Run 'git init' first or navigate to your git repository
    pause
    exit /b 1
)

echo [1/6] Checking for changes...
git status --short > temp_status.txt
set /p changes=<temp_status.txt
del temp_status.txt

if "%changes%"=="" (
    echo No changes to deploy
    echo.
    pause
    exit /b 0
)

echo Changes detected:
git status --short
echo.

REM Get commit message from user or use default
set "commit_msg=Auto-deploy: Update files"
set /p "custom_msg=Enter commit message (or press Enter for default): "
if not "%custom_msg%"=="" set "commit_msg=%custom_msg%"

echo.
echo [2/6] Adding all changes to git...
git add .
if %errorlevel% neq 0 (
    echo ERROR: Failed to add files
    pause
    exit /b 1
)
echo ✓ Files added

echo.
echo [3/6] Committing changes...
git commit -m "%commit_msg%"
if %errorlevel% neq 0 (
    echo ERROR: Failed to commit
    pause
    exit /b 1
)
echo ✓ Changes committed

echo.
echo [4/6] Checking remote repository...
git remote -v | findstr origin >nul
if %errorlevel% neq 0 (
    echo ERROR: No remote 'origin' configured
    echo.
    echo To add a remote, run:
    echo git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
    pause
    exit /b 1
)
echo ✓ Remote configured

echo.
echo [5/6] Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo Push failed. Trying 'master' branch...
    git push origin master
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to push to GitHub
        echo.
        echo Common issues:
        echo 1. Wrong branch name (try: git branch)
        echo 2. Authentication failed (setup SSH key or token)
        echo 3. No internet connection
        echo 4. Remote repository doesn't exist
        echo.
        pause
        exit /b 1
    )
)
echo ✓ Pushed to GitHub

echo.
echo [6/6] Deployment status...
echo ✓ Changes pushed successfully!
echo.
echo Next steps:
echo 1. GitHub received your changes
echo 2. Render will auto-deploy in 2-3 minutes
echo 3. Check deployment: https://dashboard.render.com
echo 4. Monitor logs for any errors
echo.

REM Show last commit
echo Last commit:
git log -1 --oneline
echo.

echo ========================================
echo DEPLOYMENT COMPLETE
echo ========================================
echo.
echo Your changes are now on GitHub!
echo Render will automatically deploy them.
echo.
echo To check deployment status:
echo - Visit: https://dashboard.render.com
echo - Or run: curl https://codex-backend-7utu.onrender.com/api/health
echo.

pause
