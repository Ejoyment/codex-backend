# Deploy CODEX INC to Production

## Option 1: Railway (Easiest - Free Tier)

### Step 1: Prepare Your Code
```bash
# Make sure you have a .gitignore
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo "uploads/" >> .gitignore

# Initialize git if not already
git init
git add .
git commit -m "Initial commit"
```

### Step 2: Deploy to Railway
1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys

### Step 3: Add Environment Variables
In Railway dashboard, add these variables:
```
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secret_key_here
FRONTEND_URL=https://your-app.railway.app
BACKEND_URL=https://your-app-backend.railway.app

# OAuth Credentials
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Groq AI
GROQ_API_KEY=your_groq_api_key

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Step 4: Update OAuth Redirect URLs
Update callback URLs in each service:

**GitHub:**
- Go to https://github.com/settings/developers
- Edit your OAuth App
- Change callback URL to: `https://your-app.railway.app/api/integrations/github/callback`

**Discord:**
- Go to https://discord.com/developers/applications
- Select your app → OAuth2
- Add redirect: `https://your-app.railway.app/api/integrations/discord/callback`

**Repeat for Slack, Notion, Figma**

---

## Option 2: Vercel + MongoDB Atlas (Best for Frontend)

### Frontend (Vercel)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy frontend
vercel

# Follow prompts, set build command to: none (static site)
```

### Backend (Railway/Heroku)
Deploy backend separately using Railway (see Option 1)

---

## Option 3: DigitalOcean Droplet (Full Control)

### Cost: $6/month
1. Create Ubuntu droplet
2. Install Node.js, MongoDB, Nginx
3. Set up SSL with Let's Encrypt
4. Configure reverse proxy
5. Deploy with PM2

**Setup Script:**
```bash
# SSH into droplet
ssh root@your_droplet_ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Install PM2
npm install -g pm2

# Clone your repo
git clone your_repo_url
cd your_repo
npm install

# Start with PM2
pm2 start server.js --name codex-backend
pm2 startup
pm2 save

# Install Nginx
sudo apt install nginx

# Configure Nginx (see below)
```

**Nginx Config** (`/etc/nginx/sites-available/codex`):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /var/www/codex/frontend;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Custom Domain Setup

### Buy Domain
- **Namecheap**: $8-12/year
- **Google Domains**: $12/year
- **Cloudflare**: $8-10/year

### Point to Your Server
1. Get your server IP from Railway/Vercel/DigitalOcean
2. Add DNS records:
   ```
   A Record: @ → your_server_ip
   A Record: www → your_server_ip
   ```
3. Wait 5-60 minutes for DNS propagation

### Enable SSL (Free)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## MongoDB Atlas (Free Tier)

1. Go to https://www.mongodb.com/cloud/atlas
2. Create free cluster (512MB)
3. Create database user
4. Whitelist IP: `0.0.0.0/0` (allow all)
5. Get connection string
6. Add to environment variables

---

## Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] MongoDB Atlas cluster created
- [ ] Environment variables configured
- [ ] OAuth redirect URLs updated
- [ ] Domain DNS configured
- [ ] SSL certificate installed
- [ ] Backend deployed and running
- [ ] Frontend deployed and accessible
- [ ] Test all integrations
- [ ] Test payment flow
- [ ] Test email sending
- [ ] Monitor logs for errors

---

## Cost Breakdown

### Minimal Setup (Free Tier)
- Domain: $12/year
- Railway: Free (500 hours/month)
- MongoDB Atlas: Free (512MB)
- **Total: $1/month**

### Professional Setup
- Domain: $12/year
- Railway Pro: $5/month
- MongoDB Atlas: $9/month (2GB)
- **Total: $15/month**

### Enterprise Setup
- Domain: $12/year
- DigitalOcean Droplet: $24/month (4GB RAM)
- MongoDB Atlas: $57/month (10GB)
- Cloudflare Pro: $20/month
- **Total: $102/month**

---

## Recommendation

**Start with Railway + MongoDB Atlas Free Tier**
- Deploy in 10 minutes
- Free for testing
- Upgrade when you get users
- Easy to scale

**Buy domain only when:**
- You're ready to launch publicly
- You want professional branding
- You need custom email addresses
