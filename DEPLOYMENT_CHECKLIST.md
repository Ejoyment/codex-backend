# 🚀 CODEX INC Deployment Checklist

## Server Information
- **Server:** server38.shared.spaceship.host
- **Domain:** codexincenterprise.online
- **Username:** admin
- **Password:** B(yp}J&DR2zc

---

## Pre-Deployment

- [ ] Run `PREPARE_FOR_PRODUCTION.bat` to create deployment folder
- [ ] Verify `deployment` folder contains all files
- [ ] Check `deployment/.env` has production credentials
- [ ] Backup current local database (if needed)

---

## Deployment Steps

### Access Server
- [ ] Access cPanel at: `https://server38.shared.spaceship.host:2083`
- [ ] Login with username: `admin` and password

### Upload Files
- [ ] Open File Manager in cPanel
- [ ] Navigate to `public_html` folder
- [ ] Delete old files (if any)
- [ ] Upload all files from `deployment` folder
  - Option A: Upload as ZIP and extract
  - Option B: Upload files directly via FTP (FileZilla)

### Configure Environment
- [ ] Create `.env` file in `public_html`
- [ ] Copy production environment variables
- [ ] Verify MongoDB URI is correct
- [ ] Verify all API keys are present

### Setup Node.js
- [ ] Find "Setup Node.js App" in cPanel
- [ ] Create new application:
  - Node version: 18.x or 20.x
  - Application mode: Production
  - Application root: `public_html`
  - Startup file: `server.js`
- [ ] Click "Run NPM Install"
- [ ] Wait for installation (2-3 minutes)
- [ ] Start the application

### Enable SSL
- [ ] Find "SSL/TLS Status" in cPanel
- [ ] Run AutoSSL for codexincenterprise.online
- [ ] Wait 5-10 minutes for activation
- [ ] Verify HTTPS works

---

## Post-Deployment

### Update OAuth Callbacks

#### GitHub
- [ ] Go to: https://github.com/settings/developers
- [ ] Edit OAuth App
- [ ] Add callback: `https://codexincenterprise.online/api/integrations/github/callback`
- [ ] Save changes

#### Discord
- [ ] Go to: https://discord.com/developers/applications
- [ ] Select app → OAuth2
- [ ] Add redirect: `https://codexincenterprise.online/api/integrations/discord/callback`
- [ ] Save changes

#### Slack
- [ ] Go to: https://api.slack.com/apps
- [ ] Select app → OAuth & Permissions
- [ ] Add redirect: `https://codexincenterprise.online/api/integrations/slack/callback`
- [ ] Save changes

#### Notion
- [ ] Go to: https://www.notion.so/my-integrations
- [ ] Select integration → Distribution
- [ ] Add redirect: `https://codexincenterprise.online/api/integrations/notion/callback`
- [ ] Save changes

#### Figma
- [ ] Go to: https://www.figma.com/developers/apps
- [ ] Select app → Settings
- [ ] Add callback: `https://codexincenterprise.online/api/integrations/figma/callback`
- [ ] Save changes

#### Google OAuth
- [ ] Go to: https://console.cloud.google.com/apis/credentials
- [ ] Edit OAuth 2.0 Client
- [ ] Add redirect: `https://codexincenterprise.online/auth/google/callback`
- [ ] Save changes

---

## Testing

### Basic Functionality
- [ ] Visit: https://codexincenterprise.online
- [ ] Homepage loads correctly
- [ ] Sign up page works
- [ ] Create new account
- [ ] Verify email (check inbox)
- [ ] Login with new account
- [ ] Dashboard loads

### Integrations
- [ ] Test GitHub connection
- [ ] Test Discord connection
- [ ] Test Slack connection
- [ ] Test Notion connection
- [ ] Test Figma connection
- [ ] Verify integrations show in dashboard

### Features
- [ ] AI Pair Programming works
- [ ] Source Code page loads
- [ ] Tasks page works
- [ ] Settings page loads
- [ ] Profile update works
- [ ] Profile picture upload works

### Payment (if using live Stripe keys)
- [ ] Pricing page loads
- [ ] Upgrade to Professional works
- [ ] Payment success page shows
- [ ] Subscription status updates

---

## Troubleshooting

### Site Not Loading
- [ ] Check Node.js app is running in cPanel
- [ ] Click "Restart" in Node.js App Manager
- [ ] Check Error Log for details
- [ ] Verify `.env` file exists

### Database Connection Error
- [ ] Verify MongoDB URI in `.env`
- [ ] Check MongoDB Atlas allows all IPs (0.0.0.0/0)
- [ ] Test connection from MongoDB Atlas dashboard

### OAuth Not Working
- [ ] Verify callback URLs are added (not replaced)
- [ ] Keep localhost callbacks for development
- [ ] Clear browser cache
- [ ] Check Client IDs in `.env`

### 500 Internal Server Error
- [ ] Check Error Log in cPanel
- [ ] Verify all dependencies installed
- [ ] Run NPM Install again
- [ ] Restart application

---

## Monitoring

### Daily Checks
- [ ] Site is accessible
- [ ] Users can sign up/login
- [ ] Integrations working
- [ ] No errors in logs

### Weekly Checks
- [ ] Check disk space usage
- [ ] Review error logs
- [ ] Monitor user activity
- [ ] Check database size

### Monthly Checks
- [ ] Update dependencies (if needed)
- [ ] Review security
- [ ] Backup database
- [ ] Check SSL certificate expiry

---

## Emergency Contacts

### Hosting Support
- **Provider:** Spaceship
- **Website:** https://www.spaceship.com
- **Support:** Check Spaceship dashboard for support options

### MongoDB Support
- **Provider:** MongoDB Atlas
- **Website:** https://cloud.mongodb.com
- **Docs:** https://docs.atlas.mongodb.com

---

## Quick Commands

### Restart Application (via cPanel Terminal)
```bash
cd public_html
npm restart
```

### View Logs
```bash
cd public_html
tail -f logs/error.log
```

### Check Node Version
```bash
node --version
```

### Check NPM Version
```bash
npm --version
```

---

## Success Criteria

✅ Site loads at https://codexincenterprise.online
✅ Users can sign up and login
✅ Email verification works
✅ Dashboard displays correctly
✅ All integrations connect successfully
✅ AI Pair Programming functions
✅ Payment system works (if enabled)
✅ SSL certificate active
✅ No console errors
✅ Mobile responsive

---

## Notes

- Keep localhost OAuth callbacks for local development
- Use test Stripe keys initially, switch to live when ready
- Monitor error logs regularly
- Backup database before major updates
- Document any custom configurations

---

**Deployment Date:** _________________

**Deployed By:** _________________

**Notes:** _________________
