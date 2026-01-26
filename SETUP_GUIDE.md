# Complete Setup Guide - Getting All Required Keys

This guide will walk you through getting all the API keys and credentials needed for the CODEX INC authentication system.

---

## 📋 Table of Contents

1. [Gmail App Password](#1-gmail-app-password)
2. [Google OAuth Credentials](#2-google-oauth-credentials)
3. [Facebook OAuth Credentials](#3-facebook-oauth-credentials)
4. [MongoDB Setup](#4-mongodb-setup)
5. [Final Configuration](#5-final-configuration)

---

## 1. Gmail App Password

### Step 1: Enable 2-Step Verification

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Scroll down to **"How you sign in to Google"**
4. Click on **"2-Step Verification"**
5. Click **"Get Started"**
6. Follow the prompts to set up 2-Step Verification (you'll need your phone)
7. Complete the setup

### Step 2: Generate App Password

1. After enabling 2-Step Verification, go back to: https://myaccount.google.com/security
2. Scroll down to **"How you sign in to Google"**
3. Click on **"App passwords"** (you might need to sign in again)
4. In the "Select app" dropdown, choose **"Mail"**
5. In the "Select device" dropdown, choose **"Other (Custom name)"**
6. Type: **"CODEX INC Backend"**
7. Click **"Generate"**
8. **IMPORTANT:** Copy the 16-character password (it looks like: `abcd efgh ijkl mnop`)
9. Remove the spaces: `abcdefghijklmnop`

### What to add to .env:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
EMAIL_FROM=CODEX INC <noreply@codexinc.com>
```

**Replace:**
- `your-email@gmail.com` with your actual Gmail address
- `abcdefghijklmnop` with the generated app password (no spaces)

---

## 2. Google OAuth Credentials

### Step 1: Create Google Cloud Project

1. Go to: https://console.cloud.google.com/
2. Click on the project dropdown (top left, next to "Google Cloud")
3. Click **"NEW PROJECT"**
4. Enter project name: **"CODEX INC Auth"**
5. Click **"CREATE"**
6. Wait for the project to be created (notification will appear)
7. Select your new project from the dropdown

### Step 2: Enable Google+ API

1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. Search for: **"Google+ API"**
3. Click on **"Google+ API"**
4. Click **"ENABLE"**

### Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (unless you have a Google Workspace)
3. Click **"CREATE"**
4. Fill in the required fields:
   - **App name:** CODEX INC
   - **User support email:** your-email@gmail.com
   - **Developer contact email:** your-email@gmail.com
5. Click **"SAVE AND CONTINUE"**
6. On "Scopes" page, click **"SAVE AND CONTINUE"**
7. On "Test users" page, click **"ADD USERS"**
8. Add your email address (for testing)
9. Click **"SAVE AND CONTINUE"**
10. Review and click **"BACK TO DASHBOARD"**

### Step 4: Create OAuth Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Select **"Web application"**
4. Name: **"CODEX INC Web Client"**
5. Under **"Authorized JavaScript origins"**, click **"+ ADD URI"**
   - Add: `http://localhost:3000`
6. Under **"Authorized redirect URIs"**, click **"+ ADD URI"**
   - Add: `http://localhost:3000/auth/google/callback`
7. Click **"CREATE"**
8. A popup will show your credentials:
   - **Client ID** (looks like: `123456789-abcdefg.apps.googleusercontent.com`)
   - **Client Secret** (looks like: `GOCSPX-abcdefghijklmnop`)
9. **COPY BOTH** - you'll need them!

### What to add to .env:

```env
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnop
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Replace with your actual values from step 8**

---

## 3. Facebook OAuth Credentials

### Step 1: Create Facebook Developer Account

1. Go to: https://developers.facebook.com/
2. Click **"Get Started"** (top right)
3. If you don't have a developer account:
   - Click **"Next"**
   - Complete the registration
   - Verify your email if needed

### Step 2: Create Facebook App

1. Once logged in, click **"My Apps"** (top right)
2. Click **"Create App"**
3. Select **"Consumer"** (for authentication)
4. Click **"Next"**
5. Fill in the details:
   - **App name:** CODEX INC
   - **App contact email:** your-email@gmail.com
6. Click **"Create App"**
7. Complete the security check if prompted

### Step 3: Add Facebook Login

1. On your app dashboard, find **"Add Products to Your App"**
2. Find **"Facebook Login"** and click **"Set Up"**
3. Select **"Web"** platform
4. Enter Site URL: `http://localhost:5500`
5. Click **"Save"**
6. Click **"Continue"** through the quickstart (you can skip the code examples)

### Step 4: Configure Facebook Login Settings

1. In the left sidebar, click **"Facebook Login"** → **"Settings"**
2. Under **"Valid OAuth Redirect URIs"**, add:
   ```
   http://localhost:3000/auth/facebook/callback
   ```
3. Click **"Save Changes"**

### Step 5: Get App Credentials

1. In the left sidebar, click **"Settings"** → **"Basic"**
2. You'll see:
   - **App ID** (looks like: `1234567890123456`)
   - **App Secret** (click "Show" to reveal, looks like: `abcdef1234567890abcdef1234567890`)
3. **COPY BOTH**

### Step 6: Make App Live (Important!)

1. At the top of the page, you'll see a toggle that says **"In Development"**
2. For testing, you can keep it in development mode
3. Add test users:
   - Go to **"Roles"** → **"Test Users"**
   - Click **"Add"** to create test users
   - Or add your Facebook account as a test user

### What to add to .env:

```env
FACEBOOK_APP_ID=1234567890123456
FACEBOOK_APP_SECRET=abcdef1234567890abcdef1234567890
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback
```

**Replace with your actual values from step 5**

---

## 4. MongoDB Setup

You have two options: Local MongoDB or MongoDB Atlas (Cloud)

### Option A: Local MongoDB (Easier for Development)

#### Windows:

1. Download MongoDB: https://www.mongodb.com/try/download/community
2. Run the installer
3. Choose "Complete" installation
4. Install as a Windows Service
5. After installation, MongoDB will run automatically
6. Default connection string: `mongodb://localhost:27017/codex-inc`

#### Mac (using Homebrew):

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

#### Linux (Ubuntu):

```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### Option B: MongoDB Atlas (Cloud - Free Tier)

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Sign up for a free account
3. Create a free cluster:
   - Click **"Build a Database"**
   - Choose **"FREE"** (M0 Sandbox)
   - Select a cloud provider and region (closest to you)
   - Click **"Create"**
4. Create a database user:
   - Username: `codexadmin`
   - Password: Generate a secure password (save it!)
   - Click **"Create User"**
5. Add your IP address:
   - Click **"Add My Current IP Address"**
   - Or add `0.0.0.0/0` for access from anywhere (less secure, only for development)
   - Click **"Finish and Close"**
6. Get connection string:
   - Click **"Connect"**
   - Choose **"Connect your application"**
   - Copy the connection string (looks like):
     ```
     mongodb+srv://codexadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your actual password
   - Add database name: `mongodb+srv://codexadmin:yourpassword@cluster0.xxxxx.mongodb.net/codex-inc?retryWrites=true&w=majority`

### What to add to .env:

**For Local MongoDB:**
```env
MONGODB_URI=mongodb://localhost:27017/codex-inc
```

**For MongoDB Atlas:**
```env
MONGODB_URI=mongodb+srv://codexadmin:yourpassword@cluster0.xxxxx.mongodb.net/codex-inc?retryWrites=true&w=majority
```

---

## 5. Final Configuration

### Step 1: Create .env File

1. In your project root, create a file named `.env` (no extension)
2. Copy the contents from `.env.example`
3. Fill in all the values you collected above

### Complete .env Example:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/codex-inc

# JWT Secret (generate a random string)
JWT_SECRET=my-super-secret-jwt-key-change-this-to-something-random

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=youremail@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
EMAIL_FROM=CODEX INC <noreply@codexinc.com>

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnop
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=1234567890123456
FACEBOOK_APP_SECRET=abcdef1234567890abcdef1234567890
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback

# Frontend URL
FRONTEND_URL=http://localhost:5500

# OTP Configuration
OTP_EXPIRY_MINUTES=10
```

### Step 2: Generate JWT Secret

You can generate a random JWT secret using:

**Option 1 - Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option 2 - Online:**
- Go to: https://randomkeygen.com/
- Copy a "CodeIgniter Encryption Key"

**Option 3 - Simple:**
- Just type a long random string: `my-very-long-random-secret-key-12345`

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Start the Application

**Terminal 1 - Start MongoDB (if using local):**
```bash
mongod
```

**Terminal 2 - Start Backend:**
```bash
npm start
```

**Terminal 3 - Start Frontend:**
```bash
# Using Python
python -m http.server 5500

# Or using Node.js
npx http-server -p 5500

# Or use VS Code Live Server extension
```

### Step 5: Test the Application

1. Open browser: `http://localhost:5500`
2. Click "Start Free Trial"
3. Fill in the signup form
4. Check your email for OTP
5. Enter OTP to verify
6. Try signing in
7. Try Google/Facebook login

---

## 🎯 Quick Checklist

- [ ] Gmail App Password obtained
- [ ] Google OAuth Client ID & Secret obtained
- [ ] Facebook App ID & Secret obtained
- [ ] MongoDB running (local or Atlas)
- [ ] .env file created with all values
- [ ] Dependencies installed (`npm install`)
- [ ] Backend server running (`npm start`)
- [ ] Frontend server running
- [ ] Test signup with email
- [ ] Test OTP verification
- [ ] Test sign in
- [ ] Test Google login
- [ ] Test Facebook login

---

## 🐛 Troubleshooting

### Email not sending
- Double-check Gmail App Password (no spaces)
- Ensure 2-Step Verification is enabled
- Try generating a new App Password

### Google OAuth error
- Verify redirect URI matches exactly: `http://localhost:3000/auth/google/callback`
- Check if Google+ API is enabled
- Add your email as a test user

### Facebook OAuth error
- Verify redirect URI matches exactly: `http://localhost:3000/auth/facebook/callback`
- Check if app is in Development mode
- Add yourself as a test user

### MongoDB connection error
- Ensure MongoDB is running (`mongod` command)
- Check connection string format
- For Atlas, verify IP whitelist

### Port already in use
- Change PORT in .env to 3001 or another available port
- Update GOOGLE_CALLBACK_URL and FACEBOOK_CALLBACK_URL accordingly

---

## 📞 Need Help?

If you encounter any issues:

1. Check the console logs for error messages
2. Verify all environment variables are set correctly
3. Ensure all services (MongoDB, backend, frontend) are running
4. Check that ports 3000 and 5500 are not blocked

---

## 🎉 Success!

Once everything is set up, you'll have a fully functional authentication system with:
- Email/Password authentication
- Email OTP verification
- Google OAuth login
- Facebook OAuth login
- Secure JWT tokens
- Beautiful responsive UI

Enjoy your CODEX INC authentication system! 🚀
