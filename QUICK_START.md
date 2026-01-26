# 🚀 Quick Start Guide (5 Minutes)

Get up and running quickly with minimal setup!

## Prerequisites

- Node.js installed
- Gmail account
- MongoDB installed (or use Atlas free tier)

---

## Step 1: Install Dependencies (30 seconds)

```bash
npm install
```

---

## Step 2: Get Gmail App Password (2 minutes)

### Quick Steps:
1. Go to: https://myaccount.google.com/apppasswords
2. If you see "2-Step Verification is not turned on":
   - Click the link to enable it
   - Follow the prompts (use your phone)
   - Come back to: https://myaccount.google.com/apppasswords
3. Select app: **Mail**
4. Select device: **Other** → Type: "CODEX Backend"
5. Click **Generate**
6. Copy the 16-character password (remove spaces)

**Save this password!** You'll need it in Step 5.

---

## Step 3: Setup MongoDB (1 minute)

### Option A: Local MongoDB (Recommended for testing)

**Already installed?** Just run:
```bash
mongod
```

**Not installed?** 
- Windows: Download from https://www.mongodb.com/try/download/community
- Mac: `brew install mongodb-community && brew services start mongodb-community`
- Linux: `sudo apt-get install mongodb && sudo systemctl start mongodb`

### Option B: MongoDB Atlas (Cloud - Free)

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Create free cluster (M0)
3. Create user: `codexadmin` / `password123`
4. Whitelist IP: `0.0.0.0/0` (for testing)
5. Get connection string

---

## Step 4: Get OAuth Keys (Optional - 3 minutes each)

### Google OAuth (Optional but recommended)

1. Go to: https://console.cloud.google.com/
2. Create new project: "CODEX Auth"
3. Enable Google+ API
4. Create OAuth credentials:
   - Type: Web application
   - Authorized redirect: `http://localhost:3000/auth/google/callback`
5. Copy Client ID & Secret

### Facebook OAuth (Optional)

1. Go to: https://developers.facebook.com/apps/create/
2. Create app: "CODEX INC"
3. Add Facebook Login product
4. Settings → Valid OAuth Redirect URIs: `http://localhost:3000/auth/facebook/callback`
5. Copy App ID & Secret

---

## Step 5: Create .env File (1 minute)

Create a file named `.env` in the project root:

```env
# Required - Basic Setup
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/codex-inc
JWT_SECRET=change-this-to-any-random-long-string
FRONTEND_URL=http://localhost:5500

# Required - Email (Use your Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-from-step-2
EMAIL_FROM=CODEX INC <noreply@codexinc.com>

# Optional - Google OAuth (Leave empty to skip)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Optional - Facebook OAuth (Leave empty to skip)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback

# OTP Settings
OTP_EXPIRY_MINUTES=10
```

**Replace:**
- `your-email@gmail.com` → Your Gmail address
- `your-app-password-from-step-2` → The password from Step 2 (no spaces)
- `change-this-to-any-random-long-string` → Any random text (e.g., `my-secret-key-12345`)

---

## Step 6: Start Everything (30 seconds)

### Terminal 1 - Backend:
```bash
npm start
```

You should see:
```
✓ MongoDB connected successfully
✓ Email service is ready
🚀 Server running on port 3000
```

### Terminal 2 - Frontend:
```bash
# Option 1: Python
python -m http.server 5500

# Option 2: Node.js
npx http-server -p 5500

# Option 3: VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

---

## Step 7: Test It! (1 minute)

1. Open browser: **http://localhost:5500**
2. Click **"Start Free Trial"**
3. Fill in the form with your email
4. Click **"Create Account"**
5. Check your email for the OTP code
6. Enter the 4-digit code
7. Success! ✅

---

## 🎯 What Works Now?

✅ **Email/Password Signup** - Fully functional
✅ **Email OTP Verification** - Sends real emails
✅ **Sign In** - With JWT tokens
✅ **Password Security** - Bcrypt hashing
✅ **Rate Limiting** - Protection enabled

❌ **Google Login** - Only if you added OAuth keys
❌ **Facebook Login** - Only if you added OAuth keys

---

## 🐛 Common Issues

### "Email service error"
- Check your Gmail App Password is correct (no spaces)
- Make sure 2-Step Verification is enabled

### "MongoDB connection error"
- Run `mongod` in a separate terminal
- Or check your Atlas connection string

### "Port 3000 already in use"
- Change `PORT=3001` in .env
- Or stop the other process using port 3000

### "Cannot find module"
- Run `npm install` again

---

## 📱 Test Accounts

For testing, you can use:
- **Email:** Any valid email you have access to
- **Password:** Minimum 6 characters
- **OTP:** Check your email inbox

---

## 🎉 You're Done!

Your authentication system is now running with:
- ✅ User registration
- ✅ Email verification with OTP
- ✅ Secure login
- ✅ JWT tokens
- ✅ Beautiful UI

### Next Steps:

1. **Add Google/Facebook login** (optional):
   - Follow SETUP_GUIDE.md for detailed OAuth setup
   
2. **Customize the UI**:
   - Edit HTML/CSS files to match your brand
   
3. **Deploy to production**:
   - Use Heroku/Railway for backend
   - Use Vercel/Netlify for frontend

---

## 📚 Full Documentation

For detailed setup instructions, see:
- **SETUP_GUIDE.md** - Complete step-by-step guide
- **README.md** - Full project documentation

---

## 💡 Pro Tips

1. **Save your .env file** - You'll need it later
2. **Use a real email** - So you can receive OTP codes
3. **Keep terminals open** - Backend and frontend need to run simultaneously
4. **Check console logs** - They show helpful error messages

---

## ✨ Enjoy!

You now have a professional authentication system! 🎊

Need help? Check the troubleshooting section or open an issue.
