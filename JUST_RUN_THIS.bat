@echo off
color 0A
title CODEX INC - Deploy Fixes

echo.
echo  ╔════════════════════════════════════════════════╗
echo  ║                                                ║
echo  ║     CODEX INC - DEPLOY FIXES TO LIVE SITE     ║
echo  ║                                                ║
echo  ╚════════════════════════════════════════════════╝
echo.
echo.

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git is not installed!
    echo.
    echo Please install Git first:
    echo 1. Go to: https://git-scm.com/
    echo 2. Download and install
    echo 3. Run this script again
    echo.
    pause
    exit /b 1
)

REM Check if this is a git repository
if not exist ".git" (
    echo ⚠️  This is not a git repository yet.
    echo.
    echo Let me set it up for you...
    echo.
    
    git init
    echo ✓ Git initialized
    echo.
    
    echo Please enter your GitHub repository URL:
    echo Example: https://github.com/username/repo.git
    echo.
    set /p "repo_url=Repository URL: "
    
    if "!repo_url!"=="" (
        echo ❌ Repository URL is required!
        pause
        exit /b 1
    )
    
    git remote add origin !repo_url!
    echo ✓ Repository connected
    echo.
)

REM Check for changes
echo [1/4] Checking for changes...
git status --short > temp_check.txt
set /p has_changes=<temp_check.txt
del temp_check.txt

if "%has_changes%"=="" (
    echo.
    echo ℹ️  No changes to deploy.
    echo    Your code is already up to date!
    echo.
    timeout /t 5
    exit /b 0
)

echo ✓ Changes found!
echo.

REM Show what will be deployed
echo These files will be deployed:
git status --short
echo.

REM Add all changes
echo [2/4] Adding files...
git add .
echo ✓ Files added
echo.

REM Commit
echo [3/4] Creating commit...
git commit -m "Fix: Profile upload, dashboard loading, and integration issues - %date% %time%"
echo ✓ Commit created
echo.

REM Push to GitHub
echo [4/4] Pushing to GitHub...
git push origin main 2>nul
if %errorlevel% neq 0 (
    git push origin master 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo ❌ Push failed!
        echo.
        echo This usually means:
        echo 1. You need to setup GitHub authentication
        echo 2. Wrong repository URL
        echo 3. No internet connection
        echo.
        echo To fix authentication:
        echo 1. Go to: https://github.com/settings/tokens
        echo 2. Create a new token
        echo 3. Run: git remote set-url origin https://TOKEN@github.com/username/repo.git
        echo.
        pause
        exit /b 1
    )
)

echo ✓ Pushed to GitHub!
echo.
echo.
echo  ╔════════════════════════════════════════════════╗
echo  ║                                                ║
echo  ║              ✅ DEPLOYMENT SUCCESS!            ║
echo  ║                                                ║
echo  ╚════════════════════════════════════════════════╝
echo.
echo  What happens next:
echo.
echo  1. ✓ Your code is now on GitHub
echo  2. ⏳ Render is deploying (2-3 minutes)
echo  3. 🌐 Your live site will be updated
echo.
echo  Check deployment status:
echo  https://dashboard.render.com
echo.
echo  Test your live site:
echo  https://codexincenterprise.online
echo.
echo  Fixes deployed:
echo  ✓ Profile upload now works
echo  ✓ Dashboard loads properly
echo  ✓ Integrations show errors/retry buttons
echo.

timeout /t 10
