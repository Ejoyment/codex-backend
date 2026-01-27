# 🔧 FIX INTEGRATION CALLBACKS - Production URLs

## ⚠️ THE PROBLEM

Your integrations are failing because the OAuth callback URLs are still set to `localhost:3000` in each provider's dashboard, but your live site is at `codexincenterprise.online`.

## ✅ THE SOLUTION

Update the callback URLs in each OAuth provider's dashboard to use your production domain.

---

## 🚀 STEP-BY-STEP FIX

### 1. GitHub OAuth

1. Go to: https://github.com/settings/developers
2. Find your "CODEX INC" OAuth App
3. Click "Edit"
4. Update these fields:
   - **Homepage URL**: `https://codexincenterprise.online`
   - **Authorization callback URL**: `https://codex-backend-7utu.onrender.com/api/integrations/github/callback`
5. Click "Update application"

✅ **Done!** GitHub integration will now work on your live site.

---

### 2. Discord OAuth

1. Go to: https://discord.com/developers/applications
2. Select your "CODEX INC" application
3. Go to **OAuth2** → **General**
4. Under "Redirects", click "Add Redirect"
5. Add: `https://codex-backend-7utu.onrender.com/api/integrations/discord/callback`
6. Click "Save Changes"

✅ **Done!** Discord integration will now work.

---

### 3. Slack OAuth

1. Go to: https://api.slack.com/apps
2. Select your "CODEX INC" app
3. Go to **OAuth & Permissions**
4. Under "Redirect URLs", click "Add New Redirect URL"
5. Add: `https://codex-backend-7utu.onrender.com/api/integrations/slack/callback`
6. Click "Add"
7. Click "Save URLs"

✅ **Done!** Slack integration will now work.

---

### 4. Notion OAuth

1. Go to: https://www.notion.so/my-integrations
2. Select your "CODEX INC" integration
3. Go to **Secrets** tab
4. Under "Redirect URIs", click "Add redirect URI"
5. Add: `https://codex-backend-7utu.onrender.com/api/integrations/notion/callback`
6. Click "Add URI"

✅ **Done!** Notion integration will now work.

---

### 5. Figma OAuth

1. Go to: https://www.figma.com/developers/apps
2. Select your "CODEX INC" app
3. Under "Callback URL", update to: `https://codex-backend-7utu.onrender.com/api/integrations/figma/callback`
4. Click "Save"

✅ **Done!** Figma integration will now work.

---

## 📝 IMPORTANT NOTES

### Your Backend URL
Your backend is hosted on Render at:
```
https://codex-backend-7utu.onrender.com
```

### Your Frontend URL
Your frontend is at:
```
https://codexincenterprise.online
```

### Callback URL Pattern
All OAuth callbacks follow this pattern:
```
https://codex-backend-7utu.onrender.com/api/integrations/{PROVIDER}/callback
```

Where `{PROVIDER}` is: `github`, `discord`, `slack`, `notion`, or `figma`

---

## 🧪 TEST AFTER UPDATING

1. Go to: https://codexincenterprise.online/settings.html
2. Sign in if needed
3. Scroll to "Integrations" section
4. Click "Connect" on GitHub
5. You should be redirected to GitHub
6. Authorize the app
7. You should be redirected back to settings
8. You should see "Connected: your-username"

Repeat for each integration!

---

## ⚡ QUICK CHECKLIST

Update callback URLs in:
- [ ] GitHub: https://github.com/settings/developers
- [ ] Discord: https://discord.com/developers/applications
- [ ] Slack: https://api.slack.com/apps
- [ ] Notion: https://www.notion.so/my-integrations
- [ ] Figma: https://www.figma.com/developers/apps

Test each integration:
- [ ] GitHub connects successfully
- [ ] Discord connects successfully
- [ ] Slack connects successfully
- [ ] Notion connects successfully
- [ ] Figma connects successfully

---

## 🆘 TROUBLESHOOTING

### "Redirect URI mismatch" error
**Solution**: Double-check the callback URL is exactly:
```
https://codex-backend-7utu.onrender.com/api/integrations/{provider}/callback
```
No trailing slash, correct provider name.

### OAuth popup closes immediately
**Solution**: 
1. Check browser console for errors
2. Verify the callback URL is added in provider dashboard
3. Make sure backend is running on Render

### "Invalid client" error
**Solution**: 
1. Verify your Client ID and Secret in `.env.production`
2. Make sure they match what's in the provider dashboard
3. Restart your backend after updating `.env`

---

## 🎯 SUMMARY

**What you need to do:**
1. Visit each OAuth provider's dashboard (5 providers)
2. Update the callback URL to use your production backend URL
3. Save changes
4. Test each integration on your live site

**Time needed:** 10-15 minutes total

**Result:** All integrations will work on your live site! 🎉

---

## 📞 NEED HELP?

If you're stuck on any provider:
1. Make sure you're logged into the correct account
2. Look for "OAuth", "Redirect URLs", or "Callback URLs" section
3. The URL should always be: `https://codex-backend-7utu.onrender.com/api/integrations/{provider}/callback`
4. Save/Update after adding the URL

That's it! Your integrations will work perfectly after this! 🚀
