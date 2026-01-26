# 🪟 Windows Setup Guide

## ✅ Current Status

- ✅ Dependencies installed (node_modules folder exists)
- ✅ .env file configured
- ✅ MongoDB Atlas connection ready
- ✅ Gmail credentials configured
- ✅ Google OAuth configured
- ✅ Ready to start!

---

## 🚀 Starting Your Backend (3 Easy Ways)

### Method 1: Double-Click (EASIEST) ⭐

1. Look in your project folder for: **`start-backend.bat`**
2. **Double-click** it
3. A black window will open - **DON'T CLOSE IT!**
4. You should see:
   ```
   ✓ MongoDB connected successfully
   ✓ Email service is ready
   🚀 Server running on port 3000
   ```

### Method 2: Command Prompt

1. Press `Win + R`
2. Type: `cmd` and press Enter
3. Type:
   ```
   cd C:\Users\ejoym\OneDrive\Desktop\codex_tool
   node server.js
   ```
4. Press Enter

### Method 3: VS Code Terminal

1. In VS Code, press `` Ctrl + ` `` (backtick)
2. Type:
   ```
   node server.js
   ```
3. Press Enter

---

## 🧪 Test If It's Working

### Test 1: Check the Terminal
You should see these messages:
```
✓ MongoDB connected successfully
✓ Email service is ready
🚀 Server running on port 3000
📧 Email service: smtp.gmail.com
🌐 Frontend URL: http://localhost:5500
```

### Test 2: Open Browser
1. Open your browser
2. Go to: `http://localhost:3000/api/health`
3. You should see:
   ```json
   {
     "status": "OK",
     "message": "CODEX INC Backend is running",
     "timestamp": "2024-..."
   }
   ```

---

## 🌐 Starting the Frontend

**IMPORTANT:** Keep the backend window open!

### Option 1: Python (if installed)
Open a **NEW** Command Prompt:
```
cd C:\Users\ejoym\OneDrive\Desktop\codex_tool
python -m http.server 5500
```

### Option 2: VS Code Live Server
1. Install "Live Server" extension in VS Code
2. Right-click `index.html`
3. Click "Open with Live Server"

### Option 3: Node.js http-server
Open a **NEW** Command Prompt:
```
cd C:\Users\ejoym\OneDrive\Desktop\codex_tool
npx http-server -p 5500
```

---

## 🎯 Complete Startup Checklist

- [ ] Open Command Prompt or double-click `start-backend.bat`
- [ ] Run `node server.js`
- [ ] See "✓ MongoDB connected successfully"
- [ ] See "✓ Email service is ready"
- [ ] See "🚀 Server running on port 3000"
- [ ] Keep that window open!
- [ ] Open NEW Command Prompt
- [ ] Start frontend (python or Live Server)
- [ ] Open browser to `http://localhost:5500`
- [ ] Click "Start Free Trial"
- [ ] Test signup!

---

## 🐛 Common Windows Issues

### Issue: "npm is not recognized"
**Solution:** Node.js not in PATH
1. Reinstall Node.js from: https://nodejs.org/
2. Check "Add to PATH" during installation
3. Restart Command Prompt

### Issue: "Cannot load npm.ps1"
**Solution:** PowerShell execution policy
- Use Command Prompt (cmd) instead of PowerShell
- Or use the batch files I created

### Issue: "Port 3000 already in use"
**Solution:** Kill the process
```
netstat -ano | findstr :3000
taskkill /PID <number> /F
```

### Issue: "MongoDB connection error"
**Solution:** Your connection string looks good!
- Check internet connection
- Verify MongoDB Atlas is accessible

### Issue: Two windows needed?
**Answer:** YES!
- Window 1: Backend (node server.js) - Port 3000
- Window 2: Frontend (python or Live Server) - Port 5500
- Both must run simultaneously

---

## 📝 Quick Commands Reference

### Start Backend
```
node server.js
```

### Start Frontend (Python)
```
python -m http.server 5500
```

### Start Frontend (Node)
```
npx http-server -p 5500
```

### Test Backend
```
curl http://localhost:3000/api/health
```
Or open in browser: `http://localhost:3000/api/health`

### Stop Server
Press `Ctrl + C` in the terminal

---

## 🎬 Step-by-Step Video Guide

### Starting Backend:
1. Open folder: `C:\Users\ejoym\OneDrive\Desktop\codex_tool`
2. Double-click: `start-backend.bat`
3. Wait for "Server running" message
4. **Leave window open!**

### Starting Frontend:
1. Open NEW Command Prompt
2. Type: `cd C:\Users\ejoym\OneDrive\Desktop\codex_tool`
3. Type: `python -m http.server 5500`
4. **Leave window open!**

### Testing:
1. Open browser
2. Go to: `http://localhost:5500`
3. Click "Start Free Trial"
4. Fill form and submit
5. Check your email for OTP!

---

## ✨ Your Configuration Summary

```
✅ MongoDB: Connected to Atlas
✅ Email: Gmail configured (dejoymene@gmail.com)
✅ Google OAuth: Configured
✅ Facebook OAuth: Not configured (optional)
✅ Frontend URL: http://localhost:5500
✅ Backend Port: 3000
```

---

## 🎉 You're Ready!

Everything is configured and ready to go. Just:

1. **Run:** `start-backend.bat` (or `node server.js`)
2. **Wait** for success messages
3. **Start** frontend in new window
4. **Test** at http://localhost:5500

---

## 💡 Pro Tips

1. **Use Command Prompt (cmd)** instead of PowerShell to avoid script execution issues
2. **Keep both windows visible** so you can see logs
3. **Check backend logs** if something doesn't work
4. **Use the batch files** - they're easier than typing commands

---

## 📞 Need More Help?

- Check: **TROUBLESHOOTING.md**
- Check: **START_HERE.md**
- Look at terminal errors - they usually tell you what's wrong

---

**Ready? Double-click `start-backend.bat` now!** 🚀
