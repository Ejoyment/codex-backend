# Testing Enterprise Features - Quick Guide

## Prerequisites
1. Backend server running on port 3000
2. MongoDB connected
3. User account created and signed in

---

## Step 1: Start the Backend

```bash
# Run this command
start-backend.bat
```

You should see:
```
✓ MongoDB connected successfully
🚀 Server running on port 3000
```

---

## Step 2: Sign In

1. Open `sign_in.html` in your browser
2. Sign in with your credentials
3. You'll be redirected to the dashboard

---

## Step 3: Check Your Subscription

### In the Dashboard:
- Look at the sidebar (bottom left)
- You should see a gray badge saying "Freebie"

### Via Browser Console:
```javascript
const token = localStorage.getItem('authToken');

fetch('http://localhost:3000/api/subscription/current', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => console.log('Current subscription:', data));
```

Expected output:
```json
{
  "success": true,
  "subscription": {
    "tier": "freebie",
    "status": "active",
    "features": {
      "localRepositories": true,
      "discordSync": true,
      "advancedAnalytics": false,
      "aiCodeReview": false,
      "videoStandups": false,
      "collaborativeEditing": false
    }
  }
}
```

---

## Step 4: Try Accessing Premium Features (Should Fail)

### Test Code Editor:
1. Click "Code Editor" in the sidebar
2. You should see: "Code Editor requires Professional tier or higher"
3. You'll be redirected to the pricing page

### Test Video Stand-ups:
1. Click "Stand-ups" in the sidebar
2. You should see: "Video Stand-ups require Professional tier or higher"
3. You'll be redirected to the pricing page

---

## Step 5: Upgrade to Professional Tier

### Method 1: Via Pricing Page
1. Click "Pricing" in the sidebar
2. Click "Upgrade Now" on the Professional tier card
3. You should see: "Successfully upgraded to Professional tier!"
4. You'll be redirected to the dashboard

### Method 2: Via Browser Console
```javascript
const token = localStorage.getItem('authToken');

fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'professional',
    paymentProvider: 'manual'
  })
})
.then(r => r.json())
.then(data => console.log('Upgrade result:', data));
```

Expected output:
```json
{
  "success": true,
  "message": "Successfully upgraded to professional tier",
  "subscription": {
    "tier": "professional",
    "status": "active",
    "features": {
      "localRepositories": true,
      "discordSync": true,
      "advancedAnalytics": true,
      "aiCodeReview": true,
      "videoStandups": true,
      "collaborativeEditing": true
    }
  }
}
```

---

## Step 6: Verify Upgrade

### Check Dashboard Badge:
1. Refresh the dashboard (Ctrl+Shift+R)
2. Look at the sidebar badge
3. It should now be BLUE and say "Professional" with a crown icon

---

## Step 7: Test Code Editor (Should Work Now)

1. Click "Code Editor" in the sidebar
2. You should see the Monaco Editor interface
3. Try these features:

### Write Some Code:
```javascript
function greet(name) {
    console.log(`Hello, ${name}!`);
}

greet("CODEX");
```

### Test Features:
- **Format Code**: Click the "Format" button
- **Run Code**: Click the "Run" button (console will appear at bottom)
- **AI Review**: Click "AI Review" button (panel opens on right)
- **Change Language**: Select "Python" from dropdown
- **Save Code**: Click "Save" to download

---

## Step 8: Test Video Stand-ups (Should Work Now)

1. Click "Stand-ups" in the sidebar
2. Allow camera/microphone permissions when prompted
3. You should see:
   - Your video feed in the main area
   - Room ID displayed at the top
   - Participant list on the left
   - Control buttons at the bottom

### Test Features:
- **Toggle Video**: Click the video button (should turn red when off)
- **Toggle Audio**: Click the microphone button
- **Share Screen**: Click the screen share button
- **Chat**: Click the chat button (sidebar opens on right)
- **Leave Call**: Click the red phone button

---

## Step 9: Test Subscription Cancellation

### Via Browser Console:
```javascript
const token = localStorage.getItem('authToken');

fetch('http://localhost:3000/api/subscription/cancel', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => console.log('Cancel result:', data));
```

Expected output:
```json
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

### Verify:
1. Refresh dashboard
2. Badge should be gray again ("Freebie")
3. Try accessing Code Editor - should be blocked again

---

## Step 10: Test Enterprise Tier

### Upgrade to Enterprise:
```javascript
const token = localStorage.getItem('authToken');

fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tier: 'enterprise',
    paymentProvider: 'manual',
    metadata: {
      companyName: 'CODEX INC',
      teamSize: 50,
      accountManager: 'John Doe'
    }
  })
})
.then(r => r.json())
.then(data => console.log('Enterprise upgrade:', data));
```

### Verify:
1. Refresh dashboard
2. Badge should be PURPLE ("Enterprise")
3. All features should be accessible

---

## Common Issues & Solutions

### Issue: "Authentication required"
**Solution**: Make sure you're signed in and have a valid token in localStorage

### Issue: "No active subscription found"
**Solution**: 
```javascript
// Create subscription manually
const token = localStorage.getItem('authToken');

fetch('http://localhost:3000/api/subscription/upgrade', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tier: 'freebie', paymentProvider: 'manual' })
})
.then(r => r.json())
.then(console.log);
```

### Issue: Camera/Microphone not working
**Solution**: 
1. Check browser permissions
2. Make sure you're using HTTPS or localhost
3. Try a different browser

### Issue: Monaco Editor not loading
**Solution**:
1. Check internet connection (CDN required)
2. Clear browser cache
3. Check browser console for errors

---

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscription/current` | GET | Get current subscription |
| `/api/subscription/upgrade` | POST | Upgrade subscription tier |
| `/api/subscription/cancel` | POST | Cancel subscription |
| `/api/subscription/payment/stripe` | POST | Stripe webhook |
| `/api/subscription/payment/paystack` | POST | Paystack webhook |

---

## Feature Access Matrix

| Feature | Freebie | Professional | Enterprise |
|---------|---------|--------------|------------|
| Local Repositories | ✅ | ✅ | ✅ |
| Discord Sync | ✅ | ✅ | ✅ |
| Advanced Analytics | ❌ | ✅ | ✅ |
| AI Code Review | ❌ | ✅ | ✅ |
| Video Stand-ups | ❌ | ✅ | ✅ |
| Collaborative Editing | ❌ | ✅ | ✅ |
| SOC 2 Compliance | ❌ | ❌ | ✅ |
| Dedicated Support | ❌ | ❌ | ✅ |

---

## Next Steps

1. ✅ Test all subscription tiers
2. ✅ Test feature access control
3. ✅ Test Code Editor features
4. ✅ Test Video Stand-ups
5. ✅ Test subscription upgrade/cancel
6. 📝 Integrate real payment providers (Stripe/Paystack)
7. 📝 Add real-time collaboration (WebSockets)
8. 📝 Integrate actual AI API (OpenAI/Claude)

---

*Happy Testing! 🚀*
