# Onboarding Flow - Quick Guide

## 🚀 What Was Added

### 4-Step Onboarding Process
New users complete onboarding after email verification:
1. **Welcome** - Name, company, team size
2. **Role** - Select multiple roles (CEO, Designer, Developer, PM, Marketing, Executive)
3. **Goals** - Select goals (Collaborate, Manage, Track, Review, Document, Integrate)
4. **Complete** - Summary and redirect to dashboard

## 🎯 Key Features

✅ **Only for New Users** - Shows after first email verification
✅ **Multiple Roles** - Users can select more than one role
✅ **Dynamic Role Display** - Role shown throughout app instead of "Lead Developer"
✅ **Progress Bar** - Visual progress through 4 steps
✅ **Beautiful UI** - Tailwind CSS design matching existing pages
✅ **Validation** - Required fields checked at each step

## 📋 Available Roles

- 👔 CEO
- 🎨 Designer
- 💻 Developer
- 📊 Product Manager
- 📢 Marketing
- 🎯 Executive

## 🔄 User Flows

### New Email User
```
Sign Up → Verify Email → Sign In → Onboarding → Dashboard
```

### New OAuth User
```
Sign In with Google/Facebook → Onboarding → Dashboard
```

### Returning User
```
Sign In → Dashboard (onboarding skipped)
```

## 📁 New Files

- `onboarding.html` - 4-step onboarding flow
- `ONBOARDING_FLOW.md` - Complete documentation
- `ONBOARDING_QUICK_GUIDE.md` - This file

## 🔧 Modified Files

### Backend
- `models/User.js` - Added role, company, teamSize, goals, onboardingCompleted
- `routes/auth.js` - Added complete-onboarding endpoint
- `server.js` - Updated console log

### Frontend
- `sign_in.html` - Check onboarding status
- `auth-success.html` - Check onboarding status
- `dashboard.html` - Display dynamic role
- `settings.html` - Display dynamic role

## 🎨 UI Components

### Step 1: Welcome
- Text input: Full Name (required)
- Text input: Company (optional)
- Dropdown: Team Size (required)

### Step 2: Role
- 6 clickable cards
- Multiple selection allowed
- Blue border when selected

### Step 3: Goals
- 6 checkboxes
- Multiple selection allowed
- Hover effects

### Step 4: Complete
- Summary card
- "Go to Dashboard" button

## 🔐 API Endpoint

```
POST /api/auth/complete-onboarding
Authorization: Bearer {token}

Body:
{
  "fullName": "John Doe",
  "company": "Acme Inc",
  "teamSize": "2-10",
  "role": ["CEO", "Developer"],
  "goals": ["Collaborate with team"]
}

Response:
{
  "success": true,
  "message": "Onboarding completed successfully",
  "user": { ... }
}
```

## 💡 How Role Display Works

### Before Onboarding
- Shows: "Team Member" (default)

### After Onboarding
- Single role: "Developer"
- Multiple roles: "CEO, Developer"
- No role selected: "Team Member"

### Where Role Appears
- Dashboard header
- Dashboard sidebar
- Settings page header
- Settings profile section

## ✅ Quick Test

1. Create new account
2. Verify email
3. Sign in
4. Should see onboarding
5. Complete all 4 steps
6. Should redirect to dashboard
7. Should see your role in header
8. Sign out and sign in again
9. Should skip onboarding
10. Should go directly to dashboard

## 🎉 Result

New users get a personalized onboarding experience and their role is displayed throughout the app instead of the static "Lead Developer" text!


## 🛠️ Troubleshooting

### Not Seeing Onboarding Flow?

**Quick Fix - Run This Command:**
```bash
test-onboarding.bat your-email@example.com
```

This automated script will:
1. Check if backend is running
2. Reset your onboarding status
3. Give you next steps

### Manual Troubleshooting

#### Step 1: Check All Users
```bash
check-users.bat
```
This shows all users and their onboarding status.

#### Step 2: Reset Specific User
```bash
node reset-onboarding.js your-email@example.com
```

#### Step 3: Clear Browser Cache
- Press `Ctrl+Shift+Delete`
- Or use Incognito/Private window

#### Step 4: Sign In Again
Go to http://localhost:5500/sign_in.html

### Common Issues

**Issue**: Goes directly to dashboard
**Reason**: Onboarding already completed
**Fix**: Run `test-onboarding.bat your-email@example.com`

**Issue**: Backend not responding
**Reason**: Backend not running
**Fix**: Run `start-backend.bat`

**Issue**: Token not saved
**Reason**: Browser localStorage issue
**Fix**: Clear localStorage (F12 → Application → Local Storage → Clear)

### Detailed Troubleshooting

See `ONBOARDING_TROUBLESHOOTING.md` for comprehensive troubleshooting guide.

## 📦 Helper Scripts

- `test-onboarding.bat` - Automated onboarding test
- `check-users.bat` - Check all users' status
- `check-users-onboarding.js` - View all users' onboarding data
- `reset-onboarding.js` - Reset specific user's onboarding

## 🎯 Next Steps

1. **Test the flow**: Run `test-onboarding.bat your-email@example.com`
2. **Clear browser cache**: Use Incognito or clear cache
3. **Sign in**: You should see the onboarding flow!
4. **Complete onboarding**: Go through all 4 steps
5. **Verify**: Check that your role appears in dashboard
