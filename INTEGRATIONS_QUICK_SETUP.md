# Integrations & Delete Account - Quick Setup

## 🚀 Quick Start

### 1. Backend is Ready
All integration routes are already implemented. Just need OAuth credentials.

### 2. Get OAuth Credentials

#### GitHub (5 minutes)
```
1. Visit: https://github.com/settings/developers
2. Click "New OAuth App"
3. Application name: CODEX INC
4. Homepage URL: http://localhost:5500
5. Callback URL: http://localhost:3000/api/integrations/github/callback
6. Copy Client ID and Secret
```

#### Discord (5 minutes)
```
1. Visit: https://discord.com/developers/applications
2. Click "New Application"
3. Name: CODEX INC
4. Go to OAuth2 → General
5. Add Redirect: http://localhost:3000/api/integrations/discord/callback
6. Copy Client ID and Secret
```

#### Slack (5 minutes)
```
1. Visit: https://api.slack.com/apps
2. Click "Create New App" → From scratch
3. App Name: CODEX INC
4. Pick a workspace
5. OAuth & Permissions → Add Redirect URL
6. URL: http://localhost:3000/api/integrations/slack/callback
7. Copy Client ID and Secret from Basic Information
```

#### Notion (5 minutes)
```
1. Visit: https://www.notion.so/my-integrations
2. Click "+ New integration"
3. Name: CODEX INC
4. Associated workspace: Select yours
5. Type: Public
6. Redirect URI: http://localhost:3000/api/integrations/notion/callback
7. Copy OAuth client ID and secret
```

#### Figma (5 minutes)
```
1. Visit: https://www.figma.com/developers/apps
2. Click "Create app"
3. App name: CODEX INC
4. Callback URL: http://localhost:3000/api/integrations/figma/callback
5. Copy Client ID and Secret
```

### 3. Update .env File

Open `.env` and replace the placeholder values:

```env
# GitHub
GITHUB_CLIENT_ID=your_actual_github_client_id
GITHUB_CLIENT_SECRET=your_actual_github_secret

# Discord
DISCORD_CLIENT_ID=your_actual_discord_client_id
DISCORD_CLIENT_SECRET=your_actual_discord_secret

# Slack
SLACK_CLIENT_ID=your_actual_slack_client_id
SLACK_CLIENT_SECRET=your_actual_slack_secret

# Notion
NOTION_CLIENT_ID=your_actual_notion_client_id
NOTION_CLIENT_SECRET=your_actual_notion_secret

# Figma
FIGMA_CLIENT_ID=your_actual_figma_client_id
FIGMA_CLIENT_SECRET=your_actual_figma_secret
```

### 4. Restart Backend

```bash
npm start
```

### 5. Test It Out

1. Open http://localhost:5500/settings.html
2. Scroll to Integrations section
3. Click "Connect" on any platform
4. Review permissions
5. Click "Authorize"
6. Complete OAuth flow
7. See "Connected" status!

## 🎯 Features You Can Use Now

### Connect Integrations
- Click "Connect" button
- Review permissions in popup
- Authorize on platform
- See connected status

### Disconnect Integrations
- Click "Disconnect" button
- Confirm disconnection
- Integration removed

### Delete Account
- Scroll to Danger Zone
- Click "Delete Account"
- Type "DELETE" to confirm
- Account permanently deleted

## 🔧 Troubleshooting

### "Failed to initiate authorization"
- Check OAuth credentials in `.env`
- Make sure backend is running
- Verify callback URLs match exactly

### OAuth popup closes immediately
- Check browser console for errors
- Verify client ID is correct
- Check callback URL configuration

### "Not connected" after OAuth
- Check backend console for errors
- Verify callback route is working
- Check database connection

### Delete account not working
- Make sure you typed "DELETE" exactly
- Check JWT token is valid
- Verify backend route is accessible

## 📝 VS Code Integration (Special Case)

VS Code doesn't use OAuth. Instead:

1. Open VS Code
2. Generate a personal access token
3. Go to Settings page
4. Click "Connect" on VS Code
5. Paste your token
6. Click "Connect"

## ⚡ Quick Test Checklist

- [ ] Backend running on port 3000
- [ ] Frontend running on port 5500
- [ ] OAuth credentials in `.env`
- [ ] Signed in to CODEX INC
- [ ] Navigate to Settings page
- [ ] See all 6 integrations
- [ ] Click "Connect" on GitHub
- [ ] Permission modal appears
- [ ] Click "Authorize"
- [ ] OAuth popup opens
- [ ] Complete authorization
- [ ] Redirected back to settings
- [ ] See "Connected: username"
- [ ] Click "Disconnect"
- [ ] Confirm disconnection
- [ ] See "Not connected"
- [ ] Scroll to Danger Zone
- [ ] Click "Delete Account"
- [ ] Modal appears
- [ ] Type "DELETE"
- [ ] Click "Delete Forever"
- [ ] Account deleted
- [ ] Redirected to homepage

## 🎉 You're Done!

All integrations are now fully functional. Users can:
- Connect to 6 different platforms
- See what permissions are requested
- Disconnect anytime
- Delete their account permanently

Enjoy your new integration system! 🚀
