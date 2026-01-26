# How to Get Your Spaceship FTP Credentials

## Method 1: From Spaceship Dashboard (Easiest)

### Step 1: Login to Spaceship
1. Go to: https://www.spaceship.com/login
2. Login with your account

### Step 2: Navigate to Hosting
1. Click on **"Hosting"** in the main menu
2. Find your domain: **codexincenterprise.online**
3. Click on it to open hosting details

### Step 3: Find FTP/SFTP Access
Look for one of these sections:
- **"FTP Access"**
- **"File Manager"**
- **"cPanel Access"**
- **"Hosting Details"**

### Step 4: Get Credentials
You should see:
- **FTP Host:** Usually `ftp.codexincenterprise.online` or an IP address
- **Username:** Your FTP username (might be same as your Spaceship username)
- **Password:** Either shown or you can reset it

### Step 5: Copy Credentials
Write down or copy:
```
FTP Host: _________________
FTP Username: _________________
FTP Password: _________________
FTP Port: 21 (default)
```

---

## Method 2: Check Welcome Email

When you signed up for Spaceship hosting, they sent you a welcome email with:
- Subject: "Welcome to Spaceship" or "Your Hosting Account Details"
- Contains: FTP credentials, cPanel login, nameservers

**Search your email for:**
- From: Spaceship
- Keywords: "FTP", "hosting", "credentials", "codexincenterprise.online"

---

## Method 3: Contact Spaceship Support

If you can't find the credentials:

### Live Chat (Fastest)
1. Go to: https://www.spaceship.com
2. Click the chat icon (bottom right)
3. Ask: "I need my FTP credentials for codexincenterprise.online"

### Email Support
- Email: support@spaceship.com
- Subject: "FTP Credentials for codexincenterprise.online"
- They usually respond within 1-2 hours

### Phone Support (if available)
- Check Spaceship website for phone number
- Have your account details ready

---

## Method 4: Reset FTP Password

If you have the username but forgot password:

1. Login to Spaceship dashboard
2. Go to Hosting → Your domain
3. Look for "Reset FTP Password" or "Change Password"
4. Create new password
5. Save it securely

---

## What You're Looking For

Your FTP credentials will look like this:

```
Host: ftp.codexincenterprise.online
Username: codexinc_user (or similar)
Password: YourPassword123
Port: 21
```

OR

```
Host: 123.456.789.012 (IP address)
Username: codexinc_user
Password: YourPassword123
Port: 21
```

---

## Common Spaceship FTP Patterns

Spaceship typically uses these formats:

### FTP Host Options:
- `ftp.codexincenterprise.online`
- `codexincenterprise.online`
- `ftp.spaceship.com`
- An IP address like `123.456.789.012`

### Username Options:
- Your Spaceship account email
- Domain-based: `codexinc` or `codexincenterprise`
- Custom username you created

### Port:
- FTP: Port **21**
- SFTP (secure): Port **22**

---

## Test Your FTP Connection

Once you have credentials, test them:

### Using FileZilla (Free FTP Client)

1. **Download FileZilla:**
   - https://filezilla-project.org/download.php?type=client
   - Install it

2. **Connect:**
   - Open FileZilla
   - Host: `ftp.codexincenterprise.online`
   - Username: (your username)
   - Password: (your password)
   - Port: `21`
   - Click "Quickconnect"

3. **Success:**
   - You should see folders like: `public_html`, `www`, or `httpdocs`
   - This is where you'll upload your files

---

## Alternative: Use File Manager (No FTP Needed)

If you can't get FTP working, Spaceship usually has a web-based File Manager:

1. Login to Spaceship dashboard
2. Go to Hosting → Your domain
3. Click "File Manager" or "cPanel"
4. You can upload files directly through the browser

---

## What to Do Next

Once you have your FTP credentials:

### Option 1: Send Me Credentials (I'll prepare everything)
Send me:
```
FTP Host: 
FTP Username: 
FTP Password: 
```

### Option 2: I'll Prepare Files, You Upload
I can create all production-ready files, and you upload them yourself using FileZilla.

---

## Quick Checklist

- [ ] Login to Spaceship dashboard
- [ ] Navigate to Hosting section
- [ ] Find codexincenterprise.online
- [ ] Locate FTP/SFTP credentials
- [ ] Copy Host, Username, Password
- [ ] Test connection with FileZilla
- [ ] Ready to deploy!

---

## Need Help?

If you're stuck at any step, let me know:
- Can't find the hosting section?
- Don't see FTP credentials?
- Connection not working?

I'll help you troubleshoot!

---

## Screenshot Guide

When you're in Spaceship dashboard, look for sections that say:
- ✓ "FTP Access"
- ✓ "File Manager"
- ✓ "cPanel"
- ✓ "Hosting Details"
- ✓ "Website Settings"
- ✓ "Advanced Settings"

The FTP credentials are usually in one of these sections.
