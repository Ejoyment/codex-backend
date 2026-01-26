# 🚀 DEPLOY TO RENDER.COM - TONIGHT

## ⏱️ Total Time: 15 minutes

---

## STEP 1: Create GitHub Account & Repository (5 min)

### 1. Go to GitHub
- Open: **https://github.com**
- Click **"Sign up"** (if you don't have account)
- Or **"Sign in"** (if you have account)

### 2. Create New Repository
- Click green **"New"** button (top left corner)
- Fill in:
  - **Repository name:** `codex-inc-backend`
  - **Description:** `CODEX INC Backend`
  - **Private** (select this)
  - **DO NOT** check "Add README"
- Click **"Create repository"**

### 3. Install Git (if not installed)
- Download: **https://git-scm.com/download/win**
- Run installer, click "Next" for everything
- Restart your computer

### 4. Push Your Code to GitHub
Open **Command Prompt** in your project folder:
- Press `Windows + R`
- Type: `cmd`
- Press Enter
- Type: `cd C:\path\to\your\project\deployment`
- Press Enter

Then run these commands ONE BY ONE:

```bash
git init
```
Press Enter, wait for it to finish.

```bash
git add .
```
Press Enter, wait for it to finish.

```bash
git commit -m "Initial commit"
```
Press Enter, wait for it to finish.

```bash
git branch -M main
```
Press Enter, wait for it to finish.

```bash
git remote add origin https://github.com/YOUR_USERNAME/codex-inc-backend.git
```
**IMPORTANT:** Replace `YOUR_USERNAME` with your actual GitHub username!
Press Enter.

```bash
git push -u origin main
```
Press Enter. It will ask for your GitHub username and password.
- Username: Your GitHub username
- Password: Use a **Personal Access Token** (not your password)

**To get Personal Access Token:**
- Go to: https://github.com/settings/tokens
- Click **"Generate new token (classic)"**
- Give it a name: `Render Deploy`
- Check: **repo** (all checkboxes under it)
- Click **"Generate token"**
- **COPY THE TOKEN** (you won't see it again!)
- Paste it as password in Command Prompt

---

## STEP 2: Sign Up for Render.com (2 min)

### 1. Go to Render
- Open: **https://render.com**
- Click **"Get Started"** or **"Sign Up"**

### 2. Sign Up with GitHub
- Click **"Sign in with GitHub"**
- Click **"Authorize Render"**
- Done!

---

## STEP 3: Create Web Service on Render (3 min)

### 1. Create New Service
- Click **"New +"** button (top right)
- Select **"Web Service"**

### 2. Connect Your Repository
- You'll see list of your GitHub repos
- Find **"codex-inc-backend"**
- Click **"Connect"**

### 3. Configure Service
Fill in these fields:

**Name:** `codex-inc-backend`

**Region:** Select closest to you (e.g., Oregon USA, Frankfurt Europe)

**Branch:** `main`

**Root Directory:** Leave **EMPTY**

**Runtime:** `Node`

**Build Command:** `npm install`

**Start Command:** `npm start`

**Instance Type:** Select **"Free"** (512MB RAM)

**DON'T CLICK CREATE YET!**

Scroll down and click **"Advanced"** button.

---

## STEP 4: Add Environment Variables (5 min)

Click **"Add Environment Variable"** button.

Copy and paste these ONE BY ONE:

```
NODE_ENV=production
```

```
PORT=3000
```

```
MONGODB_URI=mongodb+srv://dejoymene_db_user:nS3P4TnVyK0C9zKE@cluster0.h8xxyo6.mongodb.net/codex-inc?retryWrites=true&w=majority
```

```
JWT_SECRET=a79f769f81087a64d4fc01937237b480319b0e8c6d9f3dec4fc45b41307b85f3
```

```
FRONTEND_URL=https://codexincenterprise.online
```

```
BACKEND_URL=https://codexincenterprise.online
```

```
EMAIL_HOST=smtp.gmail.com
```

```
EMAIL_PORT=465
```

```
EMAIL_SECURE=true
```

```
EMAIL_USER=dejoymene@gmail.com
```

```
EMAIL_PASSWORD=tpxnwhbisneunljn
```

```
EMAIL_FROM=CODEX INC <noreply@codexinc.com>
```

```
GITHUB_CLIENT_ID=Ov23li9tWag2JTumqvMJ
```

```
GITHUB_CLIENT_SECRET=530a29efec8ec0ae545b11661e1cc1a7d6cf8dba
```

```
DISCORD_CLIENT_ID=1464983482848645384
```

```
DISCORD_CLIENT_SECRET=wgA8R71cduAiVf6eUX3BabI1Vxgdghr7
```

```
SLACK_CLIENT_ID=10362491062339.10372605732196
```

```
SLACK_CLIENT_SECRET=b4c6f3c30616987d84bb1d9b3353cb5a
```

```
NOTION_CLIENT_ID=2f3d872b-594c-8072-900f-0037cf4c956c
```

```
NOTION_CLIENT_SECRET=secret_9zovzAHIpdv3mWPnIENT69CyEYefHhxTh3etHwpc0uw
```

```
FIGMA_CLIENT_ID=opGonODwSLAxr1yRUA7zzs
```

```
FIGMA_CLIENT_SECRET=eH8l7H3hBMLaE2gkxYz2XZWXT4KZQl
```

```
STRIPE_SECRET_KEY=sk_test_51StGFZFau6CKO3Vah4aXtZLJrEUQfkHpsw4VpasI53QeOSMJVcOzgiWRFZywRiEUhjlDzzFeu6UsSTuTmgmFdxnk00uVn2wrnL
```

```
STRIPE_PUBLISHABLE_KEY=pk_test_51StGFZFau6CKO3VaXxn7lRJ4vq9NOrHbLyLw8m4Sbuvbx8cuzCSNtWTEnuv4F0ro0fsj74mbEGS9fQ9rMIxi9pvc00XmaFNBdh
```

```
STRIPE_WEBHOOK_SECRET=whsec_dfe7c3a75073a57adb5db0e64c8dfb26f2738de7f85d87907d0fb45c9b584ed1
```

```
STRIPE_PROFESSIONAL_PRICE_ID=price_1StGQSFau6CKO3VawRcrLBv1
```

```
GROQ_API_KEY=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
```

```
GROQ_MODEL=llama-3.1-8b-instant
```

```
AI_PROVIDER=groq
```

```
AI_MAX_TOKENS=8192
```

```
AI_TEMPERATURE=0.7
```

```
GOOGLE_CLIENT_ID=892410864660-uv935akqnuu83nerva9b65o9pa4vjccc.apps.googleusercontent.com
```

```
GOOGLE_CLIENT_SECRET=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
```

```
OTP_EXPIRY_MINUTES=10
```

---

## STEP 5: DEPLOY! (2 min)

- Scroll to bottom
- Click **"Create Web Service"**
- Wait 2-3 minutes
- Watch the logs scroll
- When you see **"Live"** with green dot → **YOU'RE LIVE!**

---

## STEP 6: Get Your Live URL

At the top of the page, you'll see:
```
https://codex-inc-backend-XXXX.onrender.com
```

**COPY THIS URL!** This is your live backend!

---

## STEP 7: Test It!

Open your browser and go to:
```
https://codex-inc-backend-XXXX.onrender.com/api/health
```

You should see:
```json
{
  "status": "OK",
  "message": "CODEX INC Backend is running"
}
```

---

## 🎉 YOU'RE LIVE!

Your app is now running on Render with:
- ✅ No memory limits (512MB RAM)
- ✅ Free tier
- ✅ Automatic HTTPS
- ✅ MongoDB connected
- ✅ All integrations ready

---

## 📝 IMPORTANT NOTES

### Free Tier Info:
- App sleeps after 15 min of no activity
- First request after sleep takes 30-60 seconds
- This is normal for free tier
- Upgrade to $7/month for always-on

### Your URLs:
- **Backend:** `https://codex-inc-backend-XXXX.onrender.com`
- **Frontend:** Keep using your Spaceship domain for HTML files

---

## 🆘 NEED HELP?

Tell me:
1. Which step you're on
2. What you see on screen
3. Any error messages

I'll guide you through it!

---

## ✅ CHECKLIST

- [ ] GitHub account created
- [ ] Repository created
- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] Web service created
- [ ] Environment variables added
- [ ] Service shows "Live" (green)
- [ ] Health check works

**Once all checked → YOU'RE DONE!**
