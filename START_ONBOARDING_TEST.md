# 🎯 START HERE - Test Your Onboarding Flow

## 🚀 3 Simple Steps

### Step 1: Run This Command
```bash
test-onboarding.bat your-email@example.com
```

**Example:**
```bash
test-onboarding.bat john@example.com
```

**Don't know your email?** Run this first:
```bash
check-users.bat
```

---

### Step 2: Clear Browser Cache

**Option A: Use Incognito Window** (Recommended)
- Chrome: Press `Ctrl+Shift+N`
- Firefox: Press `Ctrl+Shift+P`
- Edge: Press `Ctrl+Shift+N`

**Option B: Clear Cache**
- Press `Ctrl+Shift+Delete`
- Select "Cached images and files"
- Click "Clear data"

---

### Step 3: Sign In

1. Go to: http://localhost:5500/sign_in.html
2. Enter your email and password
3. Click "Sign In"

**You should now see the onboarding flow!** 🎉

---

## 🎨 What You'll See

### Step 1: Welcome Screen
- Enter your name
- Enter company (optional)
- Select team size
- Click "Next"

### Step 2: Role Selection
- Click on roles to select (can select multiple!)
- Available: CEO, Designer, Developer, Product Manager, Marketing, Executive
- Click "Next"

### Step 3: Goals
- Check your goals (can select multiple!)
- Click "Next"

### Step 4: Complete
- Review your information
- Click "Go to Dashboard"

### Dashboard
- Your role should appear in the header!
- Your role should appear in the sidebar!

---

## ✅ Verification

After completing onboarding:

1. **Check Dashboard**
   - Header should show your role(s)
   - Sidebar should show your role(s)

2. **Check Settings**
   - Go to Settings page
   - Should show your role(s)

3. **Test Persistence**
   - Sign out
   - Sign in again
   - Should skip onboarding
   - Should go directly to dashboard

---

## 🆘 Troubleshooting

### Backend Not Running?
```bash
start-backend.bat
```

### Still Not Working?
See detailed guides:
- `FIX_ONBOARDING_NOW.md` - Quick fixes
- `ONBOARDING_TROUBLESHOOTING.md` - Detailed troubleshooting
- `ONBOARDING_COMPLETE_GUIDE.md` - Complete guide

---

## 📝 Quick Commands

```bash
# Check if backend is running
test-backend.bat

# Start backend
start-backend.bat

# Check all users
check-users.bat

# Reset onboarding for specific user
test-onboarding.bat your-email@example.com

# View detailed user data
node check-users-onboarding.js
```

---

## 🎯 Expected Result

```
Sign In → Onboarding (4 steps) → Dashboard (with your role displayed)
```

**Next sign in:**
```
Sign In → Dashboard (skip onboarding)
```

---

## 🎉 That's It!

Just run the command, clear cache, and sign in!

```bash
test-onboarding.bat your-email@example.com
```

**Happy Testing!** 🚀
