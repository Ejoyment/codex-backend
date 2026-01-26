# 🔧 MongoDB Connection Timeout Fix

## The Error
```
MongooseError: Operation `users.findOne()` buffering timed out after 10000ms
```

This means your app can't connect to MongoDB Atlas.

---

## 🎯 Quick Fixes (Try in Order)

### Fix 1: Whitelist Your IP Address (Most Common Issue)

MongoDB Atlas blocks connections by default. You need to allow your IP:

1. Go to **MongoDB Atlas**: https://cloud.mongodb.com
2. Sign in to your account
3. Click on your cluster (Cluster0)
4. Click **"Network Access"** in the left sidebar
5. Click **"Add IP Address"**
6. Click **"Allow Access from Anywhere"** (for development)
   - Or click "Add Current IP Address" (more secure)
7. Click **"Confirm"**
8. Wait 1-2 minutes for changes to apply
9. Restart your backend: `start-backend.bat`

---

### Fix 2: Check Your Connection String

Your current connection string:
```
mongodb+srv://dejoymene_db_user:nS3P4TnVyK0C9zKE@cluster0.h8xxyo6.mongodb.net/codex-inc
```

Make sure:
- ✅ Username is correct: `dejoymene_db_user`
- ✅ Password is correct: `nS3P4TnVyK0C9zKE`
- ✅ Cluster URL is correct: `cluster0.h8xxyo6.mongodb.net`
- ✅ Database name is correct: `codex-inc`

To verify:
1. Go to MongoDB Atlas
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Copy the connection string
5. Replace `<password>` with your actual password
6. Update `.env` file if different

---

### Fix 3: Use Local MongoDB (Alternative)

If MongoDB Atlas keeps timing out, use local MongoDB:

#### Install MongoDB Locally:
1. Download: https://www.mongodb.com/try/download/community
2. Install MongoDB Community Server
3. Keep default settings (port 27017)

#### Update .env:
```env
MONGODB_URI=mongodb://localhost:27017/codex-inc
```

#### Restart backend:
```bash
start-backend.bat
```

---

### Fix 4: Check Internet Connection

MongoDB Atlas requires internet. Make sure:
- ✅ You're connected to internet
- ✅ No firewall blocking MongoDB (port 27017)
- ✅ No VPN interfering with connection

---

### Fix 5: Increase Timeout (Already Done)

I've updated `server.js` to increase timeout from 10s to 30s.

Just restart your backend:
```bash
start-backend.bat
```

---

## 🧪 Test Connection

After applying fixes, test the connection:

```bash
start-backend.bat
```

You should see:
```
✓ MongoDB connected successfully
✓ Database: codex-inc
🚀 Server running on port 3000
```

If you see this, MongoDB is working! ✅

---

## 🐛 Still Not Working?

### Check MongoDB Atlas Status:
1. Go to your cluster
2. Look for any warnings or errors
3. Check if cluster is paused (free tier pauses after inactivity)
4. Click "Resume" if paused

### Check Database User:
1. Go to **"Database Access"** in MongoDB Atlas
2. Make sure user `dejoymene_db_user` exists
3. Make sure it has "Read and write to any database" permission
4. If not, create a new user:
   - Username: `codex_user`
   - Password: Generate a strong password
   - Role: Atlas admin or Read/Write
   - Update `.env` with new credentials

### Create New Connection String:
1. In MongoDB Atlas, click **"Connect"**
2. Choose **"Connect your application"**
3. Driver: Node.js
4. Version: 4.1 or later
5. Copy the connection string
6. Replace `<password>` with your actual password
7. Add `/codex-inc` at the end (database name)
8. Update `.env` file

---

## ✅ Recommended Solution

**For Development (Easiest):**
Use **Local MongoDB**:
```env
MONGODB_URI=mongodb://localhost:27017/codex-inc
```

**For Production:**
Use **MongoDB Atlas** with IP whitelisting

---

## 📋 Quick Checklist

- [ ] Whitelisted IP in MongoDB Atlas Network Access
- [ ] Waited 1-2 minutes after whitelisting
- [ ] Verified connection string is correct
- [ ] Checked username and password
- [ ] Restarted backend
- [ ] Checked internet connection
- [ ] Verified cluster is not paused

---

## 🎯 Test Sign In

After fixing MongoDB:

1. Go to sign in page
2. Enter your credentials
3. Click "Sign In"
4. Should work without timeout error!

---

## 💡 Pro Tips

1. **Use Local MongoDB for development** - Faster, no internet needed
2. **Use MongoDB Atlas for production** - Managed, scalable, backed up
3. **Whitelist "0.0.0.0/0"** for development (allows all IPs)
4. **Use specific IP** for production (more secure)

---

## 🆘 Emergency Fix

If nothing works, use this temporary local setup:

1. **Install MongoDB Compass** (GUI): https://www.mongodb.com/try/download/compass
2. **Connect to**: `mongodb://localhost:27017`
3. **Create database**: `codex-inc`
4. **Update .env**:
   ```env
   MONGODB_URI=mongodb://localhost:27017/codex-inc
   ```
5. **Restart backend**

This will work immediately without any configuration!

---

*Last updated: January 24, 2026*
