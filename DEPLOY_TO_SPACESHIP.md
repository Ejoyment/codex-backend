# Deploy CODEX INC to Spaceship Hosting

## Prerequisites
- ✓ Domain registered on Spaceship
- ✓ Hosting plan active
- ✓ FTP/SSH access credentials
- ✓ MongoDB Atlas account (free tier)

---

## Step 1: Prepare Your Code for Production

### 1.1 Update API URLs in Frontend Files

You need to replace all `localhost:3000` references with your production domain.

**Files to update:**
- `js/api.js`
- `js/dashboard-unified.js`
- `js/dashboard-integrations.js`
- `js/integrations-hub.js`
- `js/workspace.js`
- `js/tasks.js`
- `js/source-code.js`
- `js/ai-pair.js`
- `settings.html`
- All test HTML files

**Find and replace:**
```javascript
// OLD (localhost)
const API_URL = 'http://localhost:3000/api';

// NEW (production)
const API_URL = 'https://yourdomain.com/api';
```

### 1.2 Create Production Environment File

Create `.env.production`:
```env
# MongoDB
MONGODB_URI=your_mongodb_atlas_connection_string

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# URLs
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://yourdomain.com

# OAuth - GitHub
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# OAuth - Discord
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# OAuth - Slack
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# OAuth - Notion
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret

# OAuth - Figma
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret

# Stripe
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key

# Groq AI
GROQ_API_KEY=your_groq_api_key

# Email (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

# Server
PORT=3000
NODE_ENV=production
```

---

## Step 2: Setup MongoDB Atlas (Free)

1. Go to https://www.mongodb.com/cloud/atlas
2. Create account / Sign in
3. Create new cluster (FREE M0 tier)
4. Create database user:
   - Username: `codex_admin`
   - Password: (generate strong password)
5. Network Access → Add IP: `0.0.0.0/0` (allow from anywhere)
6. Get connection string:
   - Click "Connect" → "Connect your application"
   - Copy connection string
   - Replace `<password>` with your database password
   - Add to `.env.production` as `MONGODB_URI`

---

## Step 3: Prepare Files for Upload

### 3.1 Create deployment package

Create a script to prepare files:

**File: `prepare-deployment.bat`**
```batch
@echo off
echo Preparing deployment package...

REM Create deployment folder
if exist deployment rmdir /s /q deployment
mkdir deployment

REM Copy backend files
xcopy /E /I /Y routes deployment\routes
xcopy /E /I /Y models deployment\models
xcopy /E /I /Y middleware deployment\middleware
xcopy /E /I /Y config deployment\config
xcopy /E /I /Y utils deployment\utils

REM Copy frontend files
xcopy /E /I /Y js deployment\js
xcopy /E /I /Y css deployment\css
copy *.html deployment\
copy *.css deployment\

REM Copy server files
copy server.js deployment\
copy package.json deployment\
copy .env.production deployment\.env

echo Deployment package ready in 'deployment' folder!
echo.
echo Next steps:
echo 1. Upload 'deployment' folder contents to your Spaceship hosting
echo 2. SSH into server and run: npm install --production
echo 3. Start server with: node server.js or pm2 start server.js
pause
```

Run this script:
```batch
prepare-deployment.bat
```

---

## Step 4: Upload to Spaceship Hosting

### Option A: FTP Upload (Easier)

1. **Get FTP credentials from Spaceship:**
   - Login to Spaceship dashboard
   - Go to Hosting → Your domain → FTP Access
   - Note: Host, Username, Password

2. **Use FileZilla or WinSCP:**
   - Download FileZilla: https://filezilla-project.org/
   - Connect using FTP credentials
   - Upload entire `deployment` folder contents to `/public_html/` or `/www/`

3. **File structure on server:**
   ```
   /public_html/
   ├── index.html
   ├── dashboard.html
   ├── settings.html
   ├── js/
   ├── css/
   ├── routes/
   ├── models/
   ├── server.js
   ├── package.json
   └── .env
   ```

### Option B: SSH Upload (Advanced)

If Spaceship provides SSH access:

```bash
# Connect to server
ssh username@yourdomain.com

# Navigate to web root
cd /public_html

# Upload files (from local machine)
scp -r deployment/* username@yourdomain.com:/public_html/

# Install dependencies
npm install --production

# Start server
node server.js
# OR use PM2 for auto-restart
npm install -g pm2
pm2 start server.js --name codex
pm2 startup
pm2 save
```

---

## Step 5: Configure Node.js on Spaceship

### 5.1 Check if Node.js is available

SSH into your server:
```bash
node --version
npm --version
```

If not installed, contact Spaceship support or use their control panel to enable Node.js.

### 5.2 Install dependencies

```bash
cd /public_html
npm install --production
```

### 5.3 Start the application

**Option 1: Direct start (testing)**
```bash
node server.js
```

**Option 2: PM2 (recommended for production)**
```bash
npm install -g pm2
pm2 start server.js --name codex-backend
pm2 startup
pm2 save
pm2 logs codex-backend
```

---

## Step 6: Configure Reverse Proxy (if needed)

If Spaceship uses Apache or Nginx, you may need to configure a reverse proxy.

### Apache (.htaccess)

Create `.htaccess` in `/public_html/`:
```apache
RewriteEngine On

# API requests go to Node.js backend
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://localhost:3000/api/$1 [P,L]

# All other requests serve static files
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.html [L]
```

### Nginx (if available)

Create config file:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /public_html;
    index index.html;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Step 7: Enable SSL Certificate (HTTPS)

### Option 1: Spaceship SSL (Easiest)

1. Login to Spaceship dashboard
2. Go to your domain → SSL/TLS
3. Enable "Free SSL Certificate" (Let's Encrypt)
4. Wait 5-10 minutes for activation

### Option 2: Manual Let's Encrypt (if SSH available)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-apache

# Get certificate
sudo certbot --apache -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Step 8: Update OAuth Redirect URLs

Now that your site is live, update all OAuth applications:

### GitHub
1. Go to https://github.com/settings/developers
2. Edit your OAuth App
3. Update URLs:
   - Homepage URL: `https://yourdomain.com`
   - Callback URL: `https://yourdomain.com/api/integrations/github/callback`

### Discord
1. Go to https://discord.com/developers/applications
2. Select your app → OAuth2
3. Add redirect: `https://yourdomain.com/api/integrations/discord/callback`

### Slack
1. Go to https://api.slack.com/apps
2. Select your app → OAuth & Permissions
3. Add redirect: `https://yourdomain.com/api/integrations/slack/callback`

### Notion
1. Go to https://www.notion.so/my-integrations
2. Edit integration
3. Update redirect: `https://yourdomain.com/api/integrations/notion/callback`

### Figma
1. Go to https://www.figma.com/developers/apps
2. Edit app
3. Update callback: `https://yourdomain.com/api/integrations/figma/callback`

### Stripe
1. Go to https://dashboard.stripe.com/settings/applications
2. Update redirect URIs:
   - `https://yourdomain.com/payment-success.html`

---

## Step 9: Update Frontend API URLs

Create a script to update all API URLs:

**File: `update-api-urls.bat`**
```batch
@echo off
set DOMAIN=yourdomain.com

echo Updating API URLs to https://%DOMAIN%...

REM Update js/api.js
powershell -Command "(gc js/api.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/api.js"

REM Update all dashboard JS files
powershell -Command "(gc js/dashboard-unified.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/dashboard-unified.js"
powershell -Command "(gc js/dashboard-integrations.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/dashboard-integrations.js"
powershell -Command "(gc js/integrations-hub.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/integrations-hub.js"
powershell -Command "(gc js/workspace.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/workspace.js"
powershell -Command "(gc js/tasks.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/tasks.js"
powershell -Command "(gc js/source-code.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/source-code.js"
powershell -Command "(gc js/ai-pair.js) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII js/ai-pair.js"

REM Update settings.html
powershell -Command "(gc settings.html) -replace 'http://localhost:3000', 'https://%DOMAIN%' | Out-File -encoding ASCII settings.html"

echo Done! All API URLs updated to production domain.
pause
```

---

## Step 10: Test Your Production Site

### 10.1 Basic Tests
1. Visit `https://yourdomain.com`
2. Sign up for new account
3. Verify email works
4. Login to dashboard
5. Check all pages load

### 10.2 Integration Tests
1. Go to Settings
2. Connect GitHub → Should redirect and connect
3. Connect Discord → Should redirect and connect
4. Check dashboard shows your repos/servers

### 10.3 Payment Test
1. Go to Pricing page
2. Try upgrading to Professional
3. Use Stripe test card: `4242 4242 4242 4242`
4. Verify payment success

---

## Troubleshooting

### Issue: "Cannot connect to server"
**Solution:** Check if Node.js server is running
```bash
pm2 status
pm2 logs codex-backend
```

### Issue: "MongoDB connection failed"
**Solution:** Check MongoDB Atlas IP whitelist includes `0.0.0.0/0`

### Issue: "OAuth redirect mismatch"
**Solution:** Verify all OAuth apps have correct production URLs

### Issue: "SSL certificate not working"
**Solution:** Wait 10-15 minutes after enabling, then clear browser cache

### Issue: "API calls return 404"
**Solution:** Check reverse proxy configuration in `.htaccess` or Nginx

---

## Monitoring & Maintenance

### Check server status
```bash
pm2 status
pm2 logs codex-backend --lines 100
```

### Restart server
```bash
pm2 restart codex-backend
```

### Update code
```bash
cd /public_html
git pull  # if using git
npm install --production
pm2 restart codex-backend
```

### View logs
```bash
pm2 logs codex-backend
tail -f /var/log/nginx/error.log  # Nginx errors
```

---

## Production Checklist

- [ ] MongoDB Atlas cluster created and connected
- [ ] All environment variables set in `.env`
- [ ] Files uploaded to Spaceship hosting
- [ ] Node.js dependencies installed
- [ ] Server running (PM2 or direct)
- [ ] SSL certificate enabled (HTTPS)
- [ ] All OAuth redirect URLs updated
- [ ] Frontend API URLs point to production domain
- [ ] Test signup/login works
- [ ] Test GitHub integration
- [ ] Test Discord integration
- [ ] Test payment flow
- [ ] Test email sending
- [ ] Monitor logs for errors

---

## Need Help?

**Spaceship Support:**
- Email: support@spaceship.com
- Live chat in dashboard
- Documentation: https://www.spaceship.com/help

**Common Spaceship Hosting Paths:**
- Web root: `/public_html/` or `/www/` or `/httpdocs/`
- Logs: `/var/log/` or check control panel
- Node.js: Usually available, check control panel

**Contact me if you need help with:**
- SSH access issues
- Node.js not available
- Reverse proxy configuration
- SSL certificate problems
