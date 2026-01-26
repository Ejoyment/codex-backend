# 🚀 Deploy to Render.com TONIGHT - Step by Step

## ⏱️ Time Required: 10-15 minutes

---

## STEP 1: Create GitHub Repository (5 minutes)

### 1.1 Go to GitHub
- Open: https://github.com
- Sign in (or create account if needed)

### 1.2 Create New Repository
- Click green **"New"** button (top left)
- Repository name: `codex-inc-backend`
- Description: `CODEX INC Backend`
- Select: **Private** (keep your code private)
- **DO NOT** check "Add README"
- Click **"Create repository"**

### 1.3 Upload Your Code
You'll see instructions. Follow "push an existing repository":

Open Command Prompt in your project folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/codex-inc-backend.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

**If you don't have Git installed:**
- Download: https://git-scm.com/download/win
- Install with default settings
- Restart Command Prompt
- Run commands above

---

## STEP 2: Sign Up for Render.com (2 minutes)

### 2.1 Go to Render
- Open: https://render.com
- Click **"Get Started"** or **"Sign Up"**

### 2.2 Sign Up with GitHub
- Click **"Sign in with GitHub"**
- Authorize Render to access your GitHub
- This connects your GitHub repos to Render

---

## STEP 3: Create Web Service (3 minutes)

### 3.1 Create New Web Service
- Click **"New +"** button (top right)
- Select **"Web Service"**

### 3.2 Connect Repository
- You'll see your GitHub repos
- Find **"codex-inc-backend"**
- Click **"Connect"**

### 3.3 Configure Service
Fill in these settings:

**Name:** `codex-inc-backend`

**Region:** Choose closest to you (e.g., Oregon, Frankfurt)

**Branch:** `main`

**Root Directory:** Leave empty

**Runtime:** `Node`

**Build Command:** `npm install`

**Start Command:** `npm start`

**Instance Type:** Select **"Free"** (512MB RAM - enough for your app!)

Click **"Advanced"** to add environment variables (next step)

---

## STEP 4: Add Environment Variables (5 minutes)

Click **"Add Environment Variable"** and add these ONE BY ONE:

### Required Variables:

**1. NODE_ENV**
- Key: `NODE_ENV`
- Value: `production`

**2. PORT**
- Key: `PORT`
- Value: `3000`

**3. MONGODB_URI**
- Key: `MONGODB_URI`
- Value: `mongodb+srv://dejoymene_db_user:nS3P4TnVyK0C9zKE@cluster0.h8xxyo6.mongodb.net/codex-inc?retryWrites=true&w=majority`

**4. JWT_SECRET**
- Key: `JWT_SECRET`
- Value: `a79f769f81087a64d4fc01937237b480319b0e8c6d9f3dec4fc45b41307b85f3`

**5. FRONTEND_URL**
- Key: `FRONTEND_URL`
- Value: (Leave this for now, we'll update after deployment)

**6. BACKEND_URL**
- Key: `BACKEND_URL`
- Value: (Leave this for now, we'll update after deployment)

**7. EMAIL_HOST**
- Key: `EMAIL_HOST`
- Value: `smtp.gmail.com`

**8. EMAIL_PORT**
- Key: `EMAIL_PORT`
- Value: `465`

**9. EMAIL_SECURE**
- Key: `EMAIL_SECURE`
- Value: `true`

**10. EMAIL_USER**
- Key: `EMAIL_USER`
- Value: `dejoymene@gmail.com`

**11. EMAIL_PASSWORD**
- Key: `EMAIL_PASSWORD`
- Value: `tpxnwhbisneunljn`

**12. EMAIL_FROM**
- Key: `EMAIL_FROM`
- Value: `CODEX INC <noreply@codexinc.com>`

**13. GITHUB_CLIENT_ID**
- Key: `GITHUB_CLIENT_ID`
- Value: `Ov23li9tWag2JTumqvMJ`

**14. GITHUB_CLIENT_SECRET**
- Key: `GITHUB_CLIENT_SECRET`
- Value: `530a29efec8ec0ae545b11661e1cc1a7d6cf8dba`

**15. DISCORD_CLIENT_ID**
- Key: `DISCORD_CLIENT_ID`
- Value: `1464983482848645384`

**16. DISCORD_CLIENT_SECRET**
- Key: `DISCORD_CLIENT_SECRET`
- Value: `wgA8R71cduAiVf6eUX3BabI1Vxgdghr7`

**17. SLACK_CLIENT_ID**
- Key: `SLACK_CLIENT_ID`
- Value: `10362491062339.10372605732196`

**18. SLACK_CLIENT_SECRET**
- Key: `SLACK_CLIENT_SECRET`
- Value: `b4c6f3c30616987d84bb1d9b3353cb5a`

**19. NOTION_CLIENT_ID**
- Key: `NOTION_CLIENT_ID`
- Value: `2f3d872b-594c-8072-900f-0037cf4c956c`

**20. NOTION_CLIENT_SECRET**
- Key: `NOTION_CLIENT_SECRET`
- Value: `secret_9zovzAHIpdv3mWPnIENT69CyEYefHhxTh3etHwpc0uw`

**21. FIGMA_CLIENT_ID**
- Key: `FIGMA_CLIENT_ID`
- Value: `opGonODwSLAxr1yRUA7zzs`

**22. FIGMA_CLIENT_SECRET**
- Key: `FIGMA_CLIENT_SECRET`
- Value: `eH8l7H3hBMLaE2gkxYz2XZWXT4KZQl`

**23. STRIPE_SECRET_KEY**
- Key: `STRIPE_SECRET_KEY`
- Value: `sk_test_51StGFZFau6CKO3Vah4aXtZLJrEUQfkHpsw4VpasI53QeOSMJVcOzgiWRFZywRiEUhjlDzzFeu6UsSTuTmgmFdxnk00uVn2wrnL`

**24. STRIPE_PUBLISHABLE_KEY**
- Key: `STRIPE_PUBLISHABLE_KEY`
- Value: `pk_test_51StGFZFau6CKO3VaXxn7lRJ4vq9NOrHbLyLw8m4Sbuvbx8cuzCSNtWTEnuv4F0ro0fsj74mbEGS9fQ9rMIxi9pvc00XmaFNBdh`

**25. STRIPE_WEBHOOK_SECRET**
- Key: `STRIPE_WEBHOOK_SECRET`
- Value: `whsec_dfe7c3a75073a57adb5db0e64c8dfb26f2738de7f85d87907d0fb45c9b584ed1`

**26. STRIPE_PROFESSIONAL_PRICE_ID**
- Key: `STRIPE_PROFESSIONAL_PRICE_ID`
- Value: `price_1StGQSFau6CKO3VawRcrLBv1`

**27. GROQ_API_KEY**
- Key: `GROQ_API_KEY`
- Value: `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`

**28. GROQ_MODEL**
- Key: `GROQ_MODEL`
- Value: `llama-3.1-8b-instant`

**29. AI_PROVIDER**
- Key: `AI_PROVIDER`
- Value: `groq`

**30. AI_MAX_TOKENS**
- Key: `AI_MAX_TOKENS`
- Value: `8192`

**31. AI_TEMPERATURE**
- Key: `AI_TEMPERATURE`
- Value: `0.7`

**32. GOOGLE_CLIENT_ID**
- Key: `GOOGLE_CLIENT_ID`
- Value: `892410864660-uv935akqnuu83nerva9b65o9pa4vjccc.apps.googleusercontent.com`

**33. GOOGLE_CLIENT_SECRET**
- Key: `GOOGLE_CLIENT_SECRET`
- Value: `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`

**34. OTP_EXPIRY_MINUTES**
- Key: `OTP_EXPIRY_MINUTES`
- Value: `10`

---

## STEP 5: Deploy! (2 minutes)

- Scroll down
- Click **"Create Web Service"**
- Render will start building and deploying
- Wait 2-3 minutes for deployment to complete
- You'll see logs scrolling

**When you see "Live" with a green dot - YOU'RE LIVE!**

---

## STEP 6: Get Your URL

- At the top, you'll see your URL: `https://codex-inc-backend-XXXX.onrender.com`
- Copy this URL

---

## STEP 7: Update Environment Variables

Now update the URLs we left blank:

1. Click **"Environment"** in left sidebar
2. Find `FRONTEND_URL` and `BACKEND_URL`
3. Set both to your Render URL: `https://codex-inc-backend-XXXX.onrender.com`
4. Click **"Save Changes"**
5. Render will automatically redeploy (takes 1 minute)

---

## STEP 8: Update OAuth Callbacks

Add your new Render URL to OAuth providers:

### GitHub
- Go to: https://github.com/settings/developers
- Edit your OAuth App
- Add callback: `https://codex-inc-backend-XXXX.onrender.com/api/integrations/github/callback`

### Discord
- Go to: https://discord.com/developers/applications
- Add redirect: `https://codex-inc-backend-XXXX.onrender.com/api/integrations/discord/callback`

### Slack
- Go to: https://api.slack.com/apps
- Add redirect: `https://codex-inc-backend-XXXX.onrender.com/api/integrations/slack/callback`

### Notion
- Go to: https://www.notion.so/my-integrations
- Add redirect: `https://codex-inc-backend-XXXX.onrender.com/api/integrations/notion/callback`

### Figma
- Go to: https://www.figma.com/developers/apps
- Add callback: `https://codex-inc-backend-XXXX.onrender.com/api/integrations/figma/callback`

### Google
- Go to: https://console.cloud.google.com/apis/credentials
- Add redirect: `https://codex-inc-backend-XXXX.onrender.com/auth/google/callback`

---

## STEP 9: Test Your Site!

Visit: `https://codex-inc-backend-XXXX.onrender.com`

You should see your API running!

Test endpoints:
- `https://codex-inc-backend-XXXX.onrender.com/api/health` - Should return OK

---

## ✅ SUCCESS CHECKLIST

- [ ] GitHub repo created
- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] Web service created
- [ ] All environment variables added
- [ ] Service deployed (green "Live" status)
- [ ] URLs updated in environment
- [ ] OAuth callbacks updated
- [ ] Site is accessible
- [ ] Health check works

---

## 🎉 YOU'RE LIVE!

Your backend is now running on Render with:
- ✅ 512MB RAM (no memory limits!)
- ✅ Free tier
- ✅ Automatic SSL (HTTPS)
- ✅ Auto-deploys on git push
- ✅ Built-in monitoring

---

## 📝 IMPORTANT NOTES

### Free Tier Limitations:
- App sleeps after 15 minutes of inactivity
- First request after sleep takes 30-60 seconds to wake up
- 750 hours/month free (enough for 24/7 if only one service)

### To Upgrade (Optional):
- $7/month for always-on service
- No sleep, faster performance
- More RAM if needed

---

## 🆘 TROUBLESHOOTING

### Build Failed?
- Check logs in Render dashboard
- Make sure `package.json` is in root of repo
- Verify all files were pushed to GitHub

### App Crashes?
- Check logs in Render dashboard
- Verify MongoDB URI is correct
- Check all environment variables are set

### Can't Access?
- Make sure service shows "Live" (green)
- Check the URL is correct
- Try `/api/health` endpoint first

---

## 🔄 UPDATING YOUR APP

To update your app later:

```bash
git add .
git commit -m "Update message"
git push
```

Render automatically deploys changes!

---

**Need help? Let me know which step you're on!**
