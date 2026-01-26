# 🔧 Troubleshooting Guide

Common issues and their solutions.

---

## 📧 Email Issues

### Problem: "Email service error" or emails not sending

**Possible Causes:**
1. Incorrect Gmail App Password
2. 2-Step Verification not enabled
3. Wrong email configuration

**Solutions:**

✅ **Check App Password:**
```env
# Make sure there are NO SPACES in the password
EMAIL_PASSWORD=abcdefghijklmnop  ✓ Correct
EMAIL_PASSWORD=abcd efgh ijkl mnop  ✗ Wrong
```

✅ **Verify 2-Step Verification:**
1. Go to: https://myaccount.google.com/security
2. Check if "2-Step Verification" is ON
3. If not, enable it first

✅ **Generate New App Password:**
1. Go to: https://myaccount.google.com/apppasswords
2. Delete old password
3. Create new one
4. Update .env file

✅ **Check Email Settings:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-actual-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
```

✅ **Test Email Service:**
```bash
# Check server logs when starting
npm start

# You should see:
✓ Email service is ready
```

---

## 🗄️ MongoDB Issues

### Problem: "MongoDB connection error"

**Possible Causes:**
1. MongoDB not running
2. Wrong connection string
3. Network issues (Atlas)

**Solutions:**

✅ **For Local MongoDB:**

**Check if MongoDB is running:**
```bash
# Windows
tasklist | findstr mongod

# Mac/Linux
ps aux | grep mongod
```

**Start MongoDB:**
```bash
# Windows
mongod

# Mac (Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongodb
```

**Verify Connection:**
```bash
# Try connecting with mongo shell
mongo
# or
mongosh
```

✅ **For MongoDB Atlas:**

**Check Connection String:**
```env
# Correct format:
MONGODB_URI=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/codex-inc?retryWrites=true&w=majority

# Common mistakes:
# ✗ Forgot to replace <password>
# ✗ Special characters in password not URL-encoded
# ✗ Missing database name
```

**URL Encode Special Characters:**
```
If password is: p@ssw0rd!
Encode it as: p%40ssw0rd%21

@ = %40
! = %21
# = %23
$ = %24
% = %25
```

**Check IP Whitelist:**
1. Go to MongoDB Atlas dashboard
2. Network Access → IP Whitelist
3. Add `0.0.0.0/0` (for testing) or your IP

---

## 🔐 OAuth Issues

### Problem: Google OAuth not working

**Possible Causes:**
1. Wrong redirect URI
2. OAuth consent screen not configured
3. Client ID/Secret incorrect

**Solutions:**

✅ **Verify Redirect URI:**
```
In Google Cloud Console:
Authorized redirect URIs must be EXACTLY:
http://localhost:3000/auth/google/callback

In .env file:
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

They MUST match exactly (including http:// and port)
```

✅ **Check OAuth Consent Screen:**
1. Go to Google Cloud Console
2. APIs & Services → OAuth consent screen
3. Make sure it's configured
4. Add your email as a test user

✅ **Enable Google+ API:**
1. APIs & Services → Library
2. Search "Google+ API"
3. Click Enable

✅ **Verify Credentials:**
```env
# Client ID should look like:
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com

# Client Secret should look like:
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
```

### Problem: Facebook OAuth not working

**Solutions:**

✅ **Check Redirect URI:**
```
In Facebook App Settings:
Valid OAuth Redirect URIs:
http://localhost:3000/auth/facebook/callback

In .env:
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback
```

✅ **App Mode:**
- Development mode: Add yourself as test user
- Live mode: Submit for review (not needed for testing)

✅ **Add Test Users:**
1. Facebook App Dashboard
2. Roles → Test Users
3. Add your Facebook account

---

## 🌐 Server Issues

### Problem: "Port 3000 already in use"

**Solutions:**

✅ **Option 1: Change Port**
```env
# In .env file
PORT=3001

# Also update OAuth callbacks:
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
FACEBOOK_CALLBACK_URL=http://localhost:3001/auth/facebook/callback
```

✅ **Option 2: Kill Process**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

### Problem: "Cannot find module"

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install

# Or on Windows
rmdir /s node_modules
npm install
```

### Problem: "CORS error" in browser console

**Solutions:**

✅ **Check Frontend URL:**
```env
# In .env, make sure this matches your frontend
FRONTEND_URL=http://localhost:5500
```

✅ **Check Browser Console:**
```
If you see:
"Access-Control-Allow-Origin"

Make sure:
1. Backend is running
2. FRONTEND_URL in .env is correct
3. You're accessing frontend from the correct URL
```

---

## 🔑 Authentication Issues

### Problem: "Invalid token" or "Token expired"

**Solutions:**

✅ **Clear localStorage:**
```javascript
// In browser console
localStorage.clear()
sessionStorage.clear()
```

✅ **Check JWT Secret:**
```env
# Make sure JWT_SECRET is set in .env
JWT_SECRET=your-secret-key-here
```

### Problem: "User not found" when signing in

**Solutions:**

✅ **Check if user exists:**
```bash
# Connect to MongoDB
mongo codex-inc

# Check users
db.users.find()

# Or with mongosh
mongosh codex-inc
db.users.find()
```

✅ **Verify email is correct:**
- Emails are stored in lowercase
- Check for typos

### Problem: "Email already registered"

**Solutions:**

✅ **Sign in instead of signing up**

✅ **Or delete the user:**
```bash
mongo codex-inc
db.users.deleteOne({ email: "your-email@gmail.com" })
```

---

## 📱 Frontend Issues

### Problem: "Network error" or "Failed to fetch"

**Solutions:**

✅ **Check if backend is running:**
```bash
# Should see this in terminal:
🚀 Server running on port 3000
```

✅ **Test backend directly:**
```bash
# Open browser and go to:
http://localhost:3000/api/health

# Should see:
{"status":"OK","message":"CODEX INC Backend is running"}
```

✅ **Check API URL:**
```javascript
// In js/api.js
const API_BASE_URL = 'http://localhost:3000/api';

// Make sure port matches your backend
```

### Problem: OTP input not working

**Solutions:**

✅ **Check browser console for errors**

✅ **Make sure js/api.js is loaded:**
```html
<!-- In verify-email.html -->
<script src="js/api.js"></script>
```

✅ **Clear browser cache:**
```
Ctrl + Shift + Delete (Windows)
Cmd + Shift + Delete (Mac)
```

---

## 🔄 OTP Issues

### Problem: "OTP expired"

**Solution:**
- Click "Resend" to get a new code
- OTP expires after 10 minutes (configurable in .env)

### Problem: "Invalid OTP"

**Solutions:**

✅ **Check email for correct code**

✅ **Make sure you're entering 4 digits**

✅ **Try resending OTP**

### Problem: "Too many failed attempts"

**Solution:**
- Request a new OTP (old one is deleted after 3 failed attempts)
- Wait 15 minutes (rate limiting)

---

## 🐛 General Debugging

### Enable Debug Mode

**Backend Logs:**
```javascript
// In server.js, add:
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});
```

**Frontend Logs:**
```javascript
// In js/api.js, add console.logs:
console.log('Sending request:', data);
console.log('Response:', result);
```

### Check All Services

```bash
# 1. MongoDB
mongo --version
# or
mongosh --version

# 2. Node.js
node --version

# 3. npm
npm --version

# 4. Backend running
curl http://localhost:3000/api/health

# 5. Frontend accessible
curl http://localhost:5500
```

### Environment Variables

**Check if .env is loaded:**
```javascript
// Add to server.js temporarily
console.log('Environment:', {
    PORT: process.env.PORT,
    MONGODB_URI: process.env.MONGODB_URI ? 'Set' : 'Not set',
    EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Not set',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set'
});
```

---

## 📞 Still Having Issues?

### Checklist

- [ ] Node.js installed (v14+)
- [ ] MongoDB running
- [ ] .env file created with all values
- [ ] npm install completed
- [ ] Backend server running (port 3000)
- [ ] Frontend server running (port 5500)
- [ ] Gmail App Password correct
- [ ] 2-Step Verification enabled
- [ ] No CORS errors in console
- [ ] No errors in terminal

### Get Help

1. **Check the logs:**
   - Backend terminal for server errors
   - Browser console for frontend errors

2. **Verify configuration:**
   - Double-check all .env values
   - Make sure no typos

3. **Test step by step:**
   - Test backend health endpoint
   - Test email sending separately
   - Test database connection

4. **Common mistakes:**
   - Spaces in passwords
   - Wrong ports
   - Mismatched URLs
   - Missing environment variables

---

## 💡 Pro Tips

1. **Use separate terminals:**
   - Terminal 1: MongoDB
   - Terminal 2: Backend
   - Terminal 3: Frontend

2. **Check logs first:**
   - Most errors are shown in logs
   - Read error messages carefully

3. **Test incrementally:**
   - Get basic signup working first
   - Then add email
   - Then add OAuth

4. **Keep .env backup:**
   - Save a copy of working .env
   - Easy to restore if something breaks

---

## 🎯 Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| Email not sending | Regenerate Gmail App Password |
| MongoDB error | Run `mongod` command |
| Port in use | Change PORT in .env |
| CORS error | Check FRONTEND_URL in .env |
| Module not found | Run `npm install` |
| OAuth not working | Check redirect URIs match exactly |
| Token invalid | Clear localStorage |
| OTP expired | Click resend |

---

## ✅ Success Indicators

You know everything is working when:

1. ✅ Backend starts without errors
2. ✅ See "✓ MongoDB connected successfully"
3. ✅ See "✓ Email service is ready"
4. ✅ Can access http://localhost:3000/api/health
5. ✅ Can access http://localhost:5500
6. ✅ Signup sends email
7. ✅ OTP verification works
8. ✅ Sign in returns token
9. ✅ OAuth redirects work

---

Happy debugging! 🐛➡️✨
