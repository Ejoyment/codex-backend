@echo off
echo ========================================
echo SETUP AUTO-DEPLOY
echo ========================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed
    echo.
    echo Please install Git:
    echo 1. Download from https://git-scm.com/
    echo 2. Run installer
    echo 3. Restart this script
    echo.
    pause
    exit /b 1
)
echo ✓ Git is installed

echo.
echo [1/5] Checking git repository...
if not exist ".git" (
    echo Initializing git repository...
    git init
    echo ✓ Git repository initialized
) else (
    echo ✓ Git repository exists
)

echo.
echo [2/5] Checking remote repository...
git remote -v | findstr origin >nul
if %errorlevel% neq 0 (
    echo.
    echo No remote repository configured.
    echo.
    set /p "repo_url=Enter your GitHub repository URL: "
    if "!repo_url!"=="" (
        echo ERROR: Repository URL is required
        pause
        exit /b 1
    )
    
    git remote add origin !repo_url!
    echo ✓ Remote added: !repo_url!
) else (
    echo ✓ Remote repository configured
    git remote -v
)

echo.
echo [3/5] Checking GitHub authentication...
echo Testing connection to GitHub...
git ls-remote origin >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ⚠ Cannot connect to GitHub
    echo.
    echo You need to setup authentication:
    echo.
    echo Option 1: SSH Key (Recommended)
    echo   1. Generate SSH key: ssh-keygen -t ed25519 -C "your_email@example.com"
    echo   2. Add to GitHub: https://github.com/settings/keys
    echo   3. Test: ssh -T git@github.com
    echo.
    echo Option 2: Personal Access Token
    echo   1. Create token: https://github.com/settings/tokens
    echo   2. Use HTTPS URL with token
    echo   3. Git will prompt for credentials
    echo.
    pause
) else (
    echo ✓ GitHub authentication working
)

echo.
echo [4/5] Checking current branch...
for /f "tokens=*" %%i in ('git branch --show-current') do set current_branch=%%i
if "%current_branch%"=="" (
    echo Creating main branch...
    git checkout -b main
    echo ✓ Main branch created
) else (
    echo ✓ Current branch: %current_branch%
)

echo.
echo [5/5] Creating .gitignore...
if not exist ".gitignore" (
    echo Creating .gitignore file...
    (
        echo node_modules/
        echo .env
        echo .env.local
        echo .env.production
        echo uploads/
        echo *.log
        echo .DS_Store
        echo Thumbs.db
        echo temp_*.txt
    ) > .gitignore
    echo ✓ .gitignore created
) else (
    echo ✓ .gitignore exists
)

echo.
echo ========================================
echo SETUP COMPLETE
echo ========================================
echo.
echo Auto-deploy is ready to use!
echo.
echo Available commands:
echo   auto-deploy.bat          - Deploy with custom message
echo   quick-deploy.bat         - Quick deploy with timestamp
echo   watch-and-deploy.bat     - Watch for changes and auto-deploy
echo   deploy-with-tag.bat      - Deploy with version tag
echo.
echo To deploy now, run:
echo   auto-deploy.bat
echo.

pause
