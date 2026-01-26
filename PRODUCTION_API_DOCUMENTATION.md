# Production API Documentation - CODEX INC Integrations

## Overview

Complete API documentation for all integration endpoints. All endpoints require authentication via Bearer token.

**Base URL**: `http://localhost:3000/api` (Development)  
**Authentication**: `Authorization: Bearer <token>`

---

## Table of Contents

1. [GitHub API](#github-api)
2. [Discord API](#discord-api)
3. [Slack API](#slack-api)
4. [Notion API](#notion-api)
5. [Figma API](#figma-api)
6. [Authentication](#authentication)
7. [Error Handling](#error-handling)

---

## GitHub API

Base path: `/api/github`

### Repositories

#### Get All Repositories
```http
GET /api/github/repos
Query Parameters:
  - sort: updated|created|pushed|full_name (default: updated)
  - per_page: number (default: 30, max: 100)
  - page: number (default: 1)
  - type: all|owner|public|private|member (default: all)

Response:
{
  "success": true,
  "repositories": [
    {
      "id": 123456,
      "name": "my-repo",
      "fullName": "username/my-repo",
      "owner": "username",
      "description": "Repository description",
      "private": false,
      "url": "https://github.com/username/my-repo",
      "cloneUrl": "https://github.com/username/my-repo.git",
      "stars": 42,
      "forks": 5,
      "watchers": 10,
      "language": "JavaScript",
      "defaultBranch": "main",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T00:00:00Z",
      "size": 1024,
      "openIssues": 3
    }
  ]
}
```

#### Get Single Repository
```http
GET /api/github/repos/:owner/:repo

Response:
{
  "success": true,
  "repository": { /* repository details */ }
}
```

#### Create Repository
```http
POST /api/github/repos
Body:
{
  "name": "new-repo",
  "description": "My new repository",
  "private": false,
  "autoInit": true
}

Response:
{
  "success": true,
  "message": "Repository created successfully",
  "repository": {
    "name": "new-repo",
    "url": "https://github.com/username/new-repo",
    "cloneUrl": "https://github.com/username/new-repo.git"
  }
}
```

### Branches

#### Get Branches
```http
GET /api/github/repos/:owner/:repo/branches

Response:
{
  "success": true,
  "branches": [
    {
      "name": "main",
      "protected": false,
      "commit": {
        "sha": "abc123...",
        "url": "https://api.github.com/repos/..."
      }
    }
  ]
}
```

#### Create Branch
```http
POST /api/github/repos/:owner/:repo/branches
Body:
{
  "branchName": "feature/new-feature",
  "fromBranch": "main"
}

Response:
{
  "success": true,
  "message": "Branch created successfully",
  "branch": {
    "name": "feature/new-feature",
    "ref": "refs/heads/feature/new-feature",
    "sha": "abc123..."
  }
}
```

### Files & Content

#### Get Repository Contents
```http
GET /api/github/repos/:owner/:repo/contents/*
Query Parameters:
  - ref: branch name (optional)

Response (Directory):
{
  "success": true,
  "type": "directory",
  "contents": [
    {
      "name": "README.md",
      "path": "README.md",
      "type": "file",
      "size": 1024,
      "sha": "abc123...",
      "url": "https://github.com/..."
    }
  ]
}

Response (File):
{
  "success": true,
  "type": "file",
  "file": {
    "name": "README.md",
    "path": "README.md",
    "sha": "abc123...",
    "size": 1024,
    "content": "# My Project\n\nDescription...",
    "encoding": "base64",
    "url": "https://github.com/..."
  }
}
```

#### Update File
```http
PUT /api/github/repos/:owner/:repo/contents/*
Body:
{
  "content": "Updated file content",
  "message": "Update README",
  "sha": "abc123...",
  "branch": "main"
}

Response:
{
  "success": true,
  "message": "File updated successfully",
  "commit": {
    "sha": "def456...",
    "url": "https://github.com/..."
  }
}
```

#### Create File
```http
POST /api/github/repos/:owner/:repo/contents/*
Body:
{
  "content": "New file content",
  "message": "Create new file",
  "branch": "main"
}

Response:
{
  "success": true,
  "message": "File created successfully",
  "file": {
    "path": "path/to/file.txt",
    "sha": "abc123...",
    "url": "https://github.com/..."
  }
}
```

### Commits

#### Get Commits
```http
GET /api/github/repos/:owner/:repo/commits
Query Parameters:
  - sha: branch/commit SHA (optional)
  - per_page: number (default: 30)
  - page: number (default: 1)

Response:
{
  "success": true,
  "commits": [
    {
      "sha": "abc123...",
      "message": "Commit message",
      "author": {
        "name": "John Doe",
        "email": "john@example.com",
        "date": "2024-01-15T00:00:00Z",
        "username": "johndoe"
      },
      "url": "https://github.com/...",
      "stats": {
        "additions": 10,
        "deletions": 5,
        "total": 15
      }
    }
  ]
}
```

### Issues

#### Get Issues
```http
GET /api/github/repos/:owner/:repo/issues
Query Parameters:
  - state: open|closed|all (default: open)
  - per_page: number (default: 30)
  - page: number (default: 1)

Response:
{
  "success": true,
  "issues": [
    {
      "id": 123,
      "number": 1,
      "title": "Bug: Something is broken",
      "body": "Description of the issue",
      "state": "open",
      "user": "username",
      "labels": ["bug", "high-priority"],
      "assignees": ["developer1"],
      "createdAt": "2024-01-15T00:00:00Z",
      "updatedAt": "2024-01-15T00:00:00Z",
      "url": "https://github.com/..."
    }
  ]
}
```

#### Create Issue
```http
POST /api/github/repos/:owner/:repo/issues
Body:
{
  "title": "New issue",
  "body": "Issue description",
  "labels": ["bug"],
  "assignees": ["username"]
}

Response:
{
  "success": true,
  "message": "Issue created successfully",
  "issue": {
    "number": 2,
    "title": "New issue",
    "url": "https://github.com/..."
  }
}
```

### Pull Requests

#### Get Pull Requests
```http
GET /api/github/repos/:owner/:repo/pulls
Query Parameters:
  - state: open|closed|all (default: open)
  - per_page: number (default: 30)
  - page: number (default: 1)

Response:
{
  "success": true,
  "pullRequests": [
    {
      "id": 456,
      "number": 1,
      "title": "Add new feature",
      "body": "PR description",
      "state": "open",
      "user": "username",
      "head": "feature-branch",
      "base": "main",
      "createdAt": "2024-01-15T00:00:00Z",
      "updatedAt": "2024-01-15T00:00:00Z",
      "url": "https://github.com/...",
      "mergeable": true
    }
  ]
}
```

#### Create Pull Request
```http
POST /api/github/repos/:owner/:repo/pulls
Body:
{
  "title": "New feature",
  "body": "PR description",
  "head": "feature-branch",
  "base": "main"
}

Response:
{
  "success": true,
  "message": "Pull request created successfully",
  "pullRequest": {
    "number": 2,
    "title": "New feature",
    "url": "https://github.com/..."
  }
}
```

### User Info

#### Get Authenticated User
```http
GET /api/github/user

Response:
{
  "success": true,
  "user": {
    "login": "username",
    "name": "John Doe",
    "email": "john@example.com",
    "bio": "Developer",
    "company": "CODEX INC",
    "location": "San Francisco",
    "avatarUrl": "https://avatars.githubusercontent.com/...",
    "publicRepos": 42,
    "followers": 100,
    "following": 50,
    "createdAt": "2020-01-01T00:00:00Z"
  }
}
```

---

## Discord API

Base path: `/api/discord`

### User Info

#### Get Current User
```http
GET /api/discord/user

Response:
{
  "success": true,
  "user": {
    "id": "123456789",
    "username": "johndoe",
    "discriminator": "1234",
    "avatar": "https://cdn.discordapp.com/avatars/...",
    "email": "john@example.com",
    "verified": true,
    "locale": "en-US",
    "mfaEnabled": false
  }
}
```

### Guilds (Servers)

#### Get User's Guilds
```http
GET /api/discord/guilds

Response:
{
  "success": true,
  "guilds": [
    {
      "id": "987654321",
      "name": "My Server",
      "icon": "https://cdn.discordapp.com/icons/...",
      "owner": false,
      "permissions": "2147483647",
      "features": ["COMMUNITY", "NEWS"]
    }
  ]
}
```

#### Get Guild Details
```http
GET /api/discord/guilds/:guildId

Response:
{
  "success": true,
  "guild": {
    "id": "987654321",
    "name": "My Server",
    "icon": "https://cdn.discordapp.com/icons/...",
    "owner": false,
    "permissions": "2147483647"
  }
}
```

### Channels

#### Get Guild Channels
```http
GET /api/discord/guilds/:guildId/channels

Response:
{
  "success": true,
  "channels": [
    {
      "id": "111222333",
      "name": "general",
      "type": 0,
      "position": 0
    }
  ],
  "note": "Full channel access requires Discord bot integration"
}
```

### Messages

#### Get Channel Messages
```http
GET /api/discord/channels/:channelId/messages
Query Parameters:
  - limit: number (default: 50, max: 100)

Response:
{
  "success": true,
  "messages": [
    {
      "id": "444555666",
      "content": "Hello world!",
      "author": {
        "id": "123456789",
        "username": "johndoe",
        "avatar": null
      },
      "timestamp": "2024-01-15T00:00:00Z"
    }
  ],
  "note": "Full message access requires Discord bot integration"
}
```

#### Send Message
```http
POST /api/discord/channels/:channelId/messages
Body:
{
  "content": "Hello from CODEX INC!",
  "embeds": []
}

Response:
{
  "success": true,
  "message": {
    "id": "777888999",
    "content": "Hello from CODEX INC!",
    "timestamp": "2024-01-15T00:00:00Z"
  },
  "note": "Sending messages requires Discord bot integration"
}
```

### Bot Setup

#### Get Bot Setup Instructions
```http
GET /api/discord/bot-setup

Response:
{
  "success": true,
  "message": "Discord Bot Setup Guide",
  "steps": [ /* setup steps */ ],
  "requiredPermissions": [ /* permissions list */ ],
  "envVariables": { /* required env vars */ }
}
```

---

## Slack API

Base path: `/api/slack`

### Workspace

#### Get Team Info
```http
GET /api/slack/team/info

Response:
{
  "success": true,
  "team": {
    "id": "T123456",
    "name": "My Workspace",
    "domain": "myworkspace",
    "email_domain": "example.com"
  }
}
```

### Conversations

#### List Channels
```http
GET /api/slack/conversations/list
Query Parameters:
  - types: public_channel,private_channel (default: public_channel,private_channel)
  - limit: number (default: 100)

Response:
{
  "success": true,
  "channels": [
    {
      "id": "C123456",
      "name": "general",
      "is_channel": true,
      "is_private": false,
      "is_member": true
    }
  ]
}
```

#### Get Channel History
```http
GET /api/slack/conversations/history/:channelId
Query Parameters:
  - limit: number (default: 50)

Response:
{
  "success": true,
  "messages": [
    {
      "type": "message",
      "user": "U123456",
      "text": "Hello team!",
      "ts": "1234567890.123456"
    }
  ]
}
```

#### Create Channel
```http
POST /api/slack/conversations/create
Body:
{
  "name": "new-channel",
  "is_private": false
}

Response:
{
  "success": true,
  "channel": {
    "id": "C789012",
    "name": "new-channel"
  }
}
```

### Messages

#### Send Message
```http
POST /api/slack/chat/postMessage
Body:
{
  "channel": "C123456",
  "text": "Hello from CODEX INC!",
  "blocks": []
}

Response:
{
  "success": true,
  "message": {
    "ts": "1234567890.123456",
    "channel": "C123456"
  }
}
```

### Users

#### List Users
```http
GET /api/slack/users/list
Query Parameters:
  - limit: number (default: 100)

Response:
{
  "success": true,
  "users": [
    {
      "id": "U123456",
      "name": "johndoe",
      "real_name": "John Doe",
      "is_bot": false
    }
  ]
}
```

#### Get User Info
```http
GET /api/slack/users/info/:userId

Response:
{
  "success": true,
  "user": {
    "id": "U123456",
    "name": "johndoe",
    "real_name": "John Doe",
    "profile": {
      "email": "john@example.com",
      "image_72": "https://..."
    }
  }
}
```

### Files

#### Upload File
```http
POST /api/slack/files/upload
Body:
{
  "channels": "C123456",
  "content": "File content here",
  "filename": "document.txt",
  "title": "My Document"
}

Response:
{
  "success": true,
  "file": {
    "id": "F123456",
    "name": "document.txt",
    "url_private": "https://..."
  }
}
```

---

## Notion API

Base path: `/api/notion`

### Search

#### Search All Content
```http
POST /api/notion/search
Body:
{
  "query": "project",
  "filter": {
    "property": "object",
    "value": "page"
  },
  "sort": {
    "direction": "descending",
    "timestamp": "last_edited_time"
  },
  "page_size": 100
}

Response:
{
  "success": true,
  "results": [ /* search results */ ]
}
```

### Databases

#### Get Databases
```http
GET /api/notion/databases

Response:
{
  "success": true,
  "databases": [
    {
      "id": "abc123...",
      "title": [{ "text": { "content": "Tasks" } }],
      "properties": { /* database schema */ }
    }
  ]
}
```

#### Get Database
```http
GET /api/notion/databases/:databaseId

Response:
{
  "success": true,
  "database": { /* database details */ }
}
```

#### Query Database
```http
POST /api/notion/databases/:databaseId/query
Body:
{
  "filter": {
    "property": "Status",
    "select": {
      "equals": "In Progress"
    }
  },
  "sorts": [
    {
      "property": "Created",
      "direction": "descending"
    }
  ],
  "page_size": 100
}

Response:
{
  "success": true,
  "results": [ /* database entries */ ]
}
```

### Pages

#### Get Page
```http
GET /api/notion/pages/:pageId

Response:
{
  "success": true,
  "page": {
    "id": "abc123...",
    "properties": { /* page properties */ }
  }
}
```

#### Create Page
```http
POST /api/notion/pages
Body:
{
  "parent": {
    "database_id": "abc123..."
  },
  "properties": {
    "Name": {
      "title": [
        {
          "text": {
            "content": "New Task"
          }
        }
      ]
    }
  },
  "children": []
}

Response:
{
  "success": true,
  "page": { /* created page */ }
}
```

#### Update Page
```http
PATCH /api/notion/pages/:pageId
Body:
{
  "properties": {
    "Status": {
      "select": {
        "name": "Done"
      }
    }
  }
}

Response:
{
  "success": true,
  "page": { /* updated page */ }
}
```

### Blocks

#### Get Block Children
```http
GET /api/notion/blocks/:blockId/children
Query Parameters:
  - page_size: number (default: 100)

Response:
{
  "success": true,
  "blocks": [ /* block children */ ]
}
```

#### Append Block Children
```http
PATCH /api/notion/blocks/:blockId/children
Body:
{
  "children": [
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [
          {
            "type": "text",
            "text": {
              "content": "New paragraph"
            }
          }
        ]
      }
    }
  ]
}

Response:
{
  "success": true,
  "blocks": [ /* appended blocks */ ]
}
```

### Users

#### List Users
```http
GET /api/notion/users
Query Parameters:
  - page_size: number (default: 100)

Response:
{
  "success": true,
  "users": [
    {
      "id": "abc123...",
      "name": "John Doe",
      "avatar_url": "https://...",
      "type": "person"
    }
  ]
}
```

#### Get User
```http
GET /api/notion/users/:userId

Response:
{
  "success": true,
  "user": { /* user details */ }
}
```

---

## Figma API

Base path: `/api/figma`

### User

#### Get Current User
```http
GET /api/figma/me

Response:
{
  "success": true,
  "user": {
    "id": "123456",
    "email": "john@example.com",
    "handle": "johndoe",
    "img_url": "https://..."
  }
}
```

### Files

#### Get User's Files
```http
GET /api/figma/files

Response:
{
  "success": true,
  "files": [
    {
      "key": "abc123...",
      "name": "Design System",
      "thumbnail_url": "https://...",
      "last_modified": "2024-01-15T00:00:00Z"
    }
  ]
}
```

#### Get File
```http
GET /api/figma/files/:fileKey
Query Parameters:
  - geometry: paths|bounds (default: paths)

Response:
{
  "success": true,
  "file": {
    "name": "Design System",
    "lastModified": "2024-01-15T00:00:00Z",
    "document": { /* file structure */ }
  }
}
```

#### Get File Nodes
```http
GET /api/figma/files/:fileKey/nodes
Query Parameters:
  - ids: comma-separated node IDs

Response:
{
  "success": true,
  "nodes": { /* node details */ }
}
```

#### Get File Images
```http
GET /api/figma/images/:fileKey
Query Parameters:
  - ids: comma-separated node IDs
  - scale: number (default: 1)
  - format: jpg|png|svg|pdf (default: png)

Response:
{
  "success": true,
  "images": {
    "node-id": "https://..."
  }
}
```

### Versions

#### Get File Versions
```http
GET /api/figma/files/:fileKey/versions

Response:
{
  "success": true,
  "versions": [
    {
      "id": "123456",
      "created_at": "2024-01-15T00:00:00Z",
      "label": "Version 1.0",
      "user": { /* user info */ }
    }
  ]
}
```

### Comments

#### Get File Comments
```http
GET /api/figma/files/:fileKey/comments

Response:
{
  "success": true,
  "comments": [
    {
      "id": "123456",
      "message": "Looks great!",
      "user": { /* user info */ },
      "created_at": "2024-01-15T00:00:00Z"
    }
  ]
}
```

#### Post Comment
```http
POST /api/figma/files/:fileKey/comments
Body:
{
  "message": "Great work!",
  "client_meta": {
    "x": 100,
    "y": 200,
    "node_id": "123:456"
  }
}

Response:
{
  "success": true,
  "comment": { /* created comment */ }
}
```

### Projects

#### Get Team Projects
```http
GET /api/figma/teams/:teamId/projects

Response:
{
  "success": true,
  "projects": [
    {
      "id": "123456",
      "name": "Mobile App"
    }
  ]
}
```

#### Get Project Files
```http
GET /api/figma/projects/:projectId/files

Response:
{
  "success": true,
  "files": [ /* project files */ ]
}
```

### Components

#### Get Component
```http
GET /api/figma/components/:key

Response:
{
  "success": true,
  "component": {
    "key": "abc123...",
    "name": "Button",
    "description": "Primary button component"
  }
}
```

#### Get Component Sets
```http
GET /api/figma/component_sets/:key

Response:
{
  "success": true,
  "componentSet": { /* component set details */ }
}
```

### Styles

#### Get Style
```http
GET /api/figma/styles/:key

Response:
{
  "success": true,
  "style": {
    "key": "abc123...",
    "name": "Primary Color",
    "style_type": "FILL"
  }
}
```

---

## Authentication

All API endpoints require authentication using a Bearer token.

### Getting a Token

1. Sign in to your account
2. Token is stored in `localStorage.getItem('authToken')`
3. Include in all requests:

```javascript
headers: {
  'Authorization': `Bearer ${token}`
}
```

### Token Expiration

- Tokens expire after 7 days
- Refresh by signing in again
- Some integration tokens (Discord, Figma) auto-refresh

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Integration-Specific Errors

#### GitHub
- `401` - Token expired, reconnect GitHub
- `404` - Repository/resource not found
- `403` - Rate limit exceeded or insufficient permissions

#### Discord
- `401` - Token expired, reconnect Discord
- `403` - Missing bot permissions
- `50001` - Missing access to channel

#### Slack
- `invalid_auth` - Token invalid
- `channel_not_found` - Channel doesn't exist
- `not_in_channel` - Bot not in channel

#### Notion
- `unauthorized` - Invalid token
- `object_not_found` - Page/database not found
- `validation_error` - Invalid request body

#### Figma
- `401` - Token expired
- `403` - No access to file
- `404` - File not found

---

## Rate Limits

### GitHub
- 5,000 requests per hour (authenticated)
- Check headers: `X-RateLimit-Remaining`

### Discord
- 50 requests per second per endpoint
- Global rate limit: 50/s

### Slack
- Tier 1: 1+ per minute
- Tier 2: 20+ per minute
- Tier 3: 50+ per minute
- Tier 4: 100+ per minute

### Notion
- 3 requests per second average

### Figma
- 2 requests per second per file

---

## Testing

### Using cURL

```bash
# GitHub - Get repos
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/github/repos

# Discord - Get guilds
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/discord/guilds

# Slack - Send message
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"C123456","text":"Hello!"}' \
  http://localhost:3000/api/slack/chat/postMessage
```

### Using JavaScript

```javascript
const API_URL = 'http://localhost:3000/api';
const token = localStorage.getItem('authToken');

// GitHub - Get repos
const repos = await fetch(`${API_URL}/github/repos`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// Discord - Get guilds
const guilds = await fetch(`${API_URL}/discord/guilds`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// Slack - Send message
const message = await fetch(`${API_URL}/slack/chat/postMessage`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channel: 'C123456',
    text: 'Hello from CODEX INC!'
  })
}).then(r => r.json());
```

---

## Production Deployment

### Environment Variables Required

```env
# GitHub
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Discord
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_BOT_TOKEN=your_discord_bot_token (optional, for advanced features)

# Slack
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# Notion
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret

# Figma
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret

# General
JWT_SECRET=your_jwt_secret
MONGODB_URI=your_mongodb_connection_string
BACKEND_URL=https://api.yourapp.com
FRONTEND_URL=https://yourapp.com
```

### CORS Configuration

Update `server.js` for production:

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
```

### HTTPS Required

All OAuth callbacks must use HTTPS in production.

---

## Support

For issues or questions:
1. Check error messages in browser console
2. Check backend logs
3. Verify integration is connected in Settings
4. Check API rate limits
5. Ensure tokens haven't expired

---

**Last Updated**: January 2026  
**API Version**: 1.0  
**Documentation Version**: 1.0
