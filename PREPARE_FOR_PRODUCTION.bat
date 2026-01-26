@echo off
echo ========================================
echo CODEX INC - Production Preparation
echo Domain: codexincenterprise.online
echo ========================================
echo.
echo This script will:
echo 1. Update all API URLs to production domain
echo 2. Create deployment package
echo 3. Copy production .env file
echo.
pause

echo.
echo Step 1: Updating API URLs...
echo.

REM Update js/api.js
powershell -Command "(gc js/api.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/api.js"
echo - Updated js/api.js

REM Update all dashboard JS files
powershell -Command "(gc js/dashboard-unified.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/dashboard-unified.js"
echo - Updated js/dashboard-unified.js

powershell -Command "(gc js/dashboard-integrations.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/dashboard-integrations.js"
echo - Updated js/dashboard-integrations.js

powershell -Command "(gc js/integrations-hub.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/integrations-hub.js"
echo - Updated js/integrations-hub.js

powershell -Command "(gc js/workspace.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/workspace.js"
echo - Updated js/workspace.js

powershell -Command "(gc js/tasks.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/tasks.js"
echo - Updated js/tasks.js

powershell -Command "(gc js/source-code.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/source-code.js"
echo - Updated js/source-code.js

powershell -Command "(gc js/ai-pair.js) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 js/ai-pair.js"
echo - Updated js/ai-pair.js

REM Update settings.html
powershell -Command "(gc settings.html) -replace 'http://localhost:3000', 'https://codexincenterprise.online' | Out-File -encoding UTF8 settings.html"
echo - Updated settings.html

echo.
echo Step 2: Creating deployment folder...
echo.

if exist deployment rmdir /s /q deployment
mkdir deployment
mkdir deployment\routes
mkdir deployment\models
mkdir deployment\middleware
mkdir deployment\config
mkdir deployment\utils
mkdir deployment\js
mkdir deployment\css
mkdir deployment\uploads
mkdir deployment\uploads\profiles

echo Copying files...
xcopy /E /I /Y routes deployment\routes >nul
xcopy /E /I /Y models deployment\models >nul
xcopy /E /I /Y middleware deployment\middleware >nul
xcopy /E /I /Y config deployment\config >nul
xcopy /E /I /Y utils deployment\utils >nul
xcopy /E /I /Y js deployment\js >nul
xcopy /E /I /Y css deployment\css >nul

copy *.html deployment\ >nul 2>&1
copy *.css deployment\ >nul 2>&1
copy server.js deployment\ >nul
copy package.json deployment\ >nul

echo.
echo Step 3: Copying production .env file...
copy .env.production deployment\.env >nul
echo - Production .env copied

echo.
echo Step 4: Creating .htaccess...
(
echo RewriteEngine On
echo.
echo # Force HTTPS
echo RewriteCond %%{HTTPS} off
echo RewriteRule ^^(.*)$ https://%%{HTTP_HOST}%%{REQUEST_URI} [L,R=301]
echo.
echo # API requests to Node.js backend
echo RewriteCond %%{REQUEST_URI} ^^/api/
echo RewriteRule ^^api/^(.*)$ http://localhost:3000/api/$1 [P,L]
echo.
echo # Serve static files
echo RewriteCond %%{REQUEST_FILENAME} !-f
echo RewriteCond %%{REQUEST_FILENAME} !-d
echo RewriteRule ^^^(.*)$ index.html [L]
) > deployment\.htaccess
echo - .htaccess created

echo.
echo Step 5: Creating deployment instructions...
(
echo ========================================
echo DEPLOYMENT INSTRUCTIONS
echo ========================================
echo.
echo YOUR DEPLOYMENT PACKAGE IS READY!
echo Location: deployment\ folder
echo.
echo NEXT STEPS:
echo.
echo 1. GET FTP CREDENTIALS
echo    - See: GET_SPACESHIP_FTP_CREDENTIALS.md
echo    - Login to Spaceship dashboard
echo    - Find FTP credentials for codexincenterprise.online
echo.
echo 2. DOWNLOAD FILEZILLA
echo    - https://filezilla-project.org/download.php
echo    - Install it
echo.
echo 3. CONNECT TO YOUR SERVER
echo    - Open FileZilla
echo    - Host: ftp.codexincenterprise.online
echo    - Username: ^(your FTP username^)
echo    - Password: ^(your FTP password^)
echo    - Port: 21
echo    - Click "Quickconnect"
echo.
echo 4. UPLOAD FILES
echo    - Navigate to /public_html/ on server
echo    - Upload ALL files from deployment\ folder
echo    - Wait for upload to complete
echo.
echo 5. SSH INTO SERVER
echo    ssh username@codexincenterprise.online
echo    cd /public_html
echo    npm install --production
echo    pm2 start server.js --name codex
echo    pm2 startup
echo    pm2 save
echo.
echo 6. UPDATE OAUTH CALLBACKS
echo    See: UPDATE_OAUTH_URLS.md
echo    - GitHub: Add production callback
echo    - Discord: Add production callback
echo    - Slack: Add production callback
echo    - Notion: Add production callback
echo    - Figma: Add production callback
echo.
echo 7. ENABLE SSL
echo    - Login to Spaceship dashboard
echo    - Enable free SSL certificate
echo    - Wait 10-15 minutes
echo.
echo 8. TEST YOUR SITE
echo    - Visit: https://codexincenterprise.online
echo    - Sign up for account
echo    - Test all features
echo.
echo ========================================
echo NEED HELP?
echo ========================================
echo.
echo - Can't find FTP credentials?
echo   Read: GET_SPACESHIP_FTP_CREDENTIALS.md
echo.
echo - Need OAuth update instructions?
echo   Read: UPDATE_OAUTH_URLS.md
echo.
echo - Having issues?
echo   Read: TROUBLESHOOTING.md
echo.
echo ========================================
) > deployment\DEPLOY_INSTRUCTIONS.txt

echo - Instructions created

echo.
echo ========================================
echo SUCCESS! Everything is ready!
echo ========================================
echo.
echo Your deployment package is in: deployment\
echo.
echo WHAT'S INCLUDED:
echo - All backend code ^(routes, models, etc.^)
echo - All frontend code ^(HTML, JS, CSS^)
echo - Production .env file with your credentials
echo - .htaccess for Apache
echo - server.js and package.json
echo - Deployment instructions
echo.
echo NEXT STEPS:
echo.
echo 1. Read: GET_SPACESHIP_FTP_CREDENTIALS.md
echo    ^(Learn how to get your FTP login^)
echo.
echo 2. Download FileZilla FTP client
echo    https://filezilla-project.org/download.php
echo.
echo 3. Upload deployment\ folder to Spaceship
echo.
echo 4. Read: UPDATE_OAUTH_URLS.md
echo    ^(Update OAuth callback URLs^)
echo.
echo 5. Visit: https://codexincenterprise.online
echo.
echo ========================================
echo.
pause
