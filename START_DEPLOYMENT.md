# 🚀 START HERE - Deploy to codexincenterprise.online

## Step-by-Step Deployment Guide

---

## ✅ Pre-Deployment Checklist

Before you start, make sure you have:

- [x] Domain: codexincenterprise.online (registered on Spaceship)
- [ ] Spaceship hosting active
- [ ] FTP/SSH credentials from Spaceship
- [ ] MongoDB Atlas account (free - will create)
- [ ] GitHub account (for OAuth)
- [ ] Discord Developer account (for OAuth)
- [ ] Stripe account (for payments)
- [ ] Groq API key (for AI features)

---

## 🎬 Step 1: Run Deployment Script

Open Command Prompt in your project folder and run:

```batch
DEPLOY_NOW.bat
```

**What this does:**
- ✓ Updates all API URLs from localhost to codexincenterprise.online
- ✓ Creates deployment package in `deployment\` folder
- ✓ Generates `.env` template with your domain
- ✓ Creates `.htaccess` for Apache
- ✓ Creates OAuth callback reference
- ✓ Backs up original files

**Time:** 1 minute

---

## 🗄️ Step 2: Setup MongoDB Atlas (FREE)

1. **Create Account**
   - Go to: https://www.mongodb.com/cloud/atlas
   - Sign up with Google or email

2. **Create Cluster**
   - Click "Build a Database"
   - Choose **FREE** M0 tier
   - Select region closest to you
   - Click "Create Cluster"

3. **Create Database User**
   - Go to "Database Access"
   - Click "Add New Database User"
   - Username: `codex_admin`
   - Password: Click "Autogenerate Secure Password" (save this!)
   - User Privileges: "Read and write to any database"
   - Click "Add User"

4. **Whitelist IP**
   - Go to "Network Access"
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere"
   - IP: `0.0.0.0/0`
   - Click "Confirm"

5. **Get Connection String**
   - Go to "Database" → Click "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database password
   - Save this for Step 3

**Example:**
```
mongodb+srv://codex_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/codex?retryWrites=true&w=majority
```

**Time:** 5 minutes

---

## 🔐 Step 3: Configure Environment Variables

1. Open `deployment\.env` in Notepad
2. Fill in these values:

### MongoDB (from Step 2)
```env
MONGODB_URI=mongodb+srv://codex_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/codex
```

### JWT Secret (generate random string)
```env
JWT_SECRET=codex_prod_2026_secure_key_change_this
```

### GitHub OAuth
1. Go to: https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - Application name: `CODEX INC`
   - Homepage URL: `https://codexincenterprise.online`
   - Callback URL: `https://codexincenterprise.online/api/integrations/github/callback`
4. Click "Register application"
5. Copy Client ID and Client Secret to `.env`:
```env
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=abc123...
```

### Discord OAuth
1. Go to: https://discord.com/developers/applications
2. Click "New Application"
3. Name: `CODEX INC`
4. Go to OAuth2 section
5. Add redirect: `https://codexincenterprise.online/api/integrations/discord/callback`
6. Copy Client ID and Client Secret to `.env`:
```env
DISCORD_CLIENT_ID=123456789...
DISCORD_CLIENT_SECRET=xyz789...
```

### Groq AI (for AI Pair Programming)
1. Go to: https://console.groq.com
2. Sign up / Login
3. Go to API Keys
4. Create new key
5. Copy to `.env`:
```env
GROQ_API_KEY=gsk_...
```

### Stripe (for Payments)
1. Go to: https://dashboard.stripe.com
2. Get your **LIVE** keys (not test keys)
3. Copy to `.env`:
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Email (Gmail)
1. Use your Gmail account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Copy to `.env`:
```env
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
```

**Save the `.env` file!**

**Time:** 15 minutes

---

## 📤 Step 4: Upload to Spaceship

### Option A: FTP Upload (Recommended)

1. **Download FileZilla**
   - https://filezilla-project.org/download.php?type=client

2. **Get FTP Credentials**
   - Login to Spaceship dashboard
   - Go to your domain → Hosting
   - Find FTP credentials

3. **Connect**
   - Host: `ftp.codexincenterprise.online`
   - Username: (from Spaceship)
   - Password: (from Spaceship)
   - Port: 21

4. **Upload Files**
   - Navigate to `/public_html/` on server
   - Upload ALL files from `deployment\` folder
   - Make sure `.env` and `.htaccess` are uploaded
   - Wait for upload to complete

**Time:** 10 minutes (depending on internet speed)

---

## 🖥️ Step 5: SSH & Install Dependencies

1. **Connect via SSH**
```bash
ssh username@codexincenterprise.online
```
(Use credentials from Spaceship dashboard)

2. **Navigate to web root**
```bash
cd /public_html
```

3. **Install Node.js dependencies**
```bash
npm install --production
```

4. **Start server with PM2**
```bash
# Install PM2 globally
npm install -g pm2

# Start server
pm2 start server.js --name codex

# Make it auto-start on reboot
pm2 startup
pm2 save

# Check status
pm2 status
```

**Time:** 5 minutes

---

## 🔒 Step 6: Enable SSL Certificate

1. Login to Spaceship dashboard
2. Go to your domain → SSL/TLS
3. Click "Enable Free SSL Certificate"
4. Wait 10-15 minutes for activation
5. Your site will be accessible via HTTPS

**Time:** 15 minutes (mostly waiting)

---

## 🔗 Step 7: Update OAuth Callbacks

Now that your site is live, update OAuth apps:

### GitHub
- Go to: https://github.com/settings/developers
- Edit your OAuth App
- Verify callback: `https://codexincenterprise.online/api/integrations/github/callback`

### Discord
- Go to: https://discord.com/developers/applications
- Select your app → OAuth2
- Verify redirect: `https://codexincenterprise.online/api/integrations/discord/callback`

### Slack (if using)
- Go to: https://api.slack.com/apps
- Update redirect: `https://codexincenterprise.online/api/integrations/slack/callback`

### Notion (if using)
- Go to: https://www.notion.so/my-integrations
- Update redirect: `https://codexincenterprise.online/api/integrations/notion/callback`

### Figma (if using)
- Go to: https://www.figma.com/developers/apps
- Update callback: `https://codexincenterprise.online/api/integrations/figma/callback`

**Time:** 5 minutes

---

## ✅ Step 8: Test Your Production Site

1. **Visit your site**
   - https://codexincenterprise.online

2. **Sign up for account**
   - Use real email address
   - Check email for verification

3. **Test integrations**
   - Go to Settings
   - Connect GitHub → Should work!
   - Connect Discord → Should work!

4. **Test dashboard**
   - Should show your GitHub repos
   - Should show your Discord servers

5. **Test payment**
   - Go to Pricing
   - Try upgrading (use Stripe test card: `4242 4242 4242 4242`)

**Time:** 10 minutes

---

## 🎉 You're Live!

Your site is now running at: **https://codexincenterprise.online**

---

## 🐛 Troubleshooting

### Site not loading?
```bash
# SSH into server
ssh username@codexincenterprise.online

# Check if server is running
pm2 status

# View logs
pm2 logs codex

# Restart if needed
pm2 restart codex
```

### MongoDB connection error?
- Check `.env` has correct connection string
- Verify MongoDB Atlas IP whitelist: `0.0.0.0/0`

### OAuth not working?
- Verify callback URLs match exactly
- Check Client IDs in `.env`
- Clear browser cache

### Need help?
- Check `DEPLOY_TO_SPACESHIP.md` for detailed guide
- See `TROUBLESHOOTING.md` for common issues
- Contact Spaceship support

---

## 📊 Monitor Your Site

```bash
# Check server status
pm2 status

# View logs
pm2 logs codex --lines 100

# Restart server
pm2 restart codex

# Stop server
pm2 stop codex
```

---

## 🔄 Update Your Site

When you make changes:

1. Update files locally
2. Run `DEPLOY_NOW.bat` again
3. Upload changed files via FTP
4. SSH and restart: `pm2 restart codex`

---

## 📞 Support

**Spaceship Hosting:**
- Dashboard: https://www.spaceship.com/dashboard
- Support: support@spaceship.com

**MongoDB Atlas:**
- Support: https://www.mongodb.com/cloud/atlas/support

**Stripe:**
- Dashboard: https://dashboard.stripe.com
- Support: https://support.stripe.com

---

## 🎯 Total Time Estimate

- Step 1: 1 minute
- Step 2: 5 minutes
- Step 3: 15 minutes
- Step 4: 10 minutes
- Step 5: 5 minutes
- Step 6: 15 minutes (waiting)
- Step 7: 5 minutes
- Step 8: 10 minutes

**Total: ~1 hour** (including waiting for SSL)

---

## 🚀 Ready to Deploy?

Run this command to start:

```batch
DEPLOY_NOW.bat
```

Good luck! 🎉
