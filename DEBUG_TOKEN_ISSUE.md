# 🔍 Debug Token Issue - Step by Step

## The Problem
You're getting "Please sign in first" alert when trying to access Editor or Standup pages, even though you're logged in.

## Debug Steps

### Step 1: Check Your Token

Open this page:
```
http://localhost:5500/test-token.html
```

**What to look for:**
- ✅ "authToken exists" in green
- ✅ Token value shown (long string)
- ✅ user data exists

**If you see:**
- ❌ "authToken is null" → You're not actually logged in
- ❌ "localStorage is empty" → Browser cleared your session

### Step 2: If Token is Missing - Sign In Again

1. Go to: http://localhost:5500/sign_in.html
2. Sign in with: layefaebono@gmail.com
3. After signin, go back to: http://localhost:5500/test-token.html
4. Should now show token exists

### Step 3: Test Editor with Console Open

1. Open browser console (F12)
2. Go to Console tab
3. Go to: http://localhost:5500/editor.html
4. Watch the console logs

**You should see:**
```
=== Checking Access ===
Token exists: true
Token value: eyJhbGciOiJIUzI1NiIs...
Fetching subscription from: http://localhost:3000/api/subscription/current
Response status: 200
Response data: {success: true, subscription: {...}}
Features: ['localRepositories', 'discordSync', 'advancedAnalytics', ...]
Has collaborativeEditing: true
Access granted!
```

**If you see:**
```
Token exists: false
Token value: null
```
→ Your token is being cleared. Check Step 4.

**If you see:**
```
Response status: 401
```
→ Token is invalid or expired. Sign in again.

**If you see:**
```
Has collaborativeEditing: false
```
→ Your subscription isn't upgraded. Run: `upgrade-to-premium.bat layefaebono@gmail.com professional`

### Step 4: Check if Token is Being Cleared

**Possible causes:**
1. **Different domain/port** - Are you accessing via localhost:5500?
2. **Browser clearing storage** - Check browser settings
3. **Incognito mode** - Tokens don't persist between sessions
4. **Another script clearing it** - Check for logout scripts

**Test:**
1. Go to dashboard: http://localhost:5500/dashboard.html
2. Open console (F12)
3. Type: `localStorage.getItem('authToken')`
4. Should show your token
5. Now go to: http://localhost:5500/editor.html
6. Open console again
7. Type: `localStorage.getItem('authToken')`
8. Should still show your token

**If token disappears between pages:**
- Check if you're using the same domain (localhost:5500)
- Check browser console for errors
- Check if any script is calling `localStorage.clear()`

### Step 5: Manual Token Test

If token exists but still getting error:

1. Open: http://localhost:5500/editor.html
2. Open console (F12)
3. Before the alert appears, quickly type:
```javascript
localStorage.getItem('authToken')
```
4. Copy the token value
5. Then type:
```javascript
fetch('http://localhost:3000/api/subscription/current', {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN_HERE' }
}).then(r => r.json()).then(d => console.log(d))
```
6. Check the response

### Step 6: Restart Everything

If nothing works:

1. **Close all browser windows**
2. **Restart backend**:
   ```bash
   # Stop backend (Ctrl+C)
   start-backend.bat
   ```
3. **Open NEW Incognito window** (`Ctrl+Shift+N`)
4. **Sign in**: http://localhost:5500/sign_in.html
5. **Check token**: http://localhost:5500/test-token.html
6. **Test editor**: http://localhost:5500/editor.html

## Common Issues & Solutions

### Issue 1: Token is null
**Solution**: Sign in again
```
http://localhost:5500/sign_in.html
```

### Issue 2: Token exists but API returns 401
**Solution**: Token expired, sign in again

### Issue 3: Token exists, API works, but no collaborativeEditing feature
**Solution**: Upgrade subscription
```bash
upgrade-to-premium.bat layefaebono@gmail.com professional
```

### Issue 4: Everything works in test page but not in editor
**Solution**: Check browser console for specific error

### Issue 5: Token disappears when navigating
**Solution**: 
- Make sure all pages use same domain (localhost:5500)
- Check for scripts calling `localStorage.clear()`
- Check browser privacy settings

## Quick Test Commands

```bash
# 1. Check subscription
node check-subscription.js layefaebono@gmail.com

# 2. Upgrade if needed
upgrade-to-premium.bat layefaebono@gmail.com professional

# 3. Restart backend
# Ctrl+C then:
start-backend.bat

# 4. Test backend
test-backend.bat
```

## Test Pages

1. **Token Debug**: http://localhost:5500/test-token.html
2. **Premium Access Test**: http://localhost:5500/test-premium-access.html
3. **Sign In Debug**: http://localhost:5500/test-signin-debug.html

## What the Console Logs Tell You

### Good Logs (Access Granted)
```
=== Checking Access ===
Token exists: true
Token value: eyJhbGciOiJIUzI1NiIs...
Fetching subscription from: http://localhost:3000/api/subscription/current
Response status: 200
Response data: {success: true, subscription: {tier: "professional", ...}}
Features: ["localRepositories", "discordSync", "advancedAnalytics", "aiCodeReview", "videoStandups", "collaborativeEditing"]
Has collaborativeEditing: true
Access granted!
```

### Bad Logs (No Token)
```
=== Checking Access ===
Token exists: false
Token value: null
No token found in localStorage
```
→ **Fix**: Sign in again

### Bad Logs (No Feature)
```
=== Checking Access ===
Token exists: true
...
Features: ["localRepositories", "discordSync"]
Has collaborativeEditing: false
User does not have collaborativeEditing feature
```
→ **Fix**: Run `upgrade-to-premium.bat layefaebono@gmail.com professional`

### Bad Logs (API Error)
```
=== Checking Access ===
Token exists: true
...
Response status: 401
Response data: {success: false, message: "Invalid token"}
```
→ **Fix**: Sign in again (token expired)

## Summary

1. **Check token exists**: http://localhost:5500/test-token.html
2. **If no token**: Sign in at http://localhost:5500/sign_in.html
3. **Test with console open**: F12 → Console → Go to editor.html
4. **Read the logs**: They tell you exactly what's wrong
5. **Fix based on logs**: Token missing? Sign in. Feature missing? Upgrade.

**The console logs will tell you exactly what's happening!** 🔍
