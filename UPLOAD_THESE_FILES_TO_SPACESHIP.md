# 📤 UPLOAD THESE FILES TO SPACESHIP

## ✅ CORRECT FILES TO UPLOAD

Upload these files from your **ROOT folder** (NOT from deployment or deployment-package):

### 1. HTML Files (Upload to `/public_html/`)
```
dashboard.html
profile.html
settings.html
```

### 2. JavaScript Files (Upload to `/public_html/js/`)
```
js/dashboard-unified.js
js/api.js
```

---

## 📋 STEP-BY-STEP UPLOAD GUIDE

### Using FileZilla:

1. **Connect to Spaceship FTP**
   - Host: `ftp.codexincenterprise.online`
   - Username: Your cPanel username
   - Password: Your cPanel password
   - Port: 21

2. **Upload HTML files**
   - Local (left): Navigate to `C:\Users\ejoym\OneDrive\Desktop\codex_tool\`
   - Remote (right): Navigate to `/public_html/`
   - Drag these files from left to right:
     - `dashboard.html`
     - `profile.html`
     - `settings.html`

3. **Upload JS files**
   - Local (left): Navigate to `C:\Users\ejoym\OneDrive\Desktop\codex_tool\js\`
   - Remote (right): Navigate to `/public_html/js/`
   - Drag these files from left to right:
     - `dashboard-unified.js`
     - `api.js`

---

## ✅ VERIFICATION CHECKLIST

After uploading:
- [ ] Clear browser cache (Ctrl + Shift + Delete)
- [ ] Go to: https://codexincenterprise.online/dashboard.html
- [ ] Dashboard should load in 2-3 seconds
- [ ] Profile picture and name should appear in sidebar
- [ ] Integration errors should show retry buttons
- [ ] Go to: https://codexincenterprise.online/profile.html
- [ ] Profile page should load properly
- [ ] Photo upload should work

---

## 🔧 WHAT WAS FIXED

### In `js/dashboard-unified.js`:
- ✅ API URL points to: `https://codex-backend-7utu.onrender.com/api`
- ✅ Added 15-second timeout for initial load
- ✅ Added 10-second timeout for each API call
- ✅ Profile picture URL construction fixed
- ✅ Loading state always hides after attempt
- ✅ Error handling with retry buttons

### In `profile.html`:
- ✅ Profile upload uses FormData correctly
- ✅ Calls `/api/auth/upload-photo` endpoint
- ✅ Profile picture URL fixed for backend paths
- ✅ Password change functionality works
- ✅ Error handling added

### In `dashboard.html`:
- ✅ Uses correct API URL
- ✅ Skeleton loader configured properly
- ✅ Profile section loads correctly

### In `settings.html`:
- ✅ Integration connections work
- ✅ OAuth flows configured
- ✅ Error messages display properly

---

## 🚨 IMPORTANT NOTES

1. **DO NOT upload files from `deployment/` or `deployment-package/` folders**
   - Those are old/backup versions
   - Use files from ROOT folder only

2. **Backend is already deployed**
   - Backend on Render is up to date
   - You only need to upload frontend files to Spaceship

3. **Clear cache after uploading**
   - Browser caches old files
   - Always clear cache or use incognito mode to test

---

## 📞 NEED FTP CREDENTIALS?

If you don't have FTP credentials:
1. Login to Spaceship cPanel
2. Look for "FTP Accounts" or "File Manager"
3. Or contact Spaceship support

---

## ⏱️ ESTIMATED TIME

- File upload: 2-3 minutes
- Cache clear: 30 seconds
- Testing: 2 minutes
- **Total: ~5 minutes**

---

## 🎉 AFTER UPLOADING

Your site will have:
- ✅ Fast dashboard loading (2-3 seconds)
- ✅ Profile pictures showing everywhere
- ✅ Working profile upload
- ✅ Integration error messages with retry
- ✅ No infinite loading states

**Upload these 5 files and you're done!** 🚀
