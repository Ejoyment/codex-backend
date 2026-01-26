# Quick Fix Guide - Integration & Team Issues

## 🚀 Quick Start (5 Minutes)

### Step 1: Restart Backend (30 seconds)
```bash
# Press Ctrl+C in your backend terminal
# Then run:
start-backend.bat
```

### Step 2: Check Integration Status (1 minute)
1. Open your browser to any page (e.g., dashboard)
2. Press F12 to open console
3. Copy and paste the entire contents of `check-integration-status.js`
4. Press Enter
5. Review the output

### Step 3: Fix Any Issues (2-3 minutes)

#### If GitHub shows "Not connected":
1. Go to `http://localhost:5500/settings.html`
2. Find GitHub section
3. Click "Disconnect" (if shown)
4. Click "Connect"
5. Authorize on GitHub
6. Return to dashboard

#### If Discord shows "Not connected":
1. Go to `http://localhost:5500/settings.html`
2. Find Discord section
3. Click "Disconnect" (if shown)
4. Click "Connect"
5. Authorize on Discord
6. Return to dashboard

#### If Team Creation Fails:
1. Go to `http://localhost:5500/teams.html`
2. Click "Create Workspace"
3. Enter a name (e.g., "My Team")
4. Click "Create"
5. If error appears, read the message:
   - "Only one company" → You already have a workspace
   - "Name already taken" → Choose different name
   - "Upgrade required" → Should NOT happen anymore (bug fixed)

---

## ✅ What Was Fixed

### 1. GitHub Repositories Now Load
- **Before**: Showed "No repositories found"
- **After**: Shows your actual GitHub repos with stars, forks, languages
- **How**: Now calls real GitHub API instead of checking empty database

### 2. Discord Servers Now Load
- **Before**: Showed "No servers found"
- **After**: Shows your actual Discord servers with channels
- **How**: Now calls real Discord API instead of checking empty database

### 3. Team Creation Now Works
- **Before**: Freebie users couldn't create teams at all
- **After**: Freebie users can create 1 team (3 members max)
- **How**: Removed restriction, added proper limits

---

## 🔍 Quick Diagnostics

### Test GitHub Integration
```javascript
// Paste in browser console:
fetch('http://localhost:3000/api/dashboard/data/github', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
}).then(r => r.json()).then(d => {
    console.log('Connected:', d.connected);
    console.log('Repos:', d.data.repositories?.length || 0);
    if (d.data.repositories) {
        d.data.repositories.forEach(r => console.log(`  - ${r.name}`));
    }
});
```

### Test Discord Integration
```javascript
// Paste in browser console:
fetch('http://localhost:3000/api/dashboard/data/discord', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
}).then(r => r.json()).then(d => {
    console.log('Connected:', d.connected);
    console.log('Servers:', d.data.servers?.length || 0);
    if (d.data.servers) {
        d.data.servers.forEach(s => console.log(`  - ${s.name}`));
    }
});
```

### Test Team Creation
```javascript
// Paste in browser console:
fetch('http://localhost:3000/api/company/create', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ 
        name: 'Test Team ' + Date.now(), 
        description: 'Test workspace' 
    })
}).then(r => r.json()).then(console.log);
```

---

## 🐛 Common Issues & Solutions

### Issue: "401 Unauthorized"
**Cause**: Your auth token expired
**Solution**: 
1. Sign out
2. Sign back in
3. Try again

### Issue: "Integration not connected"
**Cause**: You haven't connected the integration yet
**Solution**:
1. Go to Settings
2. Click "Connect" for GitHub/Discord
3. Complete OAuth flow

### Issue: "No repositories found" (after connecting)
**Cause**: Token might be invalid or you have no repos
**Solution**:
1. Check if you actually have GitHub repos
2. Try disconnecting and reconnecting
3. Check browser console for errors

### Issue: "No servers found" (after connecting)
**Cause**: Token might be invalid or you're not in any servers
**Solution**:
1. Make sure you're in at least one Discord server
2. Try disconnecting and reconnecting
3. Check browser console for errors

### Issue: Team creation says "Only one company"
**Cause**: You already created a workspace
**Solution**:
- Freebie tier allows only 1 workspace
- Either use existing workspace
- Or upgrade to Professional

---

## 📊 Tier Limits Reference

| Feature | Freebie | Professional | Enterprise |
|---------|---------|--------------|------------|
| Workspaces | 1 | 1 | Unlimited |
| Members/Workspace | 3 | 10 | Unlimited |
| GitHub Integration | ❌ | ✅ | ✅ |
| Discord Integration | ✅ | ✅ | ✅ |
| Other Integrations | ❌ | ✅ | ✅ |
| AI Messages/Day | 10 | 100 | Unlimited |

---

## 🎯 Success Checklist

After following this guide, you should have:

- [ ] Backend restarted with new code
- [ ] GitHub integration showing your repos
- [ ] Discord integration showing your servers
- [ ] Ability to create a workspace (if you don't have one)
- [ ] Clear error messages if something fails

---

## 📞 Still Having Issues?

1. **Check Backend Logs**: Look at your terminal running the backend
2. **Check Browser Console**: Press F12 and look for red errors
3. **Run Full Diagnostic**: Use `check-integration-status.js` script
4. **Verify Connections**: Go to Settings and check integration status
5. **Check Token**: Run `localStorage.getItem('authToken')` in console

---

## 🔄 If All Else Fails

### Nuclear Option (Fresh Start):
1. Sign out completely
2. Clear browser cache and localStorage
3. Restart backend server
4. Sign back in
5. Reconnect all integrations
6. Try creating workspace again

### Check These Files Were Updated:
- `routes/dashboard.js` - Should have real API calls
- `routes/company.js` - Should allow Freebie users
- `js/workspace.js` - Should show error messages

---

## ✨ You're All Set!

The fixes are in place. Just restart your backend and test. If you see your GitHub repos and Discord servers on the dashboard, and can create a workspace on the Teams page, everything is working! 🎉
