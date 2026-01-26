@echo off
echo ========================================
echo CODEX INC - Deployment Package Creator
echo ========================================
echo.

REM Clean previous deployment
if exist deployment (
    echo Removing old deployment folder...
    rmdir /s /q deployment
)

echo Creating deployment folder structure...
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

echo.
echo Copying backend files...
xcopy /E /I /Y routes deployment\routes >nul
xcopy /E /I /Y models deployment\models >nul
xcopy /E /I /Y middleware deployment\middleware >nul
xcopy /E /I /Y config deployment\config >nul
xcopy /E /I /Y utils deployment\utils >nul

echo Copying frontend files...
xcopy /E /I /Y js deployment\js >nul
xcopy /E /I /Y css deployment\css >nul

echo Copying HTML files...
copy *.html deployment\ >nul 2>&1
copy *.css deployment\ >nul 2>&1

echo Copying server files...
copy server.js deployment\ >nul
copy package.json deployment\ >nul

REM Create production .env template
echo Creating .env template...
(
echo # MongoDB
echo MONGODB_URI=your_mongodb_atlas_connection_string
echo.
echo # JWT
echo JWT_SECRET=change_this_to_a_random_secret_key
echo.
echo # URLs - CHANGE THESE TO YOUR DOMAIN
echo FRONTEND_URL=https://yourdomain.com
echo BACKEND_URL=https://yourdomain.com
echo.
echo # OAuth - GitHub
echo GITHUB_CLIENT_ID=your_github_client_id
echo GITHUB_CLIENT_SECRET=your_github_client_secret
echo.
echo # OAuth - Discord
echo DISCORD_CLIENT_ID=your_discord_client_id
echo DISCORD_CLIENT_SECRET=your_discord_client_secret
echo.
echo # OAuth - Slack
echo SLACK_CLIENT_ID=your_slack_client_id
echo SLACK_CLIENT_SECRET=your_slack_client_secret
echo.
echo # OAuth - Notion
echo NOTION_CLIENT_ID=your_notion_client_id
echo NOTION_CLIENT_SECRET=your_notion_client_secret
echo.
echo # OAuth - Figma
echo FIGMA_CLIENT_ID=your_figma_client_id
echo FIGMA_CLIENT_SECRET=your_figma_client_secret
echo.
echo # Stripe
echo STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
echo STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
echo.
echo # Groq AI
echo GROQ_API_KEY=your_groq_api_key
echo.
echo # Email
echo SMTP_HOST=smtp.gmail.com
echo SMTP_PORT=587
echo SMTP_USER=your_email@gmail.com
echo SMTP_PASS=your_gmail_app_password
echo.
echo # Server
echo PORT=3000
echo NODE_ENV=production
) > deployment\.env.template

REM Create .htaccess for Apache
echo Creating .htaccess...
(
echo RewriteEngine On
echo.
echo # Force HTTPS
echo RewriteCond %%{HTTPS} off
echo RewriteRule ^^(.*)$ https://%%{HTTP_HOST}%%{REQUEST_URI} [L,R=301]
echo.
echo # API requests go to Node.js backend
echo RewriteCond %%{REQUEST_URI} ^^/api/
echo RewriteRule ^^api/^(.*)$ http://localhost:3000/api/$1 [P,L]
echo.
echo # All other requests serve static files
echo RewriteCond %%{REQUEST_FILENAME} !-f
echo RewriteCond %%{REQUEST_FILENAME} !-d
echo RewriteRule ^^^(.*)$ index.html [L]
) > deployment\.htaccess

REM Create deployment instructions
echo Creating deployment instructions...
(
echo ========================================
echo CODEX INC - Deployment Instructions
echo ========================================
echo.
echo 1. SETUP MONGODB ATLAS
echo    - Go to https://www.mongodb.com/cloud/atlas
echo    - Create free cluster
echo    - Get connection string
echo    - Add to .env file
echo.
echo 2. CONFIGURE ENVIRONMENT
echo    - Rename .env.template to .env
echo    - Fill in all values with your credentials
echo    - Update FRONTEND_URL and BACKEND_URL to your domain
echo.
echo 3. UPLOAD FILES TO SPACESHIP
echo    - Use FTP/SFTP client ^(FileZilla^)
echo    - Upload all files to /public_html/ or /www/
echo    - Make sure .env is uploaded ^(not .env.template^)
echo.
echo 4. INSTALL DEPENDENCIES
echo    SSH into your server:
echo    cd /public_html
echo    npm install --production
echo.
echo 5. START SERVER
echo    Option A - Direct:
echo    node server.js
echo.
echo    Option B - PM2 ^(recommended^):
echo    npm install -g pm2
echo    pm2 start server.js --name codex
echo    pm2 startup
echo    pm2 save
echo.
echo 6. ENABLE SSL
echo    - Login to Spaceship dashboard
echo    - Enable free SSL certificate
echo    - Wait 5-10 minutes
echo.
echo 7. UPDATE OAUTH APPS
echo    Update redirect URLs in:
echo    - GitHub: https://github.com/settings/developers
echo    - Discord: https://discord.com/developers/applications
echo    - Slack: https://api.slack.com/apps
echo    - Notion: https://www.notion.so/my-integrations
echo    - Figma: https://www.figma.com/developers/apps
echo.
echo    Change all callbacks to:
echo    https://yourdomain.com/api/integrations/[platform]/callback
echo.
echo 8. TEST YOUR SITE
echo    - Visit https://yourdomain.com
echo    - Sign up for account
echo    - Test all integrations
echo    - Test payment flow
echo.
echo ========================================
echo For detailed instructions, see:
echo DEPLOY_TO_SPACESHIP.md
echo ========================================
) > deployment\DEPLOYMENT_INSTRUCTIONS.txt

REM Create package.json if it doesn't exist
if not exist deployment\package.json (
    echo Creating package.json...
    (
        echo {
        echo   "name": "codex-inc",
        echo   "version": "1.0.0",
        echo   "description": "CODEX INC - Developer Collaboration Platform",
        echo   "main": "server.js",
        echo   "scripts": {
        echo     "start": "node server.js",
        echo     "dev": "nodemon server.js"
        echo   },
        echo   "dependencies": {
        echo     "express": "^4.18.2",
        echo     "mongoose": "^7.0.0",
        echo     "bcryptjs": "^2.4.3",
        echo     "jsonwebtoken": "^9.0.0",
        echo     "dotenv": "^16.0.3",
        echo     "cors": "^2.8.5",
        echo     "axios": "^1.4.0",
        echo     "multer": "^1.4.5-lts.1",
        echo     "nodemailer": "^6.9.1",
        echo     "passport": "^0.6.0",
        echo     "passport-github2": "^0.1.12",
        echo     "stripe": "^12.0.0"
        echo   }
        echo }
    ) > deployment\package.json
)

echo.
echo ========================================
echo SUCCESS! Deployment package created.
echo ========================================
echo.
echo Location: deployment\ folder
echo.
echo Files included:
echo - All backend code ^(routes, models, etc.^)
echo - All frontend code ^(HTML, JS, CSS^)
echo - server.js and package.json
echo - .env.template ^(rename to .env and configure^)
echo - .htaccess ^(for Apache reverse proxy^)
echo - DEPLOYMENT_INSTRUCTIONS.txt
echo.
echo Next steps:
echo 1. Open deployment\.env.template
echo 2. Fill in your credentials
echo 3. Rename to .env
echo 4. Upload deployment folder to Spaceship
echo.
echo See DEPLOY_TO_SPACESHIP.md for detailed guide
echo.
pause
