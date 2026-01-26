# Integration & Team Creation Issues - DIAGNOSIS & FIX

## ISSUES FOUND:

### 1. GitHub/Discord Integration Data Not Loading
**Problem**: The dashboard shows "No repositories found" and "No servers found" even though you have connected integrations.

**Root Cause**: 
- The `/api/dashboard/data/github` and `/api/dashboard/data/discord` endpoints check for data in the `IntegrationData` collection
- This collection is empty because no sync has been performed
- The actual GitHub/Discord APIs are not being called to fetch real data

**Solution Options**:

#### Option A: Sync Integration Data (Recommended)
You need to trigger a sync to populate the IntegrationData collection with your actual GitHub repos and Discord servers.

**Steps**:
1. Open browser console on dashboard
2. Run this command:
```javascript
// Sync GitHub
fetch('http://localhost:3000/api/dashboard/sync/github', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
}).then(r => r.json()).then(console.log);

// Sync Discord
fetch('http://localhost:3000/api/dashboard/sync/discord', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
}).then(r => r.json()).then(console.log);
```

#### Option B: Implement Real API Integration
The current implementation uses mock data. To fetch real data from GitHub/Discord:
- Need to implement actual API calls using the stored access tokens
- Call GitHub API: `https://api.github.com/user/repos`
- Call Discord API: `https://discord.com/api/users/@me/guilds`

### 2. Team Creation Not Working
**Problem**: After entering a workspace name and clicking Create, nothing happens.

**Root Cause**:
- The `/api/company/create` endpoint requires Professional or Enterprise tier
- Freebie users get a 403 Forbidden error
- The error is not being displayed to the user

**Current Tier Restrictions**:
- **Freebie**: Can only JOIN companies (cannot create)
- **Professional**: Can create 1 company with up to 10 members
- **Enterprise**: Can create unlimited companies with unlimited members

**Solution**: Either upgrade to Professional tier OR modify the restriction.

---

## QUICK FIX STEPS:

### Fix 1: Add Real GitHub/Discord Data Fetching

I'll create a new route that fetches real data from GitHub and Discord APIs using your stored tokens.

### Fix 2: Allow Freebie Users to Create ONE Company

Modify the company creation to allow Freebie users to create one basic company with limited features.

### Fix 3: Add Better Error Messages

Show clear error messages when operations fail.

---

## IMPLEMENTATION NEEDED:

See the files I'm about to create for the complete fix.
