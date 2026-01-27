# Auto-Deploy to GitHub - Complete Guide

## Quick Start

### 1. Setup (One-time)
```bash
setup-auto-deploy.bat
```
This will:
- Initialize git repository
- Configure remote repository
- Setup authentication
- Create .gitignore

### 2. Deploy Changes
```bash
auto-deploy.bat
```
This will:
- Add all changes
- Commit with your message
- Push to GitHub
- Trigger Render auto-deploy

## Available Scripts

### 🚀 auto-deploy.bat
**Full-featured deployment with prompts**

```bash
auto-deploy.bat
```

Features:
- Checks for changes
- Prompts for commit message
- Shows deployment status
- Error handling
- Deployment verification

Use when: You want control over commit messages

---

### ⚡ quick-deploy.bat
**Fast deployment without prompts**

```bash
quick-deploy.bat
```

Features:
- No prompts
- Auto-generated commit message with timestamp
- Instant deployment
- Minimal output

Use when: You want to deploy quickly without typing

---

### 👁️ watch-and-deploy.bat
**Automatic deployment on file changes**

```bash
watch-and-deploy.bat
```

Features:
- Watches for file changes every 30 seconds
- Auto-commits and pushes when changes detected
- Runs continuously until stopped (Ctrl+C)
- Timestamps all commits

Use when: You're actively developing and want automatic deployments

---

### 🏷️ deploy-with-tag.bat
**Deployment with version tagging**

```bash
deploy-with-tag.bat
```

Features:
- Creates git tags (v1.0.0, v1.1.0, etc.)
- Useful for releases
- Tracks versions in GitHub
- Pushes tags to remote

Use when: You're releasing a new version

---

### ⚙️ setup-auto-deploy.bat
**Initial setup and configuration**

```bash
setup-auto-deploy.bat
```

Features:
- Initializes git repository
- Configures remote
- Tests GitHub connection
- Creates .gitignore
- Verifies authentication

Use when: First time setup or troubleshooting

## Workflow Examples

### Example 1: Regular Development
```bash
# Make changes to your files
# ...

# Deploy when ready
auto-deploy.bat
# Enter commit message: "Fix dashboard loading issue"
```

### Example 2: Quick Fixes
```bash
# Fix a bug
# ...

# Deploy immediately
quick-deploy.bat
```

### Example 3: Active Development
```bash
# Start watching for changes
watch-and-deploy.bat

# Now just save your files
# Script will auto-deploy every 30 seconds if changes detected
```

### Example 4: Release Version
```bash
# Prepare release
# ...

# Deploy with version tag
deploy-with-tag.bat
# Enter version: v1.2.0
# Enter message: "Release v1.2.0 - Dashboard improvements"
```

## GitHub Authentication Setup

### Option 1: SSH Key (Recommended)

1. **Generate SSH Key**
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

2. **Add to SSH Agent**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

3. **Add to GitHub**
- Copy key: `cat ~/.ssh/id_ed25519.pub`
- Go to: https://github.com/settings/keys
- Click "New SSH key"
- Paste and save

4. **Test Connection**
```bash
ssh -T git@github.com
```

5. **Update Remote URL**
```bash
git remote set-url origin git@github.com:USERNAME/REPO.git
```

### Option 2: Personal Access Token

1. **Create Token**
- Go to: https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Select scopes: `repo`, `workflow`
- Generate and copy token

2. **Use Token**
```bash
git remote set-url origin https://TOKEN@github.com/USERNAME/REPO.git
```

Or let Git prompt you:
```bash
git remote set-url origin https://github.com/USERNAME/REPO.git
# Git will ask for username and password (use token as password)
```

### Option 3: GitHub CLI

1. **Install GitHub CLI**
- Download from: https://cli.github.com/

2. **Authenticate**
```bash
gh auth login
```

3. **Use HTTPS**
```bash
git remote set-url origin https://github.com/USERNAME/REPO.git
```

## Render Auto-Deploy Setup

### 1. Connect GitHub to Render

1. Go to: https://dashboard.render.com
2. Select your service
3. Go to "Settings" tab
4. Under "Build & Deploy":
   - Auto-Deploy: **Yes**
   - Branch: **main** (or master)

### 2. Verify Auto-Deploy

After pushing to GitHub:
1. Check Render dashboard
2. Look for "Deploying..." status
3. Wait 2-3 minutes
4. Check logs for errors

### 3. Manual Deploy (if needed)

If auto-deploy doesn't trigger:
1. Go to Render dashboard
2. Click "Manual Deploy"
3. Select "Deploy latest commit"

## Troubleshooting

### Issue: "Git is not installed"
**Solution:**
```bash
# Download and install Git
# https://git-scm.com/downloads

# Verify installation
git --version
```

### Issue: "Not a git repository"
**Solution:**
```bash
# Initialize git
git init

# Or navigate to correct directory
cd path/to/your/project
```

### Issue: "No remote 'origin' configured"
**Solution:**
```bash
# Add remote
git remote add origin https://github.com/USERNAME/REPO.git

# Verify
git remote -v
```

### Issue: "Authentication failed"
**Solution:**
```bash
# Option 1: Setup SSH key (see above)

# Option 2: Use personal access token
git remote set-url origin https://TOKEN@github.com/USERNAME/REPO.git

# Option 3: Use GitHub CLI
gh auth login
```

### Issue: "Push rejected"
**Solution:**
```bash
# Pull latest changes first
git pull origin main --rebase

# Then push
git push origin main
```

### Issue: "Render not auto-deploying"
**Solution:**
1. Check Render dashboard settings
2. Verify "Auto-Deploy" is enabled
3. Check branch name matches (main vs master)
4. Look for webhook errors in Render logs
5. Try manual deploy to test

### Issue: "Wrong branch"
**Solution:**
```bash
# Check current branch
git branch

# Switch to main
git checkout main

# Or rename branch
git branch -M main
```

## Best Practices

### 1. Commit Messages
Use clear, descriptive messages:
```
✅ Good:
- "Fix: Dashboard loading timeout issue"
- "Add: Profile upload functionality"
- "Update: Integration error handling"

❌ Bad:
- "fix"
- "update"
- "changes"
```

### 2. Deployment Frequency
- **Development**: Deploy often (use watch-and-deploy.bat)
- **Staging**: Deploy after testing
- **Production**: Deploy with version tags

### 3. Testing Before Deploy
```bash
# Test locally first
npm test

# Then deploy
auto-deploy.bat
```

### 4. Version Control
```bash
# Use tags for releases
deploy-with-tag.bat

# Follow semantic versioning
# v1.0.0 - Major release
# v1.1.0 - Minor update
# v1.1.1 - Patch/fix
```

### 5. .gitignore
Always exclude:
```
node_modules/
.env
.env.local
.env.production
uploads/
*.log
.DS_Store
```

## Advanced Usage

### Custom Deployment Script

Create your own script:
```batch
@echo off
REM my-deploy.bat

echo Deploying to production...

REM Run tests
npm test
if %errorlevel% neq 0 exit /b 1

REM Build
npm run build
if %errorlevel% neq 0 exit /b 1

REM Deploy
git add .
git commit -m "Production deploy: %date%"
git push origin main

echo Deployed!
```

### Scheduled Deployments

Use Windows Task Scheduler:
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., daily at 2 AM)
4. Action: Start program
5. Program: `C:\path\to\quick-deploy.bat`

### Deploy Specific Files

```batch
@echo off
REM deploy-specific.bat

git add js/dashboard-unified.js
git add profile.html
git add server.js
git commit -m "Update: Dashboard and profile fixes"
git push origin main
```

## Monitoring Deployments

### Check Deployment Status
```bash
# Via curl
curl https://codex-backend-7utu.onrender.com/api/health

# Via browser
# https://dashboard.render.com
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

# Or rollback to specific version
git reset --hard COMMIT_HASH
git push origin main --force
```

## Integration with CI/CD

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Render

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        run: echo "Render auto-deploys on push"
```

## Summary

### Quick Reference

| Command | Use Case | Speed | Control |
|---------|----------|-------|---------|
| `auto-deploy.bat` | Regular deployment | Medium | High |
| `quick-deploy.bat` | Fast deployment | Fast | Low |
| `watch-and-deploy.bat` | Auto deployment | Auto | None |
| `deploy-with-tag.bat` | Version release | Medium | High |
| `setup-auto-deploy.bat` | Initial setup | Slow | High |

### Deployment Flow

```
Make Changes → Save Files → Run Script → Push to GitHub → Render Deploys
```

### Support

If you need help:
1. Check this guide
2. Run `setup-auto-deploy.bat` to verify setup
3. Check GitHub repository settings
4. Check Render dashboard for errors
5. Review deployment logs

---

**Ready to deploy?** Run `setup-auto-deploy.bat` to get started!
