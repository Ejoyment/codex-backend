# 🚀 Deploy CODEX INC to Production - LIVE NOW!

## Your FTP Credentials
- **Server:** server38.shared.spaceship.host
- **Username:** admin
- **Password:** B(yp}J&DR2zc
- **Port:** 21 (FTP) or 22 (SFTP - more secure)

---

## 🎯 Quick Deploy Steps

### Option 1: Using cPanel (EASIEST - RECOMMENDED)

#### Step 1: Access cPanel
Try these URLs:
1. `https://server38.shared.spaceship.host:2083`
2. Or: `https://codexincenterprise.online:2083`
3. Or: `https://cpanel.codexincenterprise.online`

Login with:
- Username: `admin`
- Password: `B(yp}J&DR2zc`

#### Step 2: Upload Files
1. In cPanel, click **"File Manager"**
2. Navigate to `public_html` folder
3. Delete any existing files (if needed)
4. Click **"Upload"** button
5. Upload ALL files from your `deployment` folder
   - Or create a zip of `deployment` folder, upload it, then extract

#### Step 3: Create .env File
1. In File Manager, click **"+ File"**
2. Name it: `.env`
3. Right-click → **"Edit"**
4. Paste the production environment variables (see below)
5. Save

#### Step 4: Setup Node.js
1. In cPanel, find **"Setup Node.js App"**
2. Click **"Create Application"**
3. Settings:
   - Node.js version: 18.x or 20.x
   - Application mode: Production
   - Application root: `public_html`
   - Application startup file: `server.js`
4. Click **"Create"**
5. Click **"Run NPM Install"** button
6. Wait for installation (2-3 minutes)
7. Click **"Start"** or **"Restart"**

#### Step 5: Enable SSL
1. In cPanel, find **"SSL/TLS Status"**
2. Click **"Run AutoSSL"** for your domain
3. Wait 5-10 minutes

#### Step 6: Test
Visit: **https://codexincenterprise.online**

---

### Option 2: Using FTP Client (FileZilla)

#### Step 1: Download FileZilla
- Download from: https://filezilla-project.org/download.php?type=client

#### Step 2: Connect to Server
1. Open FileZilla
2. File → Site Manager → New Site
3. Settings:
   - Protocol: FTP (or SFTP for more security)
   - Host: `server38.shared.spaceship.host`
   - Port: 21 (FTP) or 22 (SFTP)
   - Encryption: Use explicit FTP over TLS if available
   - Logon Type: Normal
   - User: `admin`
   - Password: `B(yp}J&DR2zc`
4. Click **"Connect"**

#### Step 3: Upload Files
1. Left side: Navigate to your `deployment` folder
2. Right side: Navigate to `public_html` folder
3. Select all files in `deployment` folder
4. Right-click → Upload
5. Wait for upload to complete (5-10 minutes)

#### Step 4: Create .env File
1. In FileZilla, right-click in `public_html` folder
2. Create new file: `.env`
3. Right-click `.env` → View/Edit
4. Paste production environment (see below)
5. Save and upload

#### Step 5: Continue with cPanel Steps 4-6 above

---

## 📝 Production .env File Content

```env
# Production Environment
PORT=3000
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb+srv://dejoymene_db_user:nS3P4TnVyK0C9zKE@cluster0.h8xxyo6.mongodb.net/codex-inc?retryWrites=true&w=majority

# JWT
JWT_SECRET=a79f769f81087a64d4fc01937237b480319b0e8c6d9f3dec4fc45b41307b85f3

# URLs
FRONTEND_URL=https://codexincenterprise.online
BACKEND_URL=https://codexincenterprise.online

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=dejoymene@gmail.com
EMAIL_PASSWORD=tpxnwhbisneunljn
EMAIL_FROM=CODEX INC <noreply@codexinc.com>

# GitHub
GITHUB_CLIENT_ID=Ov23li9tWag2JTumqvMJ
GITHUB_CLIENT_SECRET=530a29efec8ec0ae545b11661e1cc1a7d6cf8dba

# Discord
DISCORD_CLIENT_ID=1464983482848645384
DISCORD_CLIENT_SECRET=wgA8R71cduAiVf6eUX3BabI1Vxgdghr7

# Slack
SLACK_CLIENT_ID=10362491062339.10372605732196
SLACK_CLIENT_SECRET=b4c6f3c30616987d84bb1d9b3353cb5a

# Notion
NOTION_CLIENT_ID=2f3d872b-594c-8072-900f-0037cf4c956c
NOTION_CLIENT_SECRET=secret_9zovzAHIpdv3mWPnIENT69CyEYefHhxTh3etHwpc0uw

# Figma
FIGMA_CLIENT_ID=opGonODwSLAxr1yRUA7zzs
FIGMA_CLIENT_SECRET=eH8l7H3hBMLaE2gkxYz2XZWXT4KZQl

# Stripe (TEST keys)
STRIPE_SECRET_KEY=sk_test_51StGFZFau6CKO3Vah4aXtZLJrEUQfkHpsw4VpasI53QeOSMJVcOzgiWRFZywRiEUhjlDzzFeu6UsSTuTmgmFdxnk00uVn2wrnL
STRIPE_PUBLISHABLE_KEY=pk_test_51StGFZFau6CKO3VaXxn7lRJ4vq9NOrHbLyLw8m4Sbuvbx8cuzCSNtWTEnuv4F0ro0fsj74mbEGS9fQ9rMIxi9pvc00XmaFNBdh
STRIPE_WEBHOOK_SECRET=whsec_dfe7c3a75073a57adb5db0e64c8dfb26f2738de7f85d87907d0fb45c9b584ed1
STRIPE_PROFESSIONAL_PRICE_ID=price_1StGQSFau6CKO3VawRcrLBv1

# Groq AI
GROQ_API_KEY=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
GROQ_MODEL=llama-3.1-8b-instant
AI_PROVIDER=groq
AI_MAX_TOKENS=8192
AI_TEMPERATURE=0.7

# Google OAuth
GOOGLE_CLIENT_ID=892410864660-uv935akqnuu83nerva9b65o9pa4vjccc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=https://codexincenterprise.online/auth/google/callback

# OTP
OTP_EXPIRY_MINUTES=10
```

---

## 🔧 After Deployment: Update OAuth Callbacks

### GitHub
1. Go to: https://github.com/settings/developers
2. Edit your OAuth App
3. **Add** callback: `https://codexincenterprise.online/api/integrations/github/callback`

### Discord
1. Go to: https://discord.com/developers/applications
2. Select your app → OAuth2
3. **Add** redirect: `https://codexincenterprise.online/api/integrations/discord/callback`

### Slack
1. Go to: https://api.slack.com/apps
2. Select your app → OAuth & Permissions
3. **Add** redirect: `https://codexincenterprise.online/api/integrations/slack/callback`

### Notion
1. Go to: https://www.notion.so/my-integrations
2. Select your integration → Distribution
3. **Add** redirect: `https://codexincenterprise.online/api/integrations/notion/callback`

### Figma
1. Go to: https://www.figma.com/developers/apps
2. Select your app → Settings
3. **Add** callback: `https://codexincenterprise.online/api/integrations/figma/callback`

### Google OAuth
1. Go to: https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client
3. **Add** authorized redirect URI: `https://codexincenterprise.online/auth/google/callback`

---

## ✅ Deployment Checklist

- [ ] Access cPanel or connect via FTP
- [ ] Upload all files from `deployment` folder to `public_html`
- [ ] Create `.env` file with production credentials
- [ ] Setup Node.js application in cPanel
- [ ] Run `npm install --production`
- [ ] Start the application
- [ ] Enable SSL certificate (Let's Encrypt)
- [ ] Update GitHub OAuth callback
- [ ] Update Discord OAuth callback
- [ ] Update Slack OAuth callback
- [ ] Update Notion OAuth callback
- [ ] Update Figma OAuth callback
- [ ] Update Google OAuth callback
- [ ] Test site: https://codexincenterprise.online
- [ ] Test user signup
- [ ] Test user login
- [ ] Test GitHub integration
- [ ] Test Discord integration
- [ ] Test AI Pair Programming

---

## 🐛 Troubleshooting

### Can't access cPanel
- Try: `https://server38.shared.spaceship.host:2083`
- Or: `https://codexincenterprise.online:2083`
- Or: `https://cpanel.codexincenterprise.online`
- Contact Spaceship support if still can't access

### FTP connection fails
- Server: `server38.shared.spaceship.host`
- Try port 21 (FTP) or port 22 (SFTP)
- Make sure username is exactly: `admin`
- Check if firewall is blocking connection

### Site shows error after deployment
1. In cPanel → Node.js App Manager → Click "Restart"
2. Check Error Log for details
3. Verify `.env` file exists and has correct values
4. Make sure MongoDB Atlas allows all IPs (0.0.0.0/0)

### OAuth integrations not working
- Verify you **added** (not replaced) the production callback URLs
- Keep localhost callbacks for local development
- Clear browser cache and try again

---

## 🎉 Success!

Once deployed, your site will be live at:
**https://codexincenterprise.online**

Users can:
- Sign up and login
- Connect GitHub, Discord, Slack, Notion, Figma
- Use AI Pair Programming
- Upgrade to Professional plan
- Collaborate with teams

---

## 📞 Need Help?

If you get stuck on any step, let me know:
- Which step you're on
- What error message you see
- Screenshot if possible

I'll help you troubleshoot!
