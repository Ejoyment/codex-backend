# CODEX INC - Enterprise Features Documentation

## Overview
This document describes the advanced enterprise features implemented in CODEX INC, including the Pricing & Revenue Engine, Unified Communication Suite, and Advanced Code Intelligence.

---

## 1. Pricing & Revenue Engine

### Subscription Tiers

#### Freebie Tier ($0/month)
**Target Audience**: Tech Twelve students and individual developers

**Features**:
- ✅ Local Repositories
- ✅ Discord Sync
- ❌ Advanced Analytics
- ❌ AI Code Review
- ❌ Video Stand-ups
- ❌ Collaborative Editing
- ❌ SOC 2 Compliance
- ❌ Dedicated Support

#### Professional Tier ($25/user/month)
**Target Audience**: Professional developers and small teams

**Features**:
- ✅ Everything in Freebie
- ✅ Advanced Analytics
- ✅ AI Code Review
- ✅ Video Stand-ups
- ✅ Collaborative Editing
- ❌ SOC 2 Compliance
- ❌ Dedicated Support

#### Enterprise Tier (Custom Pricing)
**Target Audience**: Large organizations and enterprises

**Features**:
- ✅ Everything in Professional
- ✅ SOC 2 Compliance Logging
- ✅ Dedicated Account Management
- ✅ Custom Integrations
- ✅ Priority Feature Requests
- ✅ SLA Guarantees

### API Endpoints

#### Get Current Subscription
```
GET /api/subscription/current
Authorization: Bearer <token>

Response:
{
  "success": true,
  "subscription": {
    "tier": "freebie",
    "status": "active",
    "features": {
      "localRepositories": true,
      "discordSync": true,
      "advancedAnalytics": false,
      ...
    },
    "pricing": {
      "amount": 0,
      "currency": "USD",
      "interval": "monthly"
    }
  }
}
```

#### Upgrade Subscription
```
POST /api/subscription/upgrade
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "tier": "professional",
  "paymentProvider": "stripe",
  "paymentId": "pi_xxx",
  "customerId": "cus_xxx"
}

Response:
{
  "success": true,
  "message": "Successfully upgraded to professional tier",
  "subscription": { ... }
}
```

#### Cancel Subscription
```
POST /api/subscription/cancel
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Subscription cancelled successfully",
  "subscription": {
    "tier": "freebie",
    "status": "cancelled",
    "cancelledAt": "2026-01-24T..."
  }
}
```

### Feature-Gate Middleware

The subscription system includes middleware to protect routes based on features:

```javascript
const { requireFeature, requireTier } = require('./middleware/subscription');

// Protect by specific feature
router.get('/analytics', requireFeature('advancedAnalytics'), (req, res) => {
  // Only accessible to Professional+ users
});

// Protect by tier level
router.get('/compliance', requireTier('enterprise'), (req, res) => {
  // Only accessible to Enterprise users
});
```

### Payment Integration

#### Stripe Integration
- Webhook endpoint: `/api/subscription/payment/stripe`
- Handles: `checkout.session.completed`, `customer.subscription.deleted`

#### Paystack Integration
- Webhook endpoint: `/api/subscription/payment/paystack`
- Handles: `charge.success`

---

## 2. Unified Communication Suite

### Video Stand-ups (`standup.html`)

**Features**:
- WebRTC-based video/audio calls
- Screen sharing capability
- Real-time participant list
- Integrated text chat
- Session timer
- Room ID generation

**Access Requirements**: Professional tier or higher

**Usage**:
1. Navigate to Stand-ups from dashboard
2. System checks subscription tier
3. Camera/microphone permissions requested
4. Join room with generated Room ID
5. Share Room ID with team members

**Controls**:
- 🎥 Toggle Video
- 🎤 Toggle Audio
- 🖥️ Share Screen
- 📞 Leave Call
- 💬 Toggle Chat

**Technical Implementation**:
```javascript
// Access check
const hasAccess = await checkAccess();
if (!hasAccess) {
  alert('Video Stand-ups require Professional tier or higher');
  window.location.href = 'pricing.html';
  return;
}

// Initialize WebRTC
localStream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});
```

---

## 3. Advanced Code Intelligence

### Code Editor (`editor.html`)

**Features**:
- Monaco Editor (VS Code engine)
- Syntax highlighting for 50+ languages
- Real-time collaborative editing
- AI-powered code review
- Code execution (JavaScript)
- Auto-save functionality
- Format on type/paste
- Line/column tracking

**Access Requirements**: Professional tier or higher

**Supported Languages**:
- JavaScript
- TypeScript
- Python
- Java
- C++
- HTML
- CSS
- JSON

**AI Code Review**:
The AI review system provides:
- ⚠️ Warnings: Potential issues and bugs
- ℹ️ Info: Code style suggestions
- ✅ Success: Best practices detected

**Usage**:
1. Navigate to Code Editor from dashboard
2. Select programming language
3. Write code with syntax highlighting
4. Click "AI Review" for automated analysis
5. Click "Run" to execute JavaScript code
6. Click "Save" to download code

**Technical Implementation**:
```javascript
// Monaco Editor initialization
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor-container'), {
    value: '// Your code here',
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: true },
    formatOnPaste: true,
    formatOnType: true
  });
});
```

---

## 4. Dashboard Integration

### Subscription Badge
The dashboard displays the current subscription tier in the sidebar:
- **Freebie**: Gray badge
- **Professional**: Blue badge with crown icon
- **Enterprise**: Purple badge with crown icon

### Navigation Links
New navigation items added:
- 📝 Code Editor
- 🎥 Stand-ups
- 💰 Pricing

---

## 5. Security & Access Control

### Feature Access Flow
1. User attempts to access protected feature
2. Frontend checks localStorage for JWT token
3. API call to `/api/subscription/current`
4. Backend verifies token and checks subscription
5. If unauthorized, redirect to pricing page
6. If authorized, grant access to feature

### Middleware Protection
```javascript
// Example: Protecting a route
router.get('/protected-feature', 
  requireFeature('aiCodeReview'), 
  async (req, res) => {
    // Feature logic here
    // req.subscription contains user's subscription
    // req.userId contains authenticated user ID
  }
);
```

---

## 6. Database Schema

### Subscription Model
```javascript
{
  userId: ObjectId (ref: User),
  tier: String (enum: ['freebie', 'professional', 'enterprise']),
  status: String (enum: ['active', 'cancelled', 'expired', 'trial']),
  features: {
    localRepositories: Boolean,
    discordSync: Boolean,
    advancedAnalytics: Boolean,
    aiCodeReview: Boolean,
    soc2Compliance: Boolean,
    dedicatedSupport: Boolean,
    videoStandups: Boolean,
    collaborativeEditing: Boolean
  },
  pricing: {
    amount: Number,
    currency: String,
    interval: String
  },
  paymentProvider: String,
  paymentId: String,
  customerId: String,
  startDate: Date,
  endDate: Date,
  metadata: {
    teamSize: Number,
    companyName: String,
    accountManager: String
  }
}
```

---

## 7. Testing

### Test Subscription Upgrade
1. Sign in to your account
2. Navigate to Pricing page
3. Click "Upgrade Now" on Professional tier
4. Check dashboard for updated badge
5. Try accessing Code Editor or Stand-ups

### Test Feature Access
```javascript
// In browser console
const token = localStorage.getItem('authToken');

// Check current subscription
fetch('http://localhost:3000/api/subscription/current', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(console.log);

// Upgrade to professional
fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tier: 'professional', paymentProvider: 'manual' })
})
.then(r => r.json())
.then(console.log);
```

---

## 8. Future Enhancements

### Phase 2 (Planned)
- Real-time collaborative editing with WebSockets
- Actual AI integration (OpenAI/Claude API)
- Full Stripe/Paystack payment flow
- Team management features
- Usage analytics dashboard
- SOC 2 compliance logging
- Custom integrations API

### Phase 3 (Planned)
- Mobile app (Flutter)
- Desktop app (Electron)
- VS Code extension
- GitHub integration
- Slack/Discord bot
- CI/CD pipeline integration

---

## 9. Troubleshooting

### Issue: "Video Stand-ups require Professional tier"
**Solution**: Upgrade to Professional tier from Pricing page

### Issue: "Code Editor requires Professional tier"
**Solution**: Upgrade to Professional tier from Pricing page

### Issue: Camera/Microphone not working
**Solution**: Check browser permissions for camera/microphone access

### Issue: Subscription not updating
**Solution**: 
1. Clear browser cache
2. Sign out and sign in again
3. Check backend logs for errors

---

## 10. Contact & Support

- **Freebie Tier**: Community support via Discord
- **Professional Tier**: Email support (response within 24 hours)
- **Enterprise Tier**: Dedicated account manager + priority support

**Email**: support@codexinc.com
**Discord**: discord.gg/codexinc

---

*Last Updated: January 24, 2026*
