# Settings Page - Testing Guide

## 🧪 Complete Testing Checklist

### Prerequisites
- [ ] Backend running on port 3000
- [ ] Frontend running on port 5500
- [ ] Signed in with valid account
- [ ] MongoDB connected
- [ ] Multer installed (`npm install multer`)

## 1️⃣ Profile Photo Upload Tests

### Test 1.1: Upload Valid Image
**Steps:**
1. Navigate to Settings page
2. Click the blue camera icon on profile photo
3. Select a JPG/PNG image (under 5MB)
4. Observe instant preview
5. Wait for upload to complete

**Expected:**
- ✅ File picker opens
- ✅ Image shows immediately in UI
- ✅ Success message appears
- ✅ Photo persists on page refresh
- ✅ Photo shows in header avatar

### Test 1.2: Upload Large File
**Steps:**
1. Click camera icon
2. Select image larger than 5MB

**Expected:**
- ✅ Error message: "Image size must be less than 5MB"
- ✅ Photo doesn't change

### Test 1.3: Upload Non-Image File
**Steps:**
1. Click camera icon
2. Select PDF/TXT/other non-image file

**Expected:**
- ✅ Error message: "Please select an image file"
- ✅ Photo doesn't change

### Test 1.4: Cancel Upload
**Steps:**
1. Click camera icon
2. Click "Cancel" in file picker

**Expected:**
- ✅ Nothing happens
- ✅ Photo remains unchanged

## 2️⃣ Profile Update Tests

### Test 2.1: Update Full Name
**Steps:**
1. Change text in "Full Name" field
2. Click "Save Change" button

**Expected:**
- ✅ Success message appears
- ✅ Name updates in profile section
- ✅ Name updates in header
- ✅ Name persists on page refresh

### Test 2.2: Empty Full Name
**Steps:**
1. Clear "Full Name" field
2. Click "Save Change"

**Expected:**
- ✅ Error message: "Please enter your full name"
- ✅ Name doesn't change

### Test 2.3: Email Field (Read-Only)
**Steps:**
1. Try to click/edit email field

**Expected:**
- ✅ Field is grayed out
- ✅ Cannot edit email
- ✅ Cursor shows "not-allowed"

## 3️⃣ Notification Toggle Tests

### Test 3.1: Toggle Email Notifications
**Steps:**
1. Click "Email Notifications" toggle
2. Observe color change
3. Click "Save Change"

**Expected:**
- ✅ Toggle switches to dark navy when ON
- ✅ Toggle switches to gray when OFF
- ✅ Setting persists on page refresh

### Test 3.2: Toggle System Push
**Steps:**
1. Click "System Push" toggle
2. Observe color change
3. Click "Save Change"

**Expected:**
- ✅ Toggle switches to dark navy when ON
- ✅ Toggle switches to gray when OFF
- ✅ Setting persists on page refresh

## 4️⃣ Password Change Tests

### Test 4.1: Change Password (Local Auth)
**Steps:**
1. Click arrow (→) next to "Change Password"
2. Enter current password
3. Enter new password (min 6 chars)
4. Confirm new password
5. Click "Update Password"

**Expected:**
- ✅ Modal opens
- ✅ All fields are empty
- ✅ Success message appears
- ✅ Modal closes
- ✅ Can sign in with new password

### Test 4.2: Wrong Current Password
**Steps:**
1. Open password modal
2. Enter incorrect current password
3. Enter new password
4. Click "Update Password"

**Expected:**
- ✅ Error message: "Current password is incorrect"
- ✅ Password doesn't change

### Test 4.3: Passwords Don't Match
**Steps:**
1. Open password modal
2. Enter current password
3. Enter new password
4. Enter different confirm password
5. Click "Update Password"

**Expected:**
- ✅ Error message: "New passwords do not match"
- ✅ Password doesn't change

### Test 4.4: Password Too Short
**Steps:**
1. Open password modal
2. Enter current password
3. Enter new password with less than 6 characters
4. Click "Update Password"

**Expected:**
- ✅ Error message: "New password must be at least 6 characters"
- ✅ Password doesn't change

### Test 4.5: Cancel Password Change
**Steps:**
1. Open password modal
2. Fill in some fields
3. Click "Cancel"

**Expected:**
- ✅ Modal closes
- ✅ Fields are cleared
- ✅ Password unchanged

### Test 4.6: Social Auth User
**Steps:**
1. Sign in with Google/Facebook
2. Navigate to Settings
3. Click arrow next to "Change Password"

**Expected:**
- ✅ Alert message: "You signed in with [provider]. Password change is not available for social login accounts."
- ✅ Modal doesn't open

## 5️⃣ Integration Tests

### Test 5.1: View Connected Integration
**Steps:**
1. Navigate to Settings
2. Scroll to Integrations section

**Expected:**
- ✅ GitHub integration shows if connected
- ✅ Username displays correctly
- ✅ "Disconnect" button visible

### Test 5.2: Disconnect Integration
**Steps:**
1. Click "Disconnect" button
2. Confirm in dialog

**Expected:**
- ✅ Confirmation dialog appears
- ✅ Success message after confirmation
- ✅ Integration removed from list

### Test 5.3: Cancel Disconnect
**Steps:**
1. Click "Disconnect" button
2. Click "Cancel" in dialog

**Expected:**
- ✅ Dialog closes
- ✅ Integration remains connected

## 6️⃣ Navigation Tests

### Test 6.1: Tab Navigation
**Steps:**
1. Click each tab (Dashboard, Tasks, Source Code, Settings)

**Expected:**
- ✅ Each page loads correctly
- ✅ Active tab highlighted in dark navy
- ✅ User remains signed in

### Test 6.2: Sidebar Navigation
**Steps:**
1. Use sidebar links to navigate

**Expected:**
- ✅ All links work
- ✅ Settings accessible from sidebar

## 7️⃣ Loading & Performance Tests

### Test 7.1: Skeleton Loading
**Steps:**
1. Clear cache (Ctrl+Shift+R)
2. Navigate to Settings page
3. Observe loading state

**Expected:**
- ✅ Skeleton loader shows immediately
- ✅ Smooth fade-in when content loads
- ✅ No flash of unstyled content

### Test 7.2: Page Refresh
**Steps:**
1. Make changes to settings
2. Refresh page (F5)

**Expected:**
- ✅ All changes persist
- ✅ Profile photo remains
- ✅ Toggle states correct

## 8️⃣ Security Tests

### Test 8.1: Unauthenticated Access
**Steps:**
1. Sign out
2. Try to access settings.html directly

**Expected:**
- ✅ Redirects to sign_in.html
- ✅ Cannot access settings

### Test 8.2: Expired Token
**Steps:**
1. Sign in
2. Wait for token to expire (7 days)
3. Try to use settings

**Expected:**
- ✅ Error message
- ✅ Redirects to sign in

### Test 8.3: File Upload Security
**Steps:**
1. Try to upload executable file (.exe)
2. Try to upload script file (.js, .php)

**Expected:**
- ✅ Only image files accepted
- ✅ Error message for invalid types

## 9️⃣ Responsive Design Tests

### Test 9.1: Mobile View
**Steps:**
1. Open DevTools (F12)
2. Toggle device toolbar
3. Test on various screen sizes

**Expected:**
- ✅ Layout adapts to screen size
- ✅ All buttons accessible
- ✅ Text readable
- ✅ No horizontal scroll

### Test 9.2: Tablet View
**Steps:**
1. Test on iPad/tablet size

**Expected:**
- ✅ Proper spacing
- ✅ Cards stack appropriately
- ✅ Touch targets large enough

## 🔟 Edge Cases

### Test 10.1: Very Long Name
**Steps:**
1. Enter very long name (100+ characters)
2. Save changes

**Expected:**
- ✅ Name truncates in UI
- ✅ Full name stored in database
- ✅ No layout breaking

### Test 10.2: Special Characters
**Steps:**
1. Enter name with special characters (émojis, ñ, etc.)
2. Save changes

**Expected:**
- ✅ Characters display correctly
- ✅ Saves properly
- ✅ No encoding issues

### Test 10.3: Rapid Clicks
**Steps:**
1. Click "Save Change" multiple times rapidly

**Expected:**
- ✅ Only one request sent
- ✅ No duplicate saves
- ✅ Proper loading state

## 📊 Test Results Template

```
Date: ___________
Tester: ___________

Profile Photo Upload:     [ ] Pass  [ ] Fail
Profile Update:           [ ] Pass  [ ] Fail
Notification Toggles:     [ ] Pass  [ ] Fail
Password Change:          [ ] Pass  [ ] Fail
Integrations:             [ ] Pass  [ ] Fail
Navigation:               [ ] Pass  [ ] Fail
Loading States:           [ ] Pass  [ ] Fail
Security:                 [ ] Pass  [ ] Fail
Responsive Design:        [ ] Pass  [ ] Fail
Edge Cases:               [ ] Pass  [ ] Fail

Overall Status:           [ ] Pass  [ ] Fail

Notes:
_________________________________
_________________________________
_________________________________
```

## 🐛 Bug Report Template

```
Bug Title: ___________
Severity: [ ] Critical  [ ] High  [ ] Medium  [ ] Low

Steps to Reproduce:
1. ___________
2. ___________
3. ___________

Expected Result:
___________

Actual Result:
___________

Browser: ___________
OS: ___________
Screenshot: ___________
```

## ✅ All Tests Passed?

If all tests pass, the Settings page is ready for production! 🎉

If any tests fail, check:
1. Backend is running
2. MongoDB is connected
3. Multer is installed
4. JWT token is valid
5. Browser console for errors
6. Network tab for failed requests
