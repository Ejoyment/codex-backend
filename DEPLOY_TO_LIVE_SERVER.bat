@echo off
echo ========================================
echo   CODEX INC - Deploy to Live Server
echo ========================================
echo.
echo Server: server38.shared.spaceship.host
echo Domain: codexincenterprise.online
echo.
echo ========================================
echo   Step 1: Preparing Deployment Files
echo ========================================
echo.

REM Check if deployment folder exists
if not exist "deployment" (
    echo ERROR: deployment folder not found!
    echo Please run PREPARE_FOR_PRODUCTION.bat first
    pause
    exit /b 1
)

echo Deployment folder found!
echo.

echo ========================================
echo   Step 2: Creating Deployment Package
echo ========================================
echo.

REM Create a timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set timestamp=%datetime:~0,8%-%datetime:~8,6%

echo Creating deployment package...
echo Timestamp: %timestamp%
echo.

REM Copy deployment folder to a backup
if exist "deployment-package" rmdir /s /q "deployment-package"
xcopy "deployment" "deployment-package\" /E /I /Y > nul

echo Package created: deployment-package\
echo.

echo ========================================
echo   Step 3: Deployment Instructions
echo ========================================
echo.
echo Your deployment package is ready!
echo.
echo OPTION 1: Deploy via cPanel (EASIEST)
echo ----------------------------------------
echo 1. Access cPanel:
echo    - URL: https://server38.shared.spaceship.host:2083
echo    - Username: admin
echo    - Password: B(yp}J^&DR2zc
echo.
echo 2. Open File Manager, go to public_html
echo.
echo 3. Upload all files from 'deployment-package' folder
echo.
echo 4. Setup Node.js App in cPanel
echo    - Application root: public_html
echo    - Startup file: server.js
echo    - Node version: 18.x or 20.x
echo.
echo 5. Run NPM Install and Start
echo.
echo.
echo OPTION 2: Deploy via FTP (FileZilla)
echo ----------------------------------------
echo 1. Download FileZilla from:
echo    https://filezilla-project.org/download.php?type=client
echo.
echo 2. Connect to FTP:
echo    - Host: server38.shared.spaceship.host
echo    - Username: admin
echo    - Password: B(yp}J^&DR2zc
echo    - Port: 21 (FTP) or 22 (SFTP)
echo.
echo 3. Upload 'deployment-package' contents to public_html
echo.
echo 4. Continue with cPanel steps 4-5 above
echo.
echo.
echo ========================================
echo   Important Files to Check
echo ========================================
echo.
echo Make sure these files are uploaded:
echo - server.js (main application)
echo - package.json (dependencies)
echo - .env (environment variables)
echo - All HTML files (index.html, dashboard.html, etc.)
echo - All JS files in /js folder
echo - All route files in /routes folder
echo - All model files in /models folder
echo.
echo ========================================
echo   After Deployment
echo ========================================
echo.
echo 1. Enable SSL in cPanel (Let's Encrypt)
echo.
echo 2. Update OAuth callback URLs:
echo    - GitHub: https://codexincenterprise.online/api/integrations/github/callback
echo    - Discord: https://codexincenterprise.online/api/integrations/discord/callback
echo    - Slack: https://codexincenterprise.online/api/integrations/slack/callback
echo    - Notion: https://codexincenterprise.online/api/integrations/notion/callback
echo    - Figma: https://codexincenterprise.online/api/integrations/figma/callback
echo    - Google: https://codexincenterprise.online/auth/google/callback
echo.
echo 3. Test your site: https://codexincenterprise.online
echo.
echo ========================================
echo   Need Help?
echo ========================================
echo.
echo Read DEPLOY_LIVE_NOW.md for detailed instructions
echo.
echo.
pause
