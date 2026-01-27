@echo off
echo.
echo What is your GitHub repository URL?
echo Example: https://github.com/username/codex-backend.git
echo.
set /p repo_url=Enter URL: 

if "%repo_url%"=="" (
    echo ERROR: URL is required!
    pause
    exit /b 1
)

echo.
echo Setting up GitHub remote...
git remote remove origin 2>nul
git remote add origin %repo_url%

echo.
echo Deploying your changes...
git add .
git commit -m "Fix: Profile upload, dashboard loading, and integration issues"
git push -u origin main

if %errorlevel% neq 0 (
    git push -u origin master
)

if %errorlevel% equ 0 (
    echo.
    echo ✅ SUCCESS! Your changes are deployed!
    echo.
    echo Render will update your site in 2-3 minutes.
    echo Check: https://dashboard.render.com
    echo.
) else (
    echo.
    echo ❌ FAILED! You need to setup authentication.
    echo.
    echo Quick fix:
    echo 1. Go to: https://github.com/settings/tokens
    echo 2. Create a new token with "repo" access
    echo 3. Copy the token
    echo 4. Run this command:
    echo.
    echo git remote set-url origin https://TOKEN@github.com/USERNAME/REPO.git
    echo.
    echo Replace TOKEN, USERNAME, and REPO with your values
    echo Then run this script again!
    echo.
)

pause
