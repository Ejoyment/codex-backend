# Onboarding Flow Troubleshooting Guide

## Issue: Not Seeing Onboarding Flow After Sign In

### Quick Diagnosis Steps

1. **Check if backend is running**
   ```
   test-backend.bat
   ```
   Should show: "✅ Backend is running on port 3000"

2. **Check your user's onboarding status**
   ```
   node reset-onboarding.js your-email@example.com
   ```
   This will show your current onboarding status and reset it if needed.

3. **Clear browser cache and localStorage**
   - Open browser DevTools (F12)
   - Go to Application tab → Local Storage
   - Delete all items or clear site data
   - Close and reopen browser

### Common Issues & Solutions

#### Issue 1: User Already Completed Onboarding
**Symptom**: Goes directly to dashboard after sign in

**Solution**: Reset onboarding status
```
node reset-onboarding.js your-email@example.com
```

Then sign in again. You should see the onboarding flow.

#### Issue 2: Token Not Being Saved
**Symptom**: Redirects to sign in page immediately

**Check**:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Type: `localStorage.getItem('authToken')`
4. Should show a long token string

**Solution**: Clear localStorage and sign in again

#### Issue 3: Backend Not Returning Onboarding Status
**Symptom**: No redirect after sign in

**Check Backend Response**:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Sign in
4. Look for the `/api/auth/signin` request
5. Check the response - should include `onboardingCompleted: false`

**Solution**: Make sure backend is running and User model has the onboarding fields

#### Issue 4: OAuth Users (Google/Facebook)
**Symptom**: OAuth users skip onboarding

**Check**: OAuth users should go through `auth-success.html` which checks onboarding status

**Solution**: 
1. Sign in with OAuth
2. Check if you're redirected to `auth-success.html`
3. It should then redirect to `onboarding.html` if not completed

### Testing the Complete Flow

1. **Reset your onboarding**:
   ```
   node reset-onboarding.js your-email@example.com
   ```

2. **Clear browser data**:
   - Press F12 → Application → Clear site data
   - Or use Incognito/Private window

3. **Sign in**:
   - Go to `sign_in.html`
   - Enter your credentials
   - Click Sign In

4. **Expected Flow**:
   - Sign in successful
   - Check onboarding status
   - Redirect to `onboarding.html` (if not completed)
   - Complete 4 steps
   - Redirect to `dashboard.html`

### Verify Implementation

#### Check sign_in.html (Lines 120-135)
Should have:
```javascript
if (result.user.onboardingCompleted) {
    window.location.href = 'dashboard.html';
} else {
    window.location.href = 'onboarding.html';
}
```

#### Check auth-success.html (Lines 40-50)
Should have:
```javascript
if (data.user.onboardingCompleted) {
    window.location.href = 'dashboard.html';
} else {
    window.location.href = 'onboarding.html';
}
```

#### Check User Model
Should have these fields:
- `role: [String]` (array)
- `company: String`
- `teamSize: String`
- `goals: [String]` (array)
- `onboardingCompleted: Boolean` (default: false)

### Debug Mode

Add this to your browser console to see what's happening:

```javascript
// Check token
console.log('Token:', localStorage.getItem('authToken'));

// Check user data
fetch('http://localhost:3000/api/auth/me', {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    }
})
.then(r => r.json())
.then(data => console.log('User data:', data));
```

### Still Not Working?

1. **Check browser console for errors** (F12 → Console)
2. **Check backend logs** for any errors
3. **Verify MongoDB connection** - run `test-mongodb.bat`
4. **Try with a new user account** to rule out data issues

### Contact Support

If none of these solutions work, provide:
1. Browser console errors (F12 → Console)
2. Network tab showing the signin request/response
3. Output from `node reset-onboarding.js your-email@example.com`
