# 🔍 Debug Sign In Issue

## Quick Test

1. **Open the test page:**
   ```
   http://localhost:5500/test-signin.html
   ```

2. **Click "Test Backend Connection"**
   - Should show: ✅ Backend is running

3. **Enter your email and password**

4. **Click "Test Sign In"**
   - Watch the console log
   - Should show sign in response
   - Should redirect to dashboard

## Common Issues & Solutions

### Issue 1: Backend Not Running
**Symptom:** "Backend connection failed"

**Solution:**
```bash
# Start backend
node server.js
```

### Issue 2: Wrong Credentials
**Symptom:** "Invalid email or password"

**Solution:**
- Make sure you're using the correct email/password
- Try signing up again if needed

### Issue 3: Email Not Verified
**Symptom:** "Please verify your email before signing in"

**Solution:**
1. Go to signup page
2. Sign up with your email
3. Get OTP from backend console
4. Verify email
5. Then sign in

### Issue 4: CORS Error
**Symptom:** Console shows CORS error

**Solution:**
- Make sure backend is running on port 3000
- Make sure frontend is on port 5500
- Check .env file: `FRONTEND_URL=http://localhost:5500`

### Issue 5: Token Not Saved
**Symptom:** Redirects but dashboard shows "Session expired"

**Solution:**
- Open browser console (F12)
- Go to Application → Local Storage
- Check if `authToken` exists
- If not, there's an issue with the sign in response

## Step-by-Step Debug

### Step 1: Check Backend
```bash
# In browser, go to:
http://localhost:3000/api/health

# Should see:
{
  "status": "OK",
  "message": "CODEX INC Backend is running"
}
```

### Step 2: Check Sign In API
Open browser console (F12) and run:
```javascript
fetch('http://localhost:3000/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'your-email@gmail.com',
        password: 'your-password'
    })
})
.then(r => r.json())
.then(d => console.log(d));
```

Should see:
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": { ... }
}
```

### Step 3: Check LocalStorage
In browser console:
```javascript
localStorage.getItem('authToken')
localStorage.getItem('user')
```

Should show your token and user data.

### Step 4: Manual Dashboard Access
Try going directly to:
```
http://localhost:5500/dashboard.html
```

If you see "Session expired", the token isn't saved.

## Using the Test Page

### Test Page Features:
1. **Test Backend Connection** - Checks if backend is running
2. **Check LocalStorage** - Shows what's saved
3. **Test Sign In** - Full sign in test with logs
4. **Go to Dashboard** - Direct navigation test

### How to Use:
1. Open: `http://localhost:5500/test-signin.html`
2. Enter your credentials
3. Click "Test Sign In"
4. Watch the console log
5. Should auto-redirect to dashboard

## Browser Console Debugging

### Open Console:
- Chrome/Edge: F12 or Ctrl+Shift+I
- Firefox: F12 or Ctrl+Shift+K
- Safari: Cmd+Option+I

### Check for Errors:
Look for red error messages like:
- `Failed to fetch` - Backend not running
- `CORS error` - CORS configuration issue
- `401 Unauthorized` - Wrong credentials
- `403 Forbidden` - Email not verified

## Manual Sign In Test

### 1. Open sign_in.html
```
http://localhost:5500/sign_in.html
```

### 2. Open Browser Console (F12)

### 3. Enter credentials and click Sign In

### 4. Watch Console for:
```
Sign in result: { success: true, token: "...", user: {...} }
Redirecting to dashboard...
```

### 5. If you see the logs but no redirect:
- Check if there's a JavaScript error
- Check if dashboard.html exists
- Try manual navigation: `window.location.href = 'dashboard.html'`

## Quick Fixes

### Fix 1: Clear Everything and Start Fresh
```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### Fix 2: Create New Account
1. Go to signup page
2. Use a different email
3. Complete verification
4. Try signing in

### Fix 3: Check File Paths
Make sure these files exist:
- `dashboard.html`
- `js/api.js`
- `sign_in.html`

### Fix 4: Restart Everything
```bash
# Stop backend (Ctrl+C)
# Stop frontend (Ctrl+C)

# Start backend
node server.js

# Start frontend (new terminal)
python -m http.server 5500
```

## Expected Flow

### Successful Sign In:
```
1. User enters credentials
2. Click "Sign In"
3. Button shows "Signing In..."
4. API call to /api/auth/signin
5. Response: { success: true, token: "...", user: {...} }
6. Token saved to localStorage
7. User saved to localStorage
8. Console: "Redirecting to dashboard..."
9. Page redirects to dashboard.html
10. Dashboard loads user data
```

### If It Fails:
```
1. Check console for error message
2. Check network tab for API response
3. Check if backend is running
4. Check if credentials are correct
5. Check if email is verified
```

## Network Tab Debugging

### 1. Open Network Tab (F12 → Network)

### 2. Sign in and watch for:
- Request to: `http://localhost:3000/api/auth/signin`
- Method: POST
- Status: 200 (success) or 401/403 (error)

### 3. Click on the request

### 4. Check Response:
Should see:
```json
{
  "success": true,
  "message": "Sign in successful",
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "fullName": "...",
    "email": "...",
    ...
  }
}
```

## Still Not Working?

### Try This:
1. Open `test-signin.html`
2. Enter credentials
3. Click "Test Sign In"
4. Copy all the console logs
5. Check what the response says

### Common Response Messages:

**"Invalid email or password"**
- Wrong credentials
- Try resetting or creating new account

**"Please verify your email before signing in"**
- Email not verified
- Go through verification process

**"User not found"**
- Account doesn't exist
- Sign up first

**"Network error"**
- Backend not running
- Start backend: `node server.js`

## Contact Info

If still having issues, provide:
1. Console logs from test-signin.html
2. Network tab response
3. Backend terminal output
4. Any error messages

---

**Quick Test:** Open `http://localhost:5500/test-signin.html` and try signing in there first!
