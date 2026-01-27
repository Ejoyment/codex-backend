# 🔗 Connect Frontend to Render Backend

## Your Live URLs:

**Backend (Render):** `https://codex-backend-7utu.onrender.com`
**Frontend (Spaceship):** `https://codexincenterprise.online`

---

## Step 1: Update API Base URL

In ALL your HTML files that make API calls, find this line:

```javascript
const API_BASE_URL = 'http://localhost:3000';
```

Change it to:

```javascript
const API_BASE_URL = 'https://codex-backend-7utu.onrender.com';
```

---

## Files to Update on Spaceship:

Upload these files to your Spaceship hosting (replace the old ones):

### Main Pages:
- `index.html`
- `signup.html`
- `sign_in.html`
- `dashboard.html`
- `profile.html`
- `settings.html`
- `onboarding.html`
- `pricing.html`
- `tasks.html`
- `workspace.html`
- `ai-pair.html`
- `integrations.html`
- `integrations-hub.html`
- `source-code.html`
- `teams.html`
- `standup.html`
- `editor.html`

### JavaScript Files (in js/ folder):
- `js/api.js` - **MOST IMPORTANT**
- `js/dashboard-unified.js`
- `js/dashboard-integrations.js`
- `js/tasks.js`
- `js/workspace.js`
- `js/ai-pair.js`
- `js/integrations-hub.js`
- `js/source-code.js`

---

## Step 2: Update js/api.js (CRITICAL)

This is the main file that handles all API calls. Find this section:

```javascript
// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'http://localhost:3000';
```

Change it to:

```javascript
// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://codex-backend-7utu.onrender.com';
```

---

## Step 3: Update OAuth Callback URLs

Update these in your OAuth provider settings:

### GitHub
- Go to: https://github.com/settings/developers
- Edit your OAuth App
- **Authorization callback URL:** `https://codex-backend-7utu.onrender.com/api/integrations/github/callback`

### Discord
- Go to: https://discord.com/developers/applications
- **Redirects:** `https://codex-backend-7utu.onrender.com/api/integrations/discord/callback`

### Slack
- Go to: https://api.slack.com/apps
- **Redirect URLs:** `https://codex-backend-7utu.onrender.com/api/integrations/slack/callback`

### Notion
- Go to: https://www.notion.so/my-integrations
- **Redirect URIs:** `https://codex-backend-7utu.onrender.com/api/integrations/notion/callback`

### Figma
- Go to: https://www.figma.com/developers/apps
- **Callback URL:** `https://codex-backend-7utu.onrender.com/api/integrations/figma/callback`

### Google
- Go to: https://console.cloud.google.com/apis/credentials
- **Authorized redirect URIs:** `https://codex-backend-7utu.onrender.com/auth/google/callback`

---

## Step 4: Update Render Environment Variables

Go to Render Dashboard → Environment:

Update these two variables:

```
FRONTEND_URL=https://codexincenterprise.online
BACKEND_URL=https://codex-backend-7utu.onrender.com
```

Save changes (Render will redeploy automatically).

---

## Step 5: Test Your App!

1. Go to: `https://codexincenterprise.online`
2. Try signing up with a new account
3. Check Render logs for the OTP code (since email is in MOCK mode)
4. Use the OTP to verify
5. Test login, dashboard, integrations

---

## Quick Test Endpoints:

**Health Check:**
```
https://codex-backend-7utu.onrender.com/api/health
```

Should return:
```json
{
  "status": "OK",
  "message": "CODEX INC Backend is running",
  "timestamp": "..."
}
```

---

## Important Notes:

### Free Tier Sleep Mode:
- App sleeps after 15 minutes of inactivity
- First request takes 30-60 seconds to wake up
- This is normal for Render free tier
- Upgrade to $7/month for always-on

### CORS:
Your backend is configured to accept requests from:
- `https://codexincenterprise.online` (your frontend)
- This is already set in your code

### Email Service:
- Currently in MOCK mode (OTPs in console)
- To enable real emails, set up SendGrid (free 100/day)
- Or use another email service provider

---

## ✅ Success Checklist:

- [ ] Backend live at Render
- [ ] Frontend files updated with new API URL
- [ ] js/api.js updated
- [ ] Files uploaded to Spaceship
- [ ] OAuth callbacks updated
- [ ] Render environment variables updated
- [ ] Tested signup/login flow
- [ ] Tested dashboard access
- [ ] Tested integrations

---

## 🆘 Troubleshooting:

**CORS Error?**
- Make sure `FRONTEND_URL` in Render is set to `https://codexincenterprise.online`

**API Not Responding?**
- App might be sleeping (first request takes 30-60 seconds)
- Check Render logs for errors

**Can't Login?**
- Check browser console for errors
- Verify API_BASE_URL is correct in js/api.js
- Make sure you're using HTTPS (not HTTP)

---

**YOU'RE ALMOST DONE! Just update the frontend files and you'll be fully live!**
