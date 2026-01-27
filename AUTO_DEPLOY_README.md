# 🚀 Auto-Deploy System for CODEX INC

Complete automated deployment system for pushing changes to GitHub and auto-deploying to Render.

## 📦 What's Included

### Scripts
- `setup-auto-deploy.bat` - Initial setup and configuration
- `auto-deploy.bat` - Full-featured deployment with prompts
- `quick-deploy.bat` - Fast deployment without prompts
- `watch-and-deploy.bat` - Automatic deployment on file changes
- `deploy-with-tag.bat` - Deployment with version tagging
- `DEPLOY_NOW.bat` - One-click deployment

### Tools
- `deploy-dashboard.html` - Visual deployment dashboard
- `AUTO_DEPLOY_GUIDE.md` - Complete documentation

## 🎯 Quick Start

### First Time Setup

1. **Run Setup Script**
```bash
setup-auto-deploy.bat
```

This will:
- Initialize git repository
- Configure GitHub remote
- Test authentication
- Create .gitignore

2. **Configure GitHub Authentication**

Choose one method:

**Option A: SSH Key (Recommended)**
```bash
# Generate key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub
# Copy key: cat ~/.ssh/id_ed25519.pub
# Add at: https://github.com/settings/keys

# Test
ssh -T git@github.com
```

**Option B: Personal Access Token**
```bash
# Create token at: https://github.com/settings/tokens
# Use HTTPS URL with token
git remote set-url origin https://TOKEN@github.com/USERNAME/REPO.git
```

3. **Enable Render Auto-Deploy**
- Go to: https://dashboard.render.com
- Select your service
- Settings → Auto-Deploy: **Yes**
- Branch: **main**

### Deploy Your Changes

**Method 1: Regular Deploy**
```bash
auto-deploy.bat
```
- Prompts for commit message
- Shows git status
- Confirms before pushing

**Method 2: Quick Deploy**
```bash
quick-deploy.bat
```
- No prompts
- Auto-generated commit message
- Instant deployment

**Method 3: Watch Mode**
```bash
watch-and-deploy.bat
```
- Watches for file changes
- Auto-deploys every 30 seconds
- Runs until stopped (Ctrl+C)

**Method 4: One-Click**
```bash
DEPLOY_NOW.bat
```
- Double-click to deploy
- Minimal output
- Auto-closes after 5 seconds

## 📊 Deployment Dashboard

Open `deploy-dashboard.html` in your browser for:
- Visual deployment controls
- Git status checker
- Recent commits viewer
- Backend health monitor
- Quick links to Render and GitHub

## 🔄 Typical Workflow

### Daily Development
```bash
# 1. Make changes to your files
# Edit dashboard.html, server.js, etc.

# 2. Deploy when ready
auto-deploy.bat
# Enter message: "Fix dashboard loading issue"

# 3. Wait 2-3 minutes
# Render auto-deploys from GitHub

# 4. Verify deployment
# Visit: https://codexincenterprise.online
```

### Active Development Session
```bash
# Start watch mode
watch-and-deploy.bat

# Now just save your files
# Script auto-deploys every 30 seconds

# Stop when done (Ctrl+C)
```

### Release New Version
```bash
# Deploy with version tag
deploy-with-tag.bat
# Enter version: v1.2.0
# Enter message: "Release v1.2.0 - Dashboard improvements"

# Creates git tag and pushes to GitHub
```

## 🎨 Commit Message Best Practices

### Good Examples
```
Fix: Dashboard loading timeout issue
Add: Profile upload functionality
Update: Integration error handling
Refactor: Simplify authentication logic
Docs: Update deployment guide
```

### Bad Examples
```
fix
update
changes
stuff
asdf
```

### Commit Message Format
```
Type: Brief description

Types:
- Fix: Bug fixes
- Add: New features
- Update: Improvements to existing features
- Refactor: Code restructuring
- Docs: Documentation changes
- Style: Formatting, no code change
- Test: Adding tests
```

## 🔧 Configuration

### Change GitHub Repository
```bash
git remote set-url origin https://github.com/NEW_USERNAME/NEW_REPO.git
```

### Change Branch Name
```bash
# Rename current branch to main
git branch -M main

# Update scripts to use new branch name
# Edit auto-deploy.bat, change "main" to your branch
```

### Adjust Watch Interval
Edit `watch-and-deploy.bat`:
```batch
REM Change from 30 to desired seconds
set "WATCH_INTERVAL=60"
```

## 🐛 Troubleshooting

### "Git is not installed"
**Solution:**
1. Download Git: https://git-scm.com/
2. Install with default options
3. Restart Command Prompt
4. Run `git --version` to verify

### "Authentication failed"
**Solution:**
1. Setup SSH key (see Quick Start)
2. Or use Personal Access Token
3. Or use GitHub CLI: `gh auth login`

### "Push rejected"
**Solution:**
```bash
# Pull latest changes first
git pull origin main --rebase

# Then push
git push origin main
```

### "Render not auto-deploying"
**Solution:**
1. Check Render dashboard settings
2. Verify Auto-Deploy is enabled
3. Check branch name matches
4. Look for webhook errors in logs
5. Try manual deploy to test

### "Wrong branch"
**Solution:**
```bash
# Check current branch
git branch

# Switch to main
git checkout main

# Or create and switch
git checkout -b main
```

## 📈 Monitoring Deployments

### Check Deployment Status
```bash
# Via curl
curl https://codex-backend-7utu.onrender.com/api/health

# Via browser
# Open: https://dashboard.render.com
```

### View Deployment Logs
1. Go to Render dashboard
2. Select your service
3. Click "Logs" tab
4. Filter by deployment

### Rollback if Needed
```bash
# Revert last commit
git revert HEAD
git push origin main

# Or rollback to specific commit
git reset --hard COMMIT_HASH
git push origin main --force
```

## 🎯 Advanced Usage

### Deploy Specific Files Only
```batch
@echo off
git add js/dashboard-unified.js
git add profile.html
git commit -m "Update: Dashboard and profile fixes"
git push origin main
```

### Scheduled Deployments
Use Windows Task Scheduler:
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., daily at 2 AM)
4. Action: Start program
5. Program: `C:\path\to\quick-deploy.bat`

### Pre-Deploy Testing
```batch
@echo off
echo Running tests...
npm test
if %errorlevel% neq 0 (
    echo Tests failed! Aborting deployment.
    exit /b 1
)

echo Tests passed! Deploying...
call auto-deploy.bat
```

### Multi-Environment Deploy
```batch
@echo off
REM Deploy to staging
git push origin staging

REM Wait for confirmation
pause

REM Deploy to production
git push origin main
```

## 📝 Files Modified by Scripts

### .gitignore
Automatically created with:
```
node_modules/
.env
.env.local
.env.production
uploads/
*.log
.DS_Store
Thumbs.db
```

### Git Configuration
Scripts may modify:
- `.git/config` - Remote URLs
- `.git/refs/` - Branch references
- `.git/objects/` - Commit objects

## 🔒 Security Best Practices

### Never Commit
- `.env` files with secrets
- `node_modules/` directory
- API keys or tokens
- Database credentials
- Private keys

### Use Environment Variables
```bash
# In .env (never commit this)
JWT_SECRET=your_secret_here
MONGODB_URI=your_connection_string

# In code
const secret = process.env.JWT_SECRET;
```

### Protect Sensitive Files
Add to `.gitignore`:
```
.env
.env.local
.env.production
config/secrets.js
private/
```

## 📚 Additional Resources

### Documentation
- `AUTO_DEPLOY_GUIDE.md` - Complete guide
- `LIVE_ISSUES_FIXED.md` - Recent fixes
- `DEPLOY_FIXES_NOW.md` - Deployment checklist

### Tools
- Git: https://git-scm.com/
- GitHub: https://github.com/
- Render: https://render.com/
- GitHub CLI: https://cli.github.com/

### Support
- Git Documentation: https://git-scm.com/doc
- GitHub Guides: https://guides.github.com/
- Render Docs: https://render.com/docs

## 🎉 Success Checklist

After setup, verify:
- [ ] Git is installed and working
- [ ] Repository is initialized
- [ ] Remote is configured
- [ ] Authentication works
- [ ] Can push to GitHub
- [ ] Render auto-deploy is enabled
- [ ] Test deployment works
- [ ] Backend is accessible

## 🚨 Emergency Procedures

### If Deployment Breaks Production

1. **Immediate Rollback**
```bash
git revert HEAD
git push origin main
```

2. **Check Render Logs**
- Go to dashboard.render.com
- View deployment logs
- Identify error

3. **Manual Deploy Previous Version**
- In Render dashboard
- Click "Manual Deploy"
- Select previous commit

4. **Fix and Redeploy**
```bash
# Fix the issue
# Test locally
# Deploy again
auto-deploy.bat
```

### If GitHub Push Fails

1. **Check Authentication**
```bash
ssh -T git@github.com
```

2. **Pull Latest Changes**
```bash
git pull origin main --rebase
```

3. **Force Push (Last Resort)**
```bash
git push origin main --force
```

## 📞 Getting Help

If you're stuck:
1. Read `AUTO_DEPLOY_GUIDE.md`
2. Run `setup-auto-deploy.bat` to verify setup
3. Check GitHub repository settings
4. Check Render dashboard for errors
5. Review deployment logs

## 🎊 You're All Set!

Your auto-deploy system is ready to use!

**Quick Commands:**
- `auto-deploy.bat` - Regular deploy
- `quick-deploy.bat` - Fast deploy
- `watch-and-deploy.bat` - Auto deploy
- `DEPLOY_NOW.bat` - One-click deploy

**Dashboard:**
- Open `deploy-dashboard.html` in browser

**Documentation:**
- Read `AUTO_DEPLOY_GUIDE.md` for details

---

**Happy Deploying! 🚀**
