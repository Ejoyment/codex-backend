# Integrations & Delete Account - Quick Reference

## 🎯 Quick Access

### Settings Page
```
URL: http://localhost:5500/settings.html
```

### Integrations Section
Scroll down to see all 6 platforms with Connect/Disconnect buttons

### Danger Zone
At the bottom - red border section with Delete Account button

## 🔌 Supported Platforms

| Platform | OAuth | Permissions | Status |
|----------|-------|-------------|--------|
| GitHub | ✅ | Repos, Profile, Orgs | Ready |
| Discord | ✅ | Username, Servers, Messages | Ready |
| Slack | ✅ | Workspace, Messages, Channels | Ready |
| Notion | ✅ | Pages, Content, Workspace | Ready |
| Figma | ✅ | Files, Info, Projects | Ready |
| VS Code | Token | Settings, Extensions, Snippets | Ready |

## 🔑 OAuth Setup (5 min each)

### GitHub
```
URL: https://github.com/settings/developers
Callback: http://localhost:3000/api/integrations/github/callback
```

### Discord
```
URL: https://discord.com/developers/applications
Callback: http://localhost:3000/api/integrations/discord/callback
```

### Slack
```
URL: https://api.slack.com/apps
Callback: http://localhost:3000/api/integrations/slack/callback
```

### Notion
```
URL: https://www.notion.so/my-integrations
Callback: http://localhost:3000/api/integrations/notion/callback
```

### Figma
```
URL: https://www.figma.com/developers/apps
Callback: http://localhost:3000/api/integrations/figma/callback
```

### VS Code
```
No OAuth needed - token-based
```

## 📋 .env Configuration

```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret
```

## 🎬 User Actions

### Connect Integration
```
1. Click "Connect" button
2. Review permissions in modal
3. Click "Authorize"
4. Complete OAuth in popup
5. See "Connected: username"
```

### Disconnect Integration
```
1. Click "Disconnect" button
2. Confirm in dialog
3. See "Not connected"
```

### Delete Account
```
1. Click "Delete Account" in Danger Zone
2. Type "DELETE" in modal
3. Click "Delete Forever"
4. Account permanently deleted
5. Logged out and redirected
```

## 🔧 API Endpoints

### Get Integrations
```
GET /api/integrations
Headers: Authorization: Bearer {token}
```

### Connect Platform
```
GET /api/integrations/{platform}/auth
Headers: Authorization: Bearer {token}
Returns: { authUrl: "..." }
```

### Disconnect Platform
```
DELETE /api/integrations/{platform}/disconnect
Headers: Authorization: Bearer {token}
```

### Delete Account
```
DELETE /api/auth/delete-account
Headers: Authorization: Bearer {token}
```

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| OAuth fails | Check client ID/secret in .env |
| Popup blocked | Allow popups for localhost |
| Not connected after OAuth | Check callback URL matches exactly |
| Delete fails | Make sure you typed "DELETE" |

## ✅ Quick Test

```bash
# 1. Start backend
npm start

# 2. Open settings
http://localhost:5500/settings.html

# 3. Test integration
- Click "Connect" on GitHub
- Authorize in popup
- See "Connected: username"
- Click "Disconnect"
- Confirm disconnection

# 4. Test delete account
- Click "Delete Account"
- Type "DELETE"
- Click "Delete Forever"
- Verify account deleted
```

## 📊 Features at a Glance

✅ 6 platform integrations
✅ Permission popups
✅ OAuth flows
✅ Connect/Disconnect
✅ Real-time status
✅ Delete account
✅ Data cleanup
✅ Secure tokens
✅ CSRF protection
✅ Professional UI

## 🎉 Done!

All integrations and delete account feature are fully functional!
