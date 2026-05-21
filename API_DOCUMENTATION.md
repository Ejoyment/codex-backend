# CODEX INC - API DOCUMENTATION

**Base URL:** `https://codex-backend-7utu.onrender.com`

---

## 📋 TABLE OF CONTENTS

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [AI Pair Programming](#ai-pair-programming)
4. [Team Collaboration](#team-collaboration)
5. [Integrations](#integrations)
6. [Subscription & Billing](#subscription--billing)
7. [Support System](#support-system)
8. [Meetings](#meetings)
9. [Health Check](#health-check)

---

## 🔐 AUTHENTICATION

### Sign Up
```http
POST /api/auth/signup
Content-Type: application/json

{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123"
}

Response:
{
  "success": true,
  "message": "Signup successful. Please verify your email.",
  "userId": "6476a1c2d4e5f1a2b3c4d5e6"
}
```

### Sign In
```http
POST /api/auth/signin
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePassword123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "6476a1c2d4e5f1a2b3c4d5e6",
    "fullName": "John Doe",
    "email": "john@example.com",
    "isVerified": false
  }
}
```

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "user": {
    "id": "6476a1c2d4e5f1a2b3c4d5e6",
    "fullName": "John Doe",
    "email": "john@example.com",
    "profilePicture": "https://...",
    "isVerified": true,
    "subscription": {
      "tier": "professional",
      "status": "active"
    }
  }
}
```

---

## 👤 USER MANAGEMENT

### Upload Profile Picture
```http
POST /api/auth/upload-photo
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- profilePicture: <file>

Response:
{
  "success": true,
  "profilePicture": "https://codex-backend-7utu.onrender.com/uploads/..."
}
```

### Update Profile
```http
PUT /api/auth/update-profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "fullName": "John Doe Updated",
  "bio": "Full-stack developer",
  "title": "Senior Engineer",
  "phone": "+1-555-0123",
  "location": "San Francisco, CA"
}

Response:
{
  "success": true,
  "message": "Profile updated successfully",
  "user": { ... }
}
```

### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "oldPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}

Response:
{
  "success": true,
  "message": "Password changed successfully"
}
```

### Delete Account
```http
DELETE /api/auth/delete-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "CurrentPassword123"
}

Response:
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

## 🤖 AI PAIR PROGRAMMING

### Create AI Pair Session
```http
POST /api/ai-pair/session
Authorization: Bearer <token>
Content-Type: application/json

{
  "repositoryId": "12345",
  "repositoryName": "my-project",
  "description": "Help me debug this auth flow"
}

Response:
{
  "success": true,
  "session": {
    "id": "sess_7f8a9b0c1d2e3f4g",
    "repository": "my-project",
    "createdAt": "2024-05-21T10:30:00Z",
    "status": "active"
  }
}
```

### Chat with AI Pair Programmer
```http
POST /api/ai-pair/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "sess_7f8a9b0c1d2e3f4g",
  "message": "Why is this authentication token not working?",
  "context": {
    "file": "auth.js",
    "language": "javascript"
  }
}

Response:
{
  "success": true,
  "reply": "Looking at your auth.js file, I notice the JWT verification is missing the secret key. Here's the fix: ...",
  "suggestions": [
    {
      "type": "code_fix",
      "language": "javascript",
      "code": "const decoded = jwt.verify(token, process.env.JWT_SECRET);"
    }
  ],
  "usage": {
    "messagesUsedToday": 5,
    "dailyLimit": 100
  }
}
```

### Commit Code Changes
```http
POST /api/ai-pair/commit
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "sess_7f8a9b0c1d2e3f4g",
  "changes": [
    {
      "file": "auth.js",
      "additions": 15,
      "deletions": 3
    }
  ],
  "message": "Fix JWT verification in authentication flow"
}

Response:
{
  "success": true,
  "commit": {
    "hash": "a1b2c3d4e5f6g7h8",
    "message": "Fix JWT verification in authentication flow",
    "url": "https://github.com/user/repo/commit/a1b2c3d4e5f6g7h8"
  }
}
```

### Get Available Repositories
```http
GET /api/ai-pair/repos
Authorization: Bearer <token>

Response:
{
  "success": true,
  "repositories": [
    {
      "id": "12345",
      "name": "my-project",
      "url": "https://github.com/user/my-project",
      "language": "javascript",
      "lastUpdated": "2024-05-20T15:30:00Z"
    }
  ],
  "total": 5
}
```

---

## 👥 TEAM COLLABORATION

### Create Team Project
```http
POST /api/company
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Tech Startup Inc",
  "description": "Building the future",
  "industry": "Software Development"
}

Response:
{
  "success": true,
  "company": {
    "id": "comp_abc123",
    "name": "Tech Startup Inc",
    "owner": "6476a1c2d4e5f1a2b3c4d5e6"
  }
}
```

### Invite Team Member
```http
POST /api/invitations
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "teammate@example.com",
  "role": "developer",
  "companyId": "comp_abc123"
}

Response:
{
  "success": true,
  "invitation": {
    "id": "inv_def456",
    "email": "teammate@example.com",
    "status": "pending",
    "expiresAt": "2024-05-28T10:30:00Z"
  }
}
```

### Send Team Message
```http
POST /api/messaging
Authorization: Bearer <token>
Content-Type: application/json

{
  "channelId": "chan_ghi789",
  "message": "Let's sync on the auth implementation",
  "mentions": ["6476a1c2d4e5f1a2b3c4d5e6"]
}

Response:
{
  "success": true,
  "message": {
    "id": "msg_jkl012",
    "content": "Let's sync on the auth implementation",
    "author": "6476a1c2d4e5f1a2b3c4d5e6",
    "createdAt": "2024-05-21T10:35:00Z"
  }
}
```

### Get Team Activity
```http
GET /api/dashboard
Authorization: Bearer <token>

Response:
{
  "success": true,
  "activity": [
    {
      "id": "act_mno345",
      "user": "John Doe",
      "action": "pushed code to main branch",
      "timestamp": "2024-05-21T10:30:00Z"
    }
  ]
}
```

---

## 🔗 INTEGRATIONS

### List User Integrations
```http
GET /api/integrations
Authorization: Bearer <token>

Response:
{
  "success": true,
  "integrations": [
    {
      "provider": "github",
      "isActive": true,
      "providerUsername": "johndoe",
      "lastSyncedAt": "2024-05-21T09:15:00Z"
    },
    {
      "provider": "discord",
      "isActive": true,
      "lastSyncedAt": "2024-05-21T10:00:00Z"
    }
  ]
}
```

### GitHub Integration
```http
GET /api/integrations/github/auth
Authorization: Bearer <token>

Response:
{
  "success": true,
  "authUrl": "https://github.com/login/oauth/authorize?client_id=..."
}
```

### Discord Integration
```http
GET /api/integrations/discord/auth
Authorization: Bearer <token>

Response:
{
  "success": true,
  "authUrl": "https://discord.com/oauth/authorize?client_id=..."
}
```

### Slack Integration
```http
GET /api/integrations/slack/auth
Authorization: Bearer <token>

Response:
{
  "success": true,
  "authUrl": "https://slack.com/oauth/v2/authorize?client_id=..."
}
```

### Notion Integration
```http
GET /api/integrations/notion/auth
Authorization: Bearer <token>

Response:
{
  "success": true,
  "authUrl": "https://api.notion.com/oauth/authorize?client_id=..."
}
```

### Figma Integration
```http
GET /api/integrations/figma/auth
Authorization: Bearer <token>

Response:
{
  "success": true,
  "authUrl": "https://www.figma.com/oauth?client_id=..."
}
```

### Disconnect Integration
```http
DELETE /api/integrations/slack/disconnect
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Slack integration disconnected"
}
```

---

## 💳 SUBSCRIPTION & BILLING

### Get Current Subscription
```http
GET /api/subscription/current
Authorization: Bearer <token>

Response:
{
  "success": true,
  "subscription": {
    "tier": "professional",
    "status": "active",
    "nextBillingDate": "2024-06-21",
    "features": {
      "aiCodeReview": true,
      "collaborativeEditing": true,
      "dedicatedSupport": false,
      "soc2Compliance": false
    }
  }
}
```

### Create Checkout (Stripe)
```http
POST /api/subscription/create-checkout
Authorization: Bearer <token>
Content-Type: application/json

{
  "tier": "professional",
  "interval": "monthly"
}

Response:
{
  "success": true,
  "sessionUrl": "https://checkout.stripe.com/pay/cs_live_abc123..."
}
```

### Upgrade Subscription
```http
POST /api/subscription/upgrade
Authorization: Bearer <token>
Content-Type: application/json

{
  "tier": "enterprise"
}

Response:
{
  "success": true,
  "message": "Upgraded to enterprise tier",
  "subscription": { ... }
}
```

### Cancel Subscription
```http
POST /api/subscription/cancel
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Subscription cancelled",
  "cancelledAt": "2024-05-21T10:40:00Z"
}
```

### Billing Portal
```http
POST /api/subscription/portal
Authorization: Bearer <token>

Response:
{
  "success": true,
  "portalUrl": "https://billing.stripe.com/..."
}
```

---

## 🎫 SUPPORT SYSTEM

### Create Support Ticket
```http
POST /api/support/tickets
Authorization: Bearer <token>
Content-Type: application/json

{
  "subject": "AI pair programming not responding",
  "description": "The AI assistant stopped responding after 2 messages",
  "priority": "high",
  "category": "technical"
}

Response:
{
  "success": true,
  "ticket": {
    "id": "tick_pqr678",
    "subject": "AI pair programming not responding",
    "status": "open",
    "createdAt": "2024-05-21T10:45:00Z"
  }
}
```

### Support Agent Login
```http
POST /api/support/agent/login
Content-Type: application/json

{
  "email": "agent@codex.inc",
  "password": "AgentPassword123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "agent": {
    "id": "agent_stu901",
    "name": "Support Agent",
    "role": "support",
    "status": "online"
  }
}
```

### Get Support Tickets (Agent)
```http
GET /api/support/tickets?status=open
Authorization: Bearer <agent_token>

Response:
{
  "success": true,
  "tickets": [
    {
      "id": "tick_pqr678",
      "subject": "AI pair programming not responding",
      "customer": "John Doe",
      "priority": "high",
      "status": "open",
      "createdAt": "2024-05-21T10:45:00Z"
    }
  ]
}
```

---

## 📞 MEETINGS

### Create Meeting
```http
POST /api/meetings
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Weekly Standup",
  "description": "Team sync on project progress",
  "companyId": "comp_abc123",
  "scheduledAt": "2024-05-22T10:00:00Z",
  "duration": 30,
  "participants": ["6476a1c2d4e5f1a2b3c4d5e6"]
}

Response:
{
  "success": true,
  "meeting": {
    "id": "meet_vwx234",
    "title": "Weekly Standup",
    "roomId": "a1b2c3d4e5f6g7h8",
    "status": "scheduled",
    "scheduledAt": "2024-05-22T10:00:00Z"
  }
}
```

### Get User Meetings
```http
GET /api/meetings?companyId=comp_abc123&upcoming=true
Authorization: Bearer <token>

Response:
{
  "success": true,
  "meetings": [
    {
      "id": "meet_vwx234",
      "title": "Weekly Standup",
      "scheduledAt": "2024-05-22T10:00:00Z",
      "host": "John Doe",
      "status": "scheduled"
    }
  ]
}
```

---

## ❤️ HEALTH CHECK

### Service Health
```http
GET /
Response:
{
  "status": "OK",
  "name": "CODEX INC Backend",
  "message": "Enterprise AI Developer Platform API",
  "version": "1.0.0",
  "endpoints": {
    "health": "/api/health",
    "auth": "/api/auth",
    "subscription": "/api/subscription",
    "integrations": "/api/integrations",
    "aiPair": "/api/ai-pair",
    "support": "/api/support"
  }
}
```

### API Health Status
```http
GET /api/health
Response:
{
  "status": "OK",
  "message": "CODEX INC Backend is running",
  "timestamp": "2024-05-21T10:50:00Z"
}
```

---

## 🔑 AUTHENTICATION HEADERS

All endpoints (except auth) require:
```
Authorization: Bearer <jwt_token>
```

Get token from:
- `POST /api/auth/signup` (sign up)
- `POST /api/auth/signin` (sign in)

---

## 📊 ERROR RESPONSES

All errors follow this format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "ErrorCode"
}
```

Common HTTP Status Codes:
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Server Error

---

## 🚀 RATE LIMITING

- **Free Tier**: 10 requests/minute
- **Pro Tier**: 100 requests/minute
- **Enterprise**: Unlimited

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1621660800
```

---

## 📦 RESPONSE FORMATS

All responses are JSON:
```
Content-Type: application/json
```

---

## 🔒 SECURITY

- All endpoints use HTTPS
- JWT tokens expire after 24 hours
- Passwords are bcrypt hashed
- CORS enabled for approved origins
- Rate limiting to prevent abuse
- Input validation on all endpoints

---

## 📞 SUPPORT

For API support:
- Email: `api-support@codexinc.com`
- Documentation: `/api/docs`
- Status Page: `https://status.codexinc.com`

---

**Last Updated**: May 21, 2026
**API Version**: 1.0.0
