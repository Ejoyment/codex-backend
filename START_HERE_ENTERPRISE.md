# 🚀 CODEX INC - Enterprise Features - START HERE

## Welcome to Phase 2! 🎉

You now have a complete enterprise-grade subscription system with advanced features. This guide will get you up and running in 5 minutes.

---

## ⚡ Quick Start (5 Minutes)

### Step 1: Start the Backend
```bash
start-backend.bat
```

Wait for:
```
✓ MongoDB connected successfully
🚀 Server running on port 3000
```

### Step 2: Sign In
1. Open your browser
2. Navigate to `sign_in.html`
3. Sign in with your account (or create a new one)

### Step 3: Check Your Subscription
Look at the dashboard sidebar (bottom left). You'll see a **gray badge** saying "Freebie" - that's your current tier!

### Step 4: Upgrade to Professional
Open browser console (F12) and run:
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

### Step 5: Refresh & Explore
1. Refresh the dashboard (Ctrl+Shift+R)
2. Badge should now be **blue** with "Professional"
3. Click "Code Editor" in the sidebar
4. Click "Stand-ups" to try video calls

**That's it! You're now using enterprise features!** 🎊

---

## 🎯 What You Can Do Now

### 1. Code Editor
- Write code in 50+ languages
- Get AI code review suggestions
- Run JavaScript code
- Auto-save your work
- Download your files

**Access**: Professional tier or higher

### 2. Video Stand-ups
- Start video/audio calls
- Share your screen
- Chat with team members
- See participant list
- Track session time

**Access**: Professional tier or higher

### 3. Pricing Page
- View all subscription tiers
- Compare features
- Upgrade your account
- See feature matrix

**Access**: Everyone

---

## 💰 Subscription Tiers Explained

### 🆓 Freebie ($0/month)
**Perfect for students and learning**

What you get:
- ✅ Local Repositories
- ✅ Discord Sync
- ❌ Code Editor
- ❌ Video Stand-ups
- ❌ AI Code Review

### 💼 Professional ($25/user/month)
**For professional developers**

What you get:
- ✅ Everything in Freebie
- ✅ Code Editor (Monaco)
- ✅ Video Stand-ups
- ✅ AI Code Review
- ✅ Advanced Analytics
- ✅ Collaborative Editing

### 🏢 Enterprise (Custom Pricing)
**For large organizations**

What you get:
- ✅ Everything in Professional
- ✅ SOC 2 Compliance
- ✅ Dedicated Support
- ✅ Custom Integrations
- ✅ Priority Features
- ✅ SLA Guarantees

---

## 🎮 Try These Features

### Test Code Editor
1. Click "Code Editor" in sidebar
2. Write some JavaScript:
   ```javascript
   function greet(name) {
       console.log(`Hello, ${name}!`);
   }
   greet("CODEX");
   ```
3. Click "Run" to execute
4. Click "AI Review" for suggestions
5. Change language to Python
6. Click "Save" to download

### Test Video Stand-ups
1. Click "Stand-ups" in sidebar
2. Allow camera/microphone access
3. See your video feed
4. Try these controls:
   - 🎥 Toggle video
   - 🎤 Toggle audio
   - 🖥️ Share screen
   - 💬 Open chat
   - 📞 Leave call

### Test Subscription Management
1. Click "Pricing" in sidebar
2. View all tiers
3. See feature comparison
4. Try upgrading/downgrading

---

## 🔧 Useful Commands

### Check Current Subscription
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
  body: JSON.stringify({ 
    tier: 'enterprise', 
    paymentProvider: 'manual',
    metadata: {
      companyName: 'Your Company',
      teamSize: 50
    }
  })
}).then(r => r.json()).then(console.log);
```

### Cancel Subscription
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:3000/api/subscription/cancel', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

---

## 🎨 Visual Guide

### Dashboard Badge Colors
- **Gray Badge** = Freebie tier
- **Blue Badge with Crown** 👑 = Professional tier
- **Purple Badge with Crown** 👑 = Enterprise tier

### Access Control
When you try to access a premium feature without the right tier:
1. You'll see an alert: "This feature requires Professional tier"
2. You'll be redirected to the pricing page
3. Upgrade your tier to access the feature

---

## 📚 Documentation

### Quick Guides
- **This File** - Start here!
- `QUICK_REFERENCE.md` - Quick command reference
- `TEST_FEATURES.md` - Step-by-step testing guide

### Complete Documentation
- `ENTERPRISE_FEATURES.md` - Full technical documentation
- `IMPLEMENTATION_SUMMARY.md` - What was implemented
- `CURRENT_STATUS.md` - Project status

### Troubleshooting
- `TROUBLESHOOTING.md` - Common issues
- `EMAIL_FIX.md` - Email problems
- `DEBUG_SIGNIN.md` - Sign-in issues

---

## 🐛 Common Issues

### "Authentication required"
**Solution**: Sign in again, your token may have expired

### "No active subscription found"
**Solution**: Run the upgrade command to create a subscription

### Camera/Microphone not working
**Solution**: 
1. Check browser permissions
2. Make sure you're on localhost or HTTPS
3. Try a different browser

### Badge not updating
**Solution**: Clear cache with Ctrl+Shift+R

### Monaco Editor not loading
**Solution**: Check internet connection (requires CDN)

---

## 🎯 What's Next?

### Immediate Next Steps
1. ✅ Test all subscription tiers
2. ✅ Try the code editor
3. ✅ Try video stand-ups
4. ✅ Test upgrade/downgrade flows

### Future Enhancements
- 🔲 Real Stripe/Paystack payment integration
- 🔲 Real-time collaborative editing
- 🔲 Actual AI API integration (OpenAI/Claude)
- 🔲 Team management features
- 🔲 Usage analytics dashboard

---

## 💡 Pro Tips

1. **Use Ctrl+Shift+R** to hard refresh after changes
2. **Check browser console** for detailed error messages
3. **Test in incognito mode** if you see caching issues
4. **Use the pricing page** for easy tier upgrades
5. **Read ENTERPRISE_FEATURES.md** for complete details

---

## 🎊 You're All Set!

You now have:
- ✅ Complete subscription system
- ✅ Professional code editor
- ✅ Video conferencing platform
- ✅ Feature-gated access control
- ✅ Beautiful pricing page
- ✅ Comprehensive documentation

**Start exploring and building amazing things!** 🚀

---

## 📞 Need Help?

1. Check `TROUBLESHOOTING.md`
2. Check `TEST_FEATURES.md`
3. Check `ENTERPRISE_FEATURES.md`
4. Check browser console for errors
5. Check backend logs

---

## 🌟 Key Features at a Glance

| Feature | Freebie | Professional | Enterprise |
|---------|---------|--------------|------------|
| Local Repos | ✅ | ✅ | ✅ |
| Discord Sync | ✅ | ✅ | ✅ |
| Code Editor | ❌ | ✅ | ✅ |
| Video Calls | ❌ | ✅ | ✅ |
| AI Review | ❌ | ✅ | ✅ |
| Analytics | ❌ | ✅ | ✅ |
| SOC 2 | ❌ | ❌ | ✅ |
| Support | ❌ | ❌ | ✅ |

---

**Happy Coding!** 💻✨

*Last Updated: January 24, 2026*
