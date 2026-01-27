@echo off
color 0A
title Fix GitHub Remote and Deploy

echo.
echo ╔════════════════════════════════════════════════╗
echo ║   FIX GITHUB REMOTE AND DEPLOY YOUR CHANGES   ║
echo ╚════════════════════════════════════════════════╝
echo.

REM Check current remote
echo Checking current GitHub remote...
git remote -v > temp_remote.txt
set /p current_remote=<temp_remote.txt
del temp_remote.txt

if "%current_remote%"=="" (
    echo No remote configured. Let's add it now.
    echo.
    echo Please enter your GitHub repository URL.
    echo.
    echo Example: https://github.com/username/codex-backend.git
    echo.
    set /p "repo_url=Enter your GitHub repository URL: "
    
    if "!repo_url!"=="" (
        echo ERROR: Repository URL is required!
        pause
        exit /b 1
    )
    
    git remote add origin !repo_url!
    echo ✓ Remote added successfully!
    echo.
) else (
    echo Current remote:
    git remote -v
    echo.
    echo Do you want to change it? (y/n)
    set /p "change_remote=Choice: "
    
    if /i "!change_remote!"=="y" (
        echo.
        set /p "new_url=Enter new GitHub repository URL: "
        git remote set-url origin !new_url!
        echo ✓ Remote updated!
        echo.
    )
)

echo.
echo ════════════════════════════════════════════════
echo Now deploying your changes...
echo ════════════════════════════════════════════════
echo.

REM Check for changes
git status --short > temp_status.txt
set /p has_changes=<temp_status.txt
del temp_status.txt

if "%has_changes%"=="" (
    echo No changes to deploy.
    pause
    exit /b 0
)

echo Changes found:
git status --short
echo.

REM Add all changes
echo [1/3] Adding files...
git add .
echo ✓ Done
echo.

REM Commit
echo [2/3] Committing...
git commit -m "Fix: Profile upload, dashboard loading, and integration issues"
echo ✓ Done
echo.

REM Push
echo [3/3] Pushing to GitHub...
git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo Push to 'main' failed. Trying 'master'...
    git push -u origin master
    if %errorlevel% neq 0 (
        echo.
        echo ════════════════════════════════════════════════
        echo AUTHENTICATION REQUIRED
        echo ════════════════════════════════════════════════
        echo.
        echo You need to setup GitHub authentication.
        echo.
        echo EASIEST METHOD - Personal Access Token:
        echo.
        echo 1. Go to: https://github.com/settings/tokens
        echo 2. Click "Generate new token (classic)"
        echo 3. Give it a name: "codex-deploy"
        echo 4. Check the "repo" checkbox
        echo 5. Click "Generate token" at bottom
        echo 6. Copy the token (starts with ghp_...)
        echo.
        echo Then run this command:
        echo git remote set-url origin https://TOKEN@github.com/USERNAME/REPO.git
        echo.
        echo Replace:
        echo   TOKEN with your token
        echo   USERNAME with your GitHub username
        echo   REPO with your repository name
        echo.
        echo Then run this script again!
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ╔════════════════════════════════════════════════╗
echo ║            ✅ DEPLOYMENT SUCCESS!              ║
echo ╚════════════════════════════════════════════════╝
echo.
echo Your changes are now on GitHub!
echo Render will auto-deploy in 2-3 minutes.
echo.
echo Check deployment: https://dashboard.render.com
echo Test your site: https://codexincenterprise.online
echo.

pause
