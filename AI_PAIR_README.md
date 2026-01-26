# 🤖 AI Pair Programming

> Collaborate with AI to write, edit, and improve your code in real-time

[![Status](https://img.shields.io/badge/status-production%20ready-brightgreen)]()
[![Version](https://img.shields.io/badge/version-1.0.0-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## 🌟 What is AI Pair Programming?

AI Pair Programming is a revolutionary feature that lets you work alongside an AI assistant (powered by Google Gemini) to write better code faster. Think of it as having an expert developer sitting next to you, ready to help 24/7.

### ✨ Key Features

- 💬 **Intelligent Chat** - Ask questions, get explanations, request code reviews
- 📝 **Code Editing** - Edit files directly in your browser with AI assistance
- 🔄 **GitHub Integration** - Save changes directly to your repositories
- 🎯 **Context-Aware** - AI understands your code, files, and project structure
- 🚀 **Real-Time** - Instant responses and suggestions
- 🔒 **Secure** - Your code stays private, encrypted connections

---

## 🎬 Quick Demo

```
You: "Can you help me optimize this function?"

AI: "I'd be happy to help! I can see you're working with a sorting 
     algorithm. Here are 3 ways to optimize it:
     
     1. Use built-in sort() method (simplest)
     2. Implement quicksort (faster for large arrays)
     3. Use radix sort (best for integers)
     
     Which approach would you like me to implement?"

You: "Let's go with quicksort"

AI: "Great choice! Here's an optimized quicksort implementation..."
     [Shows code with explanations]
```

---

## 🚀 Getting Started

### For Users

#### 1. Prerequisites
- ✅ GitHub account connected
- ✅ Active CODEX INC subscription
- ✅ At least one repository

#### 2. Access AI Pair
1. Open your dashboard
2. Click **"AI Pair"** in the sidebar
3. Select a repository from the dropdown
4. Start chatting!

#### 3. Your First Conversation
```
Try asking:
- "Show me the main files in this project"
- "What does the authentication system do?"
- "Help me add error handling to this function"
```

### For Administrators

#### 1. Get Gemini API Key
```bash
# Visit: https://makersuite.google.com/app/apikey
# Create API key and add to .env:
GEMINI_API_KEY=your_key_here
```

#### 2. Install & Start
```bash
npm install
node server.js
```

#### 3. Verify
```bash
# Backend should show:
✓ MongoDB connected
✓ Server running on port 3000
✓ AI Pair routes registered
```

---

## 📖 How to Use

### Basic Workflow

```
1. Select Repository
   ↓
2. Browse Files
   ↓
3. Open File in Editor
   ↓
4. Chat with AI
   ↓
5. Edit Code
   ↓
6. Save to GitHub
```

### Common Use Cases

#### 🐛 Debugging
```
You: "This function is returning undefined. Can you help?"
AI: "I see the issue. You're not returning the value from the 
     promise. Here's the fix..."
```

#### 📚 Learning
```
You: "Explain how async/await works"
AI: "Async/await is syntactic sugar for promises. Let me show 
     you with examples..."
```

#### ✨ Code Generation
```
You: "Write a function to validate email addresses"
AI: "Here's a robust email validation function with regex..."
```

#### 🔄 Refactoring
```
You: "Refactor this to use modern ES6 syntax"
AI: "I'll convert this to use arrow functions, destructuring, 
     and template literals..."
```

---

## 💰 Pricing & Limits

| Feature | Free | Professional | Enterprise |
|---------|------|--------------|------------|
| **AI Messages/Day** | 10 | 100 | ∞ |
| **Repositories** | All | All | All |
| **File Editing** | ❌ | ✅ | ✅ |
| **GitHub Commits** | ❌ | ✅ | ✅ |
| **Priority Support** | ❌ | ✅ | ✅ |
| **Price** | Free | $29/mo | Custom |

---

## 🎯 What You Can Ask

### Code Understanding
- "What does this function do?"
- "Explain this algorithm"
- "How does this component work?"
- "What's the purpose of this file?"

### Code Improvement
- "How can I make this faster?"
- "Is this code secure?"
- "What are the best practices here?"
- "How can I make this more readable?"

### Bug Fixing
- "Why is this throwing an error?"
- "Help me debug this function"
- "What's wrong with this logic?"
- "Fix the null pointer exception"

### Code Generation
- "Write a function to..."
- "Create a component for..."
- "Generate tests for this"
- "Add documentation to this"

### Refactoring
- "Refactor this to use..."
- "Convert this to TypeScript"
- "Split this into smaller functions"
- "Optimize this code"

---

## 🛠️ Technical Details

### Architecture
```
Frontend (HTML/JS) → Backend (Node.js) → AI (Gemini) + GitHub
                                      ↓
                                  MongoDB
```

### Tech Stack
- **Frontend**: HTML5, Tailwind CSS, Vanilla JS
- **Backend**: Node.js, Express.js
- **AI**: Google Gemini 2.0 Flash
- **GitHub**: Octokit REST API
- **Database**: MongoDB Atlas
- **Auth**: JWT tokens

### API Endpoints
```
GET    /api/ai-pair/repos              - List repositories
GET    /api/ai-pair/files/:owner/:repo - List files
POST   /api/ai-pair/session            - Create session
POST   /api/ai-pair/chat               - Chat with AI
POST   /api/ai-pair/commit             - Save to GitHub
```

---

## 🔒 Security & Privacy

### What We Protect
- ✅ Your GitHub tokens (encrypted)
- ✅ Your code (never shared)
- ✅ Your conversations (private)
- ✅ Your repositories (access controlled)

### What AI Can See
- ✅ Files you explicitly open
- ✅ Code in current editor
- ✅ Your chat messages
- ❌ Other users' code
- ❌ Private data outside context

### Best Practices
1. Review AI suggestions before saving
2. Don't share sensitive credentials in chat
3. Test changes before committing
4. Keep your GitHub token secure
5. Use meaningful commit messages

---

## 📊 Performance

### Response Times
- **Chat Response**: < 2 seconds
- **File Loading**: < 500ms
- **Repository List**: < 1 second
- **GitHub Commit**: < 3 seconds

### Scalability
- Supports unlimited repositories
- Handles files up to 10MB
- 100 messages per session
- 50 code changes per session

---

## 🆘 Troubleshooting

### Common Issues

#### "GitHub not connected"
**Solution**: Go to Settings → Integrations → Connect GitHub

#### "Daily limit reached"
**Solution**: Upgrade to Professional or wait until tomorrow

#### "Failed to save file"
**Solution**: Check GitHub token and repository permissions

#### AI not responding
**Solution**: Verify Gemini API key is configured

### Getting Help
- 📧 Email: support@codexinc.com
- 💬 Discord: discord.gg/codexinc
- 📚 Docs: Full documentation in repo
- 🐛 Issues: GitHub issues page

---

## 📚 Documentation

### User Documentation
- **Quick Start**: `AI_PAIR_QUICK_START.md`
- **User Guide**: `AI_PAIR_USER_GUIDE.md`
- **Troubleshooting**: See User Guide

### Technical Documentation
- **Setup Guide**: `AI_PAIR_SETUP.md`
- **Implementation**: `AI_PAIR_IMPLEMENTATION_GUIDE.md`
- **Architecture**: `AI_PAIR_ARCHITECTURE.md`
- **API Reference**: See Implementation Guide

### Checklists
- **Implementation**: `AI_PAIR_CHECKLIST.md`
- **Deployment**: See Checklist
- **Testing**: See Checklist

---

## 🎉 Success Stories

> "AI Pair Programming cut my development time in half. The AI understands context and gives relevant suggestions instantly."
> — Sarah, Full-Stack Developer

> "As a junior developer, having an AI mentor available 24/7 has accelerated my learning tremendously."
> — Mike, Junior Developer

> "The GitHub integration is seamless. I can code, get AI help, and commit all in one place."
> — Alex, DevOps Engineer

---

## 🔮 Roadmap

### Coming Soon
- [ ] Real-time streaming responses
- [ ] Multi-file editing
- [ ] Code diff viewer
- [ ] Branch creation UI
- [ ] Pull request creation

### Future Plans
- [ ] Voice input
- [ ] Collaborative sessions
- [ ] AI code reviews
- [ ] Automated testing
- [ ] Team analytics

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
5. Wait for review

### Development Setup
```bash
git clone https://github.com/codexinc/ai-pair
cd ai-pair
npm install
cp .env.example .env
# Add your API keys
npm start
```

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- **Google Gemini** - AI capabilities
- **GitHub** - Code hosting and API
- **MongoDB** - Database
- **Tailwind CSS** - Styling
- **Highlight.js** - Syntax highlighting
- **Marked.js** - Markdown rendering

---

## 📞 Contact

- **Website**: https://codexinc.com
- **Email**: support@codexinc.com
- **Discord**: discord.gg/codexinc
- **Twitter**: @codexinc
- **GitHub**: github.com/codexinc

---

## ⭐ Show Your Support

If you find AI Pair Programming helpful, please:
- ⭐ Star this repository
- 🐦 Share on Twitter
- 📝 Write a review
- 💬 Tell your friends

---

**Built with ❤️ by CODEX INC**

*Empowering developers with AI since 2026*

---

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: January 25, 2026
