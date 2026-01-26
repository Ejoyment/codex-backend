# Deploy CODEX INC Using cPanel (Easiest Method!)

## 🎯 What is cPanel?

cPanel is a web-based control panel that lets you manage your hosting through your browser. No FTP software needed!

---

## Step 1: Access Your cPanel

### Option A: From Spaceship Dashboard
1. Login to https://www.spaceship.com
2. Go to **Hosting** → **codexincenterprise.online**
3. Look for button that says:
   - **"Open cPanel"**
   - **"Control Panel"**
   - **"Manage Hosting"**
4. Click it - cPanel will open in new tab

### Option B: Direct cPanel URL
Try these URLs in your browser:
- `https://codexincenterprise.online:2083`
- `https://cpanel.codexincenterprise.online`
- `https://codexincenterprise.online/cpanel`

Login with:
- Username: (from Spaceship)
- Password: (from Spaceship)

---

## Step 2: Upload Files Using File Manager

### 2.1 Open File Manager
1. In cPanel, find **"File Manager"** icon
2. Click it
3. Navigate to **`public_html`** folder (this is your website root)

### 2.2 Clean Up (if needed)
If there are old files in `public_html`:
1. Select all files
2. Click **"Delete"**
3. Confirm

### 2.3 Upload Your Files

**Method A: Upload Zip File (Fastest)**
1. First, create a zip file on your computer:
   - Run `DEPLOY_NOW.bat` (this creates the `deployment` folder)
   - Right-click the `deployment` folder
   - Choose "Send to" → "Compressed (zipped) folder"
   - Name it `codex-deployment.zip`

2. In cPanel File Manager:
   - Make sure you're in `public_html` folder
   - Click **"Upload"** button (top menu)
   - Click **"Select File"**
   - Choose `codex-deployment.zip`
   - Wait for upload to complete
   - Close upload window

3. Extract the zip:
   - Back in File Manager, find `codex-deployment.zip`
   - Right-click it → **"Extract"**
   - Extract to: `/public_html/`
   - Click **"Extract Files"**
   - Delete the zip file after extraction

**Method B: Upload Files Directly**
1. In File Manager, click **"Upload"**
2. Drag and drop files from your `deployment` folder
3. Wait for all files to upload
4. Close upload window

---

## Step 3: Create .env File in cPanel

### 3.1 Create New File
1. In File Manager (in `public_html` folder)
2. Click **"+ File"** button (top menu)
3. Name it: `.env`
4. Click **"Create New File"**

### 3.2 Edit .env File
1. Find the `.env` file you just created
2. Right-click it → **"Edit"**
3. Copy and paste this content:

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

# Stripe (TEST keys - switch to LIVE for production)
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

4. Click **"Save Changes"** (top right)
5. Close the editor

---

## Step 4: Setup Node.js in cPanel

### 4.1 Find Node.js App Manager
In cPanel, look for:
- **"Setup Node.js App"**
- **"Node.js Selector"**
- **"Application Manager"**
- **"Software"** section

### 4.2 Create Node.js Application
1. Click **"Setup Node.js App"**
2. Click **"Create Application"**
3. Fill in:
   - **Node.js version:** Select latest (18.x or 20.x)
   - **Application mode:** Production
   - **Application root:** `public_html`
   - **Application URL:** Leave as domain or `/`
   - **Application startup file:** `server.js`
   - **Passenger log file:** (leave default)

4. Click **"Create"**

### 4.3 Install Dependencies
1. After creating app, you'll see a command to run
2. Look for **"Run NPM Install"** button or **"Terminal"** icon
3. Click it
4. In terminal, run:
```bash
npm install --production
```
5. Wait for installation to complete (2-3 minutes)

### 4.4 Start Application
1. Back in Node.js App Manager
2. Find your application
3. Click **"Start"** or **"Restart"**
4. Status should show **"Running"**

---

## Step 5: Setup SSL Certificate (HTTPS)

### 5.1 Enable Free SSL
1. In cPanel, find **"SSL/TLS Status"** or **"Let's Encrypt SSL"**
2. Find your domain: `codexincenterprise.online`
3. Click **"Run AutoSSL"** or **"Install"**
4. Wait 5-10 minutes for certificate to activate

### 5.2 Force HTTPS
1. In cPanel, go to **"File Manager"**
2. Navigate to `public_html`
3. Find or create `.htaccess` file
4. Add this at the top:
```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```
5. Save file

---

## Step 6: Update OAuth Callback URLs

Now that your site is live, update OAuth apps:

### GitHub
1. Go to: https://github.com/settings/developers
2. Edit your OAuth App
3. **Add** new callback (keep localhost too):
   - `https://codexincenterprise.online/api/integrations/github/callback`
4. Save

### Discord
1. Go to: https://discord.com/developers/applications
2. Select your app → OAuth2
3. **Add** redirect:
   - `https://codexincenterprise.online/api/integrations/discord/callback`
4. Save

### Repeat for Slack, Notion, Figma
- Slack: `https://codexincenterprise.online/api/integrations/slack/callback`
- Notion: `https://codexincenterprise.online/api/integrations/notion/callback`
- Figma: `https://codexincenterprise.online/api/integrations/figma/callback`

---

## Step 7: Test Your Site!

1. Visit: **https://codexincenterprise.online**
2. You should see your homepage
3. Try signing up for an account
4. Test logging in
5. Go to Settings → Connect GitHub
6. Go to Settings → Connect Discord
7. Check dashboard shows your repos/servers

---

## 🐛 Troubleshooting

### Site shows "Application Error"
1. In cPanel → Node.js App Manager
2. Click **"Restart"**
3. Check **"Error Log"** for details

### "Cannot connect to MongoDB"
- Check `.env` file has correct `MONGODB_URI`
- Make sure MongoDB Atlas allows all IPs (0.0.0.0/0)

### OAuth not working
- Verify callback URLs are added (not replaced)
- Clear browser cache
- Check `.env` has correct Client IDs

### Need to view logs
1. In cPanel → Node.js App Manager
2. Click **"Error Log"** or **"Application Log"**
3. Or use Terminal:
```bash
cd public_html
tail -f logs/error.log
```

---

## 📊 Managing Your App

### Restart Application
1. cPanel → Node.js App Manager
2. Click **"Restart"**

### View Logs
1. cPanel → Node.js App Manager
2. Click **"Error Log"**

### Update Code
1. Upload new files via File Manager
2. Restart application

### Stop Application
1. cPanel → Node.js App Manager
2. Click **"Stop"**

---

## ✅ Quick Checklist

- [ ] Access cPanel
- [ ] Upload files to `public_html`
- [ ] Create `.env` file with credentials
- [ ] Setup Node.js application
- [ ] Run `npm install`
- [ ] Start application
- [ ] Enable SSL certificate
- [ ] Update OAuth callback URLs
- [ ] Test site at https://codexincenterprise.online
- [ ] Test GitHub integration
- [ ] Test Discord integration

---

## 🎉 You're Done!

Your site should now be live at:
**https://codexincenterprise.online**

If you need help with any step, let me know which step you're stuck on!
