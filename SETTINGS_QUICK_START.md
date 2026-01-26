# Settings Page - Quick Start Guide

## 🚀 Getting Started

### 1. Install Dependencies
The multer package has been added for file uploads. If you haven't installed it yet:

```bash
npm install
```

Or run the batch file:
```bash
install-multer.bat
```

### 2. Start the Backend
```bash
npm start
```

Or use the batch file:
```bash
start-backend.bat
```

### 3. Open Settings Page
Navigate to: `http://localhost:5500/settings.html`

(Make sure you're signed in first!)

## ✨ Features You Can Use

### Upload Profile Photo
1. Click the blue camera icon on your profile photo
2. Select an image file (JPG, PNG, GIF, WEBP)
3. Maximum size: 5MB
4. Photo updates instantly across the page

### Update Your Profile
1. Edit your full name in the text field
2. Toggle email notifications on/off
3. Toggle system push notifications on/off
4. Click "Save Change" button at the bottom

### Change Your Password
1. Click the arrow (→) next to "Change Password"
2. Enter your current password
3. Enter your new password (minimum 6 characters)
4. Confirm your new password
5. Click "Update Password"

**Note**: Password change is only available if you signed up with email/password (not Google/Facebook)

### Manage Integrations
1. View your connected integrations (e.g., GitHub)
2. Click "Disconnect" to remove an integration
3. Confirm the disconnection

## 📁 File Storage

Profile photos are stored in:
```
uploads/profiles/profile-{timestamp}-{random}.{ext}
```

This directory is created automatically when you upload your first photo.

## 🔒 Security

- All endpoints require JWT authentication
- Only image files are accepted
- File size limited to 5MB
- Old profile photos are automatically deleted
- Passwords are hashed before storage

## 🎨 UI Features

- **Skeleton Loading**: Shows while page loads
- **Instant Preview**: See your photo before upload completes
- **Toggle Switches**: Dark navy color when enabled
- **Modal Dialog**: Clean password change interface
- **Responsive Design**: Works on all screen sizes

## 🐛 Troubleshooting

### Photo Upload Not Working
- Check file size (must be under 5MB)
- Check file type (must be image)
- Check backend is running on port 3000
- Check browser console for errors

### Password Change Not Available
- This feature is only for email/password accounts
- If you signed in with Google/Facebook, you'll see a message

### Changes Not Saving
- Make sure you're signed in
- Check your JWT token hasn't expired
- Check backend console for errors
- Try refreshing the page

## 📝 API Endpoints Used

```
GET    /api/auth/me                    - Get current user
POST   /api/auth/upload-photo          - Upload profile photo
PUT    /api/auth/update-profile        - Update profile info
POST   /api/auth/change-password       - Change password
GET    /api/subscription/current       - Get subscription tier
GET    /api/integrations               - Get integrations
DELETE /api/integrations/:platform/disconnect - Disconnect integration
```

## 🎯 Next Steps

1. Try uploading a profile photo
2. Update your name and preferences
3. Change your password (if using email/password)
4. Connect/disconnect integrations
5. Navigate to other pages using the tabs

Enjoy your new settings page! 🎉
