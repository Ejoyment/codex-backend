# Integrations & Delete Account - Complete Implementation

## ✅ What Was Added

### 1. **All Platform Integrations**
Added full OAuth integration support for 6 platforms:
- ✅ GitHub
- ✅ Discord (NEW)
- ✅ Slack
- ✅ Notion
- ✅ Figma
- ✅ VS Code

### 2. **Permission Popup System**
- Beautiful modal dialog showing requested permissions
- Platform-specific permission lists
- Authorize/Cancel buttons
- Smooth OAuth flow

### 3. **Delete Account Feature**
- Danger Zone section with red styling
- Confirmation modal requiring "DELETE" text input
- Permanent deletion of:
  - User account
  - Profile photo
  - All integrations
  - Subscription data
  - OTP records
- Automatic logout and redirect

## 🎨 UI Features

### Integration Cards
Each integration shows:
- Platform icon (colored SVG)
- Platform name
- Connection status
- Connect/Disconnect button
- Username/email when connected

### Permission Modal
- Platform name in header
- "CODEX INC would like to:" message
- List of permissions with checkmark icons
- Cancel and Authorize buttons
- Clean, professional design

### Delete Account Modal
- Warning icon (red triangle)
- "Delete Account" title
- Warning message
- Text input requiring "DELETE" confirmation
- Cancel and Delete Forever buttons
- Red color scheme for danger

## 🔧 Backend Implementation

### New Routes Added

#### Discord OAuth
```
GET  /api/integrations/discord/auth      - Get Discord OAuth URL
GET  /api/integrations/discord/callback  - Handle Discord callback
```

#### Delete Account
```
DELETE /api/auth/delete-account          - Permanently delete account
```

### OAuth Flow for Each Platform

#### GitHub
- **Scopes**: repo, user, read:org
- **Data Stored**: username, email, user ID
- **Permissions**: Access repositories, profile, organizations

#### Discord
- **Scopes**: identify, email, guilds
- **Data Stored**: username, email, discriminator, avatar
- **Permissions**: Access username, email, servers

#### Slack
- **Scopes**: channels:read, chat:write, users:read
- **Data Stored**: workspace name, team ID
- **Permissions**: Workspace info, messages, channels

#### Notion
- **Scopes**: workspace access
- **Data Stored**: workspace name, workspace ID
- **Permissions**: Access pages, read/write content

#### Figma
- **Scopes**: file_read
- **Data Stored**: handle, email, user ID
- **Permissions**: Access files, read info, view projects

#### VS Code
- **Method**: Token-based (no OAuth)
- **Data Stored**: access token
- **Permissions**: Sync settings, extensions, snippets

## 📋 Integration Permissions

### GitHub
- Access your repositories
- Read your profile information
- Access organization memberships

### Discord
- Access your Discord username
- View your Discord servers
- Send messages on your behalf

### Slack
- Access your workspace information
- Read and write messages
- Access channel information

### Notion
- Access your Notion pages
- Read and write content
- Access workspace information

### Figma
- Access your Figma files
- Read file information
- View team projects

### VS Code
- Sync your VS Code settings
- Access installed extensions
- Sync code snippets

## 🔐 Security Features

### OAuth Security
- State parameter for CSRF protection
- Secure token storage in database
- Tokens never exposed to frontend
- Automatic token refresh (where supported)

### Delete Account Security
- Requires "DELETE" text confirmation
- JWT authentication required
- Cascading deletion of all related data
- Automatic file cleanup (profile photos)
- Irreversible action with warnings

## 💾 Database Schema

### Integration Model
```javascript
{
  userId: ObjectId,
  provider: String (github|discord|slack|notion|figma|vscode),
  accessToken: String (encrypted),
  refreshToken: String,
  expiresAt: Date,
  providerUserId: String,
  providerUsername: String,
  providerEmail: String,
  scopes: [String],
  metadata: Map,
  isActive: Boolean,
  lastSyncedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## 🎯 User Flow

### Connecting an Integration
1. User clicks "Connect" button on platform
2. Permission modal appears showing requested permissions
3. User clicks "Authorize"
4. OAuth popup window opens
5. User authorizes on platform's site
6. Callback redirects to settings page
7. Integration status updates to "Connected"
8. Button changes to "Disconnect"

### Disconnecting an Integration
1. User clicks "Disconnect" button
2. Confirmation dialog appears
3. User confirms disconnection
4. Integration deleted from database
5. Status updates to "Not connected"
6. Button changes back to "Connect"

### Deleting Account
1. User clicks "Delete Account" in Danger Zone
2. Modal appears with warning
3. User types "DELETE" to confirm
4. User clicks "Delete Forever"
5. Backend deletes all user data
6. User logged out automatically
7. Redirected to homepage

## 📁 Files Modified/Created

### Frontend
- `settings.html` - Added all integrations and delete account section
  - 6 integration cards with icons
  - Permission modal
  - Delete account modal
  - JavaScript for all functionality

### Backend
- `routes/integrations.js` - Added Discord OAuth flow
- `routes/auth.js` - Added delete account endpoint
- `models/Integration.js` - Added discord to enum
- `server.js` - Updated console log with new endpoints
- `.env` - Added Discord client credentials

### Documentation
- `INTEGRATIONS_AND_DELETE_ACCOUNT.md` - This file

## 🚀 Setup Instructions

### 1. Configure OAuth Apps

You need to create OAuth apps for each platform:

#### GitHub
1. Go to https://github.com/settings/developers
2. Create New OAuth App
3. Set callback URL: `http://localhost:3000/api/integrations/github/callback`
4. Copy Client ID and Secret to `.env`

#### Discord
1. Go to https://discord.com/developers/applications
2. Create New Application
3. Go to OAuth2 settings
4. Add redirect: `http://localhost:3000/api/integrations/discord/callback`
5. Copy Client ID and Secret to `.env`

#### Slack
1. Go to https://api.slack.com/apps
2. Create New App
3. Add OAuth redirect URL
4. Copy credentials to `.env`

#### Notion
1. Go to https://www.notion.so/my-integrations
2. Create New Integration
3. Set redirect URI
4. Copy credentials to `.env`

#### Figma
1. Go to https://www.figma.com/developers/apps
2. Create New App
3. Set callback URL
4. Copy credentials to `.env`

#### VS Code
- No OAuth setup needed
- Users generate their own access tokens

### 2. Update .env File

```env
# Discord
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# GitHub
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Slack
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# Notion
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret

# Figma
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret
```

### 3. Restart Backend

```bash
npm start
```

## 🧪 Testing

### Test Integration Connection
1. Navigate to Settings page
2. Click "Connect" on any platform
3. Review permissions in modal
4. Click "Authorize"
5. Complete OAuth flow
6. Verify "Connected" status
7. Check username/email displays

### Test Integration Disconnection
1. Click "Disconnect" on connected platform
2. Confirm in dialog
3. Verify "Not connected" status
4. Verify button changes to "Connect"

### Test Delete Account
1. Click "Delete Account" in Danger Zone
2. Modal should appear
3. Try clicking "Delete Forever" without typing
4. Should show error
5. Type "DELETE" in input
6. Click "Delete Forever"
7. Should delete account and redirect
8. Try logging in - account should not exist

## ⚠️ Important Notes

### OAuth Callback URLs
- For production, update callback URLs to your domain
- Current setup uses `http://localhost:3000`
- Each platform requires exact URL match

### Delete Account
- **IRREVERSIBLE** - all data permanently deleted
- Includes: user, integrations, subscriptions, OTPs, photos
- User must type "DELETE" to confirm
- Automatic logout after deletion

### VS Code Integration
- Different from others (token-based, not OAuth)
- Users generate token in VS Code
- Paste token in settings
- No popup window needed

## 🎉 Features Summary

✅ 6 platform integrations with full OAuth
✅ Permission popup for each platform
✅ Connect/Disconnect functionality
✅ Real-time status updates
✅ Username/email display when connected
✅ Delete account with confirmation
✅ Cascading data deletion
✅ Professional UI with icons
✅ Secure token storage
✅ CSRF protection with state parameter

All integrations are fully functional and ready to use! 🚀
