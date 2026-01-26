@echo off
echo ========================================
echo CODEX INC - Production Deployment
echo Domain: codexincenterprise.online
echo ========================================
echo.

set DOMAIN=codexincenterprise.online

echo Step 1: Creating backups...
if not exist backups mkdir backups
xcopy /E /I /Y js backups\js >nul 2>&1
copy settings.html backups\settings.html >nul 2>&1
echo Backups created!
echo.

echo Step 2: Updating API URLs to production...
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

echo API URLs updated!
echo.

echo Step 3: Creating deployment package...
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

echo Deployment package created!
echo.

echo Step 4: Creating production .env file...
(
echo # MongoDB Atlas
echo MONGODB_URI=your_mongodb_atlas_connection_string_here
echo.
echo # JWT Secret
echo JWT_SECRET=codex_production_secret_key_change_this_now
echo.
echo # Production URLs
echo FRONTEND_URL=https://codexincenterprise.online
echo BACKEND_URL=https://codexincenterprise.online
echo.
echo # GitHub OAuth
echo GITHUB_CLIENT_ID=your_github_client_id
echo GITHUB_CLIENT_SECRET=your_github_client_secret
echo.
echo # Discord OAuth
echo DISCORD_CLIENT_ID=your_discord_client_id
echo DISCORD_CLIENT_SECRET=your_discord_client_secret
echo.
echo # Slack OAuth
echo SLACK_CLIENT_ID=your_slack_client_id
echo SLACK_CLIENT_SECRET=your_slack_client_secret
echo.
echo # Notion OAuth
echo NOTION_CLIENT_ID=your_notion_client_id
echo NOTION_CLIENT_SECRET=your_notion_client_secret
echo.
echo # Figma OAuth
echo FIGMA_CLIENT_ID=your_figma_client_id
echo FIGMA_CLIENT_SECRET=your_figma_client_secret
echo.
echo # Stripe Production Keys
echo STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
echo STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
echo.
echo # Groq AI
echo GROQ_API_KEY=your_groq_api_key
echo.
echo # Email Configuration
echo SMTP_HOST=smtp.gmail.com
echo SMTP_PORT=587
echo SMTP_USER=your_email@gmail.com
echo SMTP_PASS=your_gmail_app_password
echo.
echo # Server Configuration
echo PORT=3000
echo NODE_ENV=production
) > deployment\.env

echo .env file created!
echo.

echo Step 5: Creating .htaccess for Apache...
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

echo .htaccess created!
echo.

echo Step 6: Creating OAuth callback URLs reference...
(
echo ========================================
echo OAuth Callback URLs for Production
echo Domain: codexincenterprise.online
echo ========================================
echo.
echo Update these URLs in each OAuth provider:
echo.
echo GITHUB:
echo   Homepage: https://codexincenterprise.online
echo   Callback: https://codexincenterprise.online/api/integrations/github/callback
echo   Update at: https://github.com/settings/developers
echo.
echo DISCORD:
echo   Callback: https://codexincenterprise.online/api/integrations/discord/callback
echo   Update at: https://discord.com/developers/applications
echo.
echo SLACK:
echo   Callback: https://codexincenterprise.online/api/integrations/slack/callback
echo   Update at: https://api.slack.com/apps
echo.
echo NOTION:
echo   Callback: https://codexincenterprise.online/api/integrations/notion/callback
echo   Update at: https://www.notion.so/my-integrations
echo.
echo FIGMA:
echo   Callback: https://codexincenterprise.online/api/integrations/figma/callback
echo   Update at: https://www.figma.com/developers/apps
echo.
echo STRIPE:
echo   Success URL: https://codexincenterprise.online/payment-success.html
echo   Webhook: https://codexincenterprise.online/api/subscription/webhook
echo   Update at: https://dashboard.stripe.com
echo.
) > deployment\OAUTH_CALLBACKS.txt

echo OAuth reference created!
echo.

echo Step 7: Creating deployment instructions...
(
echo ========================================
echo DEPLOYMENT INSTRUCTIONS
echo ========================================
echo.
echo BEFORE UPLOADING:
echo.
echo 1. SETUP MONGODB ATLAS ^(FREE^)
echo    - Go to: https://www.mongodb.com/cloud/atlas
echo    - Create free M0 cluster
echo    - Create database user
echo    - Whitelist IP: 0.0.0.0/0
echo    - Get connection string
echo    - Add to deployment\.env as MONGODB_URI
echo.
echo 2. CONFIGURE .ENV FILE
echo    - Open: deployment\.env
echo    - Fill in ALL credentials
echo    - Save the file
echo.
echo 3. UPDATE OAUTH APPS
echo    - See OAUTH_CALLBACKS.txt for all URLs
echo    - Update each OAuth provider
echo    - Copy Client IDs and Secrets to .env
echo.
echo UPLOAD TO SPACESHIP:
echo.
echo 4. CONNECT VIA FTP
echo    - Use FileZilla or WinSCP
echo    - Host: ftp.codexincenterprise.online
echo    - Username: ^(from Spaceship dashboard^)
echo    - Password: ^(from Spaceship dashboard^)
echo.
echo 5. UPLOAD FILES
echo    - Upload ALL files from 'deployment' folder
echo    - Upload to: /public_html/ or /www/
echo    - Make sure .env and .htaccess are uploaded
echo.
echo 6. SSH INTO SERVER
echo    ssh username@codexincenterprise.online
echo    cd /public_html
echo.
echo 7. INSTALL DEPENDENCIES
echo    npm install --production
echo.
echo 8. START SERVER
echo    # Option A: Direct
echo    node server.js
echo.
echo    # Option B: PM2 ^(Recommended^)
echo    npm install -g pm2
echo    pm2 start server.js --name codex
echo    pm2 startup
echo    pm2 save
echo.
echo 9. ENABLE SSL IN SPACESHIP
echo    - Login to Spaceship dashboard
echo    - Go to SSL/TLS section
echo    - Enable free SSL certificate
echo    - Wait 10 minutes
echo.
echo 10. TEST YOUR SITE
echo    - Visit: https://codexincenterprise.online
echo    - Sign up for account
echo    - Test all integrations
echo    - Test payment flow
echo.
echo ========================================
echo TROUBLESHOOTING
echo ========================================
echo.
echo If site doesn't load:
echo   - Check if Node.js is running: pm2 status
echo   - Check logs: pm2 logs codex
echo   - Restart: pm2 restart codex
echo.
echo If OAuth fails:
echo   - Verify callback URLs match exactly
echo   - Check .env has correct Client IDs
echo   - Clear browser cache
echo.
echo If MongoDB fails:
echo   - Check connection string in .env
echo   - Verify IP whitelist: 0.0.0.0/0
echo   - Test connection: node test-mongodb.js
echo.
echo ========================================
) > deployment\DEPLOY_INSTRUCTIONS.txt

echo Instructions created!
echo.

echo ========================================
echo SUCCESS! Deployment package ready.
echo ========================================
echo.
echo Location: deployment\ folder
echo.
echo NEXT STEPS:
echo.
echo 1. Open deployment\.env
echo    - Add your MongoDB Atlas connection string
echo    - Add all OAuth credentials
echo    - Save the file
echo.
echo 2. Read deployment\DEPLOY_INSTRUCTIONS.txt
echo.
echo 3. Upload to Spaceship hosting via FTP
echo.
echo 4. Update OAuth callback URLs
echo    See: deployment\OAUTH_CALLBACKS.txt
echo.
echo 5. Test at: https://codexincenterprise.online
echo.
echo ========================================
echo.
pause
