# 🚀 AI Pair Programming - Quick Start

## ⚡ 3-Minute Setup

### Step 1: Get API Key (2 minutes)
```
1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy the key
```

### Step 2: Configure (30 seconds)
Open `.env` and add:
```env
GEMINI_API_KEY=paste_your_key_here
```

### Step 3: Start (30 seconds)
```bash
START_AI_PAIR.bat
```

Or manually:
```bash
npm install
node server.js
```

## ✅ Verify It Works

1. Open: http://localhost:5500/dashboard-new.html
2. Click "AI Pair" in sidebar
3. Select a repository
4. Type: "Hello! Can you help me with my code?"
5. AI should respond!

## 🎯 What You Can Do

### Ask Questions
```
"What does this function do?"
"How can I improve this code?"
"Explain this algorithm"
```

### Get Help
```
"Fix the bug on line 45"
"Add error handling here"
"Optimize this function"
```

### Generate Code
```
"Write a function to validate emails"
"Create a React login component"
"Generate unit tests"
```

## 💡 Pro Tips

1. **Be specific** - "Fix the null error on line 45" vs "Fix this"
2. **Provide context** - AI sees your current file
3. **Review changes** - Always check AI suggestions
4. **Save often** - Commits go directly to GitHub

## 📊 Usage Limits

- **Free**: 10 messages/day
- **Professional**: 100 messages/day ($29/month)
- **Enterprise**: Unlimited (custom pricing)

## 🆘 Troubleshooting

### "GitHub not connected"
→ Go to Settings → Integrations → Connect GitHub

### "No repositories found"
→ Make sure you have repos in your GitHub account

### "Daily limit reached"
→ Upgrade to Professional or wait until tomorrow

### AI not responding
→ Check GEMINI_API_KEY in .env and restart server

## 📚 Full Documentation

- User Guide: `AI_PAIR_USER_GUIDE.md`
- Setup Guide: `AI_PAIR_SETUP.md`
- Complete Summary: `AI_PAIR_FINAL_SUMMARY.md`

## 🎉 You're Ready!

The AI Pair Programming feature is fully set up and ready to use. Just add your API key and start coding with AI!

---

**Need help?** Check the troubleshooting section or contact support@codexinc.com
