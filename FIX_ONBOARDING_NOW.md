# 🚀 Fix Onboarding Issue - Quick Start

## You're Not Seeing Onboarding? Here's the Fix!

### ⚡ Quick Fix (30 seconds)

Run this ONE command:
```bash
test-onboarding.bat your-email@example.com
```

Replace `your-email@example.com` with the email you used to sign up.

**Example:**
```bash
test-onboarding.bat john@example.com
```

This will:
1. ✅ Check if backend is running
2. ✅ Reset your onboarding status
3. ✅ Tell you what to do next

### 📝 Then Do This:

1. **Clear your browser cache** (or use Incognito window)
2. **Go to**: http://localhost:5500/sign_in.html
3. **Sign in** with your email
4. **You should see the onboarding flow!** 🎉

---

## 🔍 Don't Know Your Email?

Check all users in your database:
```bash
check-users.bat
```

This shows all registered users and their onboarding status.

---

## 🆘 Still Not Working?

### Check Backend is Running
```bash
test-backend.bat
```

Should show: "✅ Backend is running on port 3000"

If not, start it:
```bash
start-backend.bat
```

### Clear Browser Data
1. Press `F12` (open DevTools)
2. Go to **Application** tab
3. Click **Clear site data**
4. Close and reopen browser

### Try Incognito Window
- Chrome: `Ctrl+Shift+N`
- Firefox: `Ctrl+Shift+P`
- Edge: `Ctrl+Shift+N`

---

## 📚 More Help

- **Quick Guide**: `ONBOARDING_QUICK_GUIDE.md`
- **Detailed Troubleshooting**: `ONBOARDING_TROUBLESHOOTING.md`
- **Complete Documentation**: `ONBOARDING_FLOW.md`

---

## ✅ What Should Happen

After running the fix:

1. **Sign in** → Should redirect to `onboarding.html`
2. **Step 1**: Enter name, company, team size
3. **Step 2**: Select roles (can select multiple)
4. **Step 3**: Select goals
5. **Step 4**: See summary and click "Go to Dashboard"
6. **Dashboard**: Should show your selected role(s)

---

## 🎯 Quick Test

```bash
# 1. Reset onboarding
test-onboarding.bat your-email@example.com

# 2. Clear browser cache (Ctrl+Shift+Delete)

# 3. Sign in at http://localhost:5500/sign_in.html

# 4. Complete onboarding flow

# 5. Check dashboard - your role should appear!
```

---

## 💡 Why This Happens

If you signed up before the onboarding feature was added, your account has `onboardingCompleted: undefined` or `true`. The reset script sets it to `false` so you can see the onboarding flow.

---

## 🎉 That's It!

Run the command, clear cache, sign in, and you're good to go!

```bash
test-onboarding.bat your-email@example.com
```
