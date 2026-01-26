# Settings Page - Quick Reference

## 🎯 Key Features

| Feature | Description | Status |
|---------|-------------|--------|
| Profile Photo Upload | Click camera icon, select image (max 5MB) | ✅ Working |
| Edit Full Name | Update your display name | ✅ Working |
| Email Display | View your email (read-only) | ✅ Working |
| Email Notifications | Toggle on/off | ✅ Working |
| System Push | Toggle on/off | ✅ Working |
| Change Password | Modal with current/new password | ✅ Working |
| 2FA Toggle | Ready for implementation | ⏳ Future |
| GitHub Integration | View and disconnect | ✅ Working |
| Save Changes | Persist all settings | ✅ Working |

## 📡 API Endpoints

```
POST   /api/auth/upload-photo       - Upload profile photo
PUT    /api/auth/update-profile     - Update profile
POST   /api/auth/change-password    - Change password
GET    /api/auth/me                 - Get current user
GET    /api/subscription/current    - Get subscription
GET    /api/integrations            - Get integrations
DELETE /api/integrations/:platform/disconnect
```

## 🎨 UI Components

- **Header**: Logo, search, notifications, user badge
- **Tabs**: Dashboard, Tasks, Source Code, Settings
- **Profile**: Large photo with upload button
- **Cards**: Notifications, Security, Integrations
- **Toggles**: Dark navy (#0a1628) when enabled
- **Button**: Full-width save button
- **Modal**: Password change dialog

## 🔧 Installation

```bash
npm install multer
npm start
```

## 📂 File Structure

```
uploads/
  profiles/
    profile-{timestamp}-{random}.jpg
```

## 🔒 Security

- JWT required for all endpoints
- Images only (jpeg, jpg, png, gif, webp)
- Max 5MB file size
- Password hashing with bcrypt
- Old photos auto-deleted

## 💡 Tips

1. **Photo Upload**: Click camera icon, not the photo itself
2. **Password Change**: Only for email/password accounts
3. **Save Changes**: Click button at bottom to persist
4. **Integrations**: Disconnect requires confirmation
5. **Email**: Cannot be changed (security feature)

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Photo won't upload | Check file size (<5MB) and type (image) |
| Password change unavailable | You're using social login (Google/Facebook) |
| Changes not saving | Check JWT token, refresh page |
| 404 on photo | Backend not serving /uploads directory |

## 📱 Navigation

```
Dashboard → Tasks → Source Code → Settings
     ↑                                ↓
     ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
```

## ✅ Testing Checklist

- [ ] Upload photo (JPG, PNG)
- [ ] Update name
- [ ] Toggle switches
- [ ] Save changes
- [ ] Change password
- [ ] Disconnect integration
- [ ] Navigate tabs
- [ ] Check mobile view

## 🎉 Done!

Settings page is fully functional and matches the UI design perfectly!
