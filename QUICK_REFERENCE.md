# CODEX INC - Quick Reference Guide

## 🚀 Getting Started (5 Minutes)

### 1. Start Backend
```bash
start-backend.bat
```

### 2. Open Browser
Navigate to: `http://localhost:5500/sign_in.html`

### 3. Sign In
Use your existing account or create a new one

---

## 📋 Quick Commands

### Check Your Subscription
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:3000/api/subscription/current', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

### Upgrade to Professional
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tier: 'professional', paymentProvider: 'manual' })
}).then(r => r.json()).then(console.log);
```

### Upgrade to Enterprise
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tier: 'enterprise', paymentProvider: 'manual' })
}).then(r => r.json()).then(console.log);
```

---

## 🎯 Feature Access

| Feature | Freebie | Professional | Enterprise |
|---------|---------|--------------|------------|
| Local Repos | ✅ | ✅ | ✅ |
| Discord Sync | ✅ | ✅ | ✅ |
| Code Editor | ❌ | ✅ | ✅ |
| Video Stand-ups | ❌ | ✅ | ✅ |
| AI Code Review | ❌ | ✅ | ✅ |
| Analytics | ❌ | ✅ | ✅ |
| SOC 2 | ❌ | ❌ | ✅ |
| Dedicated Support | ❌ | ❌ | ✅ |

---

## 🔗 Important URLs

- **Sign In**: `sign_in.html`
- **Sign Up**: `signup.html`
- **Dashboard**: `dashboard.html`
- **Pricing**: `pricing.html`
- **Code Editor**: `editor.html`
- **Video Stand-ups**: `standup.html`
- **Profile**: `profile.html`
- **Settings**: `settings.html`

---

## 🛠️ API Endpoints

### Authentication
```
POST /api/auth/signup          - Create account
POST /api/auth/signin          - Sign in
GET  /api/auth/google          - Google OAuth
GET  /api/auth/facebook        - Facebook OAuth
GET  /api/auth/me              - Get current user
```

### OTP
```
POST /api/otp/send             - Send OTP
POST /api/otp/verify           - Verify OTP
```

### Subscription
```
GET  /api/subscription/current - Get subscription
POST /api/subscription/upgrade - Upgrade tier
POST /api/subscription/cancel  - Cancel subscription
```

---

## 💰 Pricing

- **Freebie**: $0/month
- **Professional**: $25/user/month
- **Enterprise**: Custom pricing

---

## 🎨 Subscription Badge Colors

- **Freebie**: Gray badge
- **Professional**: Blue badge with crown 👑
- **Enterprise**: Purple badge with crown 👑

---

## 🔐 Testing Access Control

### Test Freebie Tier (Default)
1. Sign in
2. Try to access Code Editor → Should be blocked
3. Try to access Stand-ups → Should be blocked

### Test Professional Tier
1. Upgrade to Professional (see command above)
2. Refresh dashboard (Ctrl+Shift+R)
3. Badge should be blue
4. Code Editor should work
5. Stand-ups should work

### Test Enterprise Tier
1. Upgrade to Enterprise (see command above)
2. Refresh dashboard
3. Badge should be purple
4. All features should work

---

## 🐛 Troubleshooting

### "Authentication required"
→ Sign in again, token may have expired

### "No active subscription found"
→ Run the upgrade command to create subscription

### Camera/Microphone not working
→ Check browser permissions

### Monaco Editor not loading
→ Check internet connection (CDN required)

### Badge not updating
→ Clear cache (Ctrl+Shift+R)

---

## 📚 Documentation

- **Full Documentation**: `ENTERPRISE_FEATURES.md`
- **Testing Guide**: `TEST_FEATURES.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **This Guide**: `QUICK_REFERENCE.md`

---

## 🎓 Key Files

### Backend
- `server.js` - Main server
- `routes/subscription.js` - Subscription API
- `models/Subscription.js` - Subscription model
- `middleware/subscription.js` - Access control

### Frontend
- `pricing.html` - Pricing page
- `editor.html` - Code editor
- `standup.html` - Video calls
- `dashboard.html` - Main dashboard

---

## ⚡ Quick Tips

1. **Always use Ctrl+Shift+R** to refresh after changes
2. **Check browser console** for errors
3. **Use browser DevTools** to inspect API calls
4. **Test in incognito mode** if issues persist
5. **Check backend logs** for server errors

---

## 🎯 Common Tasks

### Add New Feature to Tier
1. Edit `models/Subscription.js`
2. Add feature to `features` object
3. Update `upgradeTo()` method
4. Add to pricing page

### Protect New Route
```javascript
const { requireFeature } = require('./middleware/subscription');

router.get('/new-feature', 
  requireFeature('newFeatureName'), 
  (req, res) => {
    // Your code here
  }
);
```

### Change Pricing
1. Edit `pricing.html`
2. Update tier cards
3. Update `models/Subscription.js` pricing amounts

---

## 📞 Need Help?

1. Check `TROUBLESHOOTING.md`
2. Check `TEST_FEATURES.md`
3. Check `ENTERPRISE_FEATURES.md`
4. Check browser console
5. Check backend logs

---

*Last Updated: January 24, 2026*
