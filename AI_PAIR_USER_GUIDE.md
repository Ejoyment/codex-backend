# 🤖 AI Pair Programming - User Guide

## What is AI Pair Programming?

AI Pair Programming lets you collaborate with an AI assistant (powered by Google Gemini) to write, edit, and improve your code. The AI can see your GitHub repositories, understand your code, and help you make changes directly.

## Getting Started

### Prerequisites
1. ✅ GitHub account connected in Settings → Integrations
2. ✅ Active subscription (Free tier gets 10 AI messages/day)
3. ✅ Gemini API key configured (admin setup)

### Accessing AI Pair
1. Open your dashboard: http://localhost:5500/dashboard-new.html
2. Click "AI Pair" in the left sidebar
3. You'll see the AI Pair Programming interface

## Interface Overview

### Layout
The AI Pair interface has two main sections:

**Left Side: Code Editor**
- File browser at top
- Code editor below
- Save button when you make changes

**Right Side: Chat**
- Chat messages area
- AI typing indicator
- Message input box

### Top Bar
- Back button (return to dashboard)
- Repository selector dropdown
- Session name
- AI usage counter (messages used today)

## How to Use

### 1. Select a Repository

1. Click the "Select Repository..." dropdown at the top
2. Choose one of your GitHub repositories
3. The AI will create a new session
4. Files will load in the file browser

### 2. Browse Files

- Click on folders to expand them
- Click on files to open them in the editor
- The code will appear in the editor
- File name and language shown at top

### 3. Chat with AI

**Ask Questions:**
```
"What does this function do?"
"How can I improve this code?"
"Are there any bugs here?"
"Explain this algorithm"
```

**Request Changes:**
```
"Add error handling to this function"
"Refactor this to use async/await"
"Add comments to explain the logic"
"Optimize this for performance"
```

**Generate Code:**
```
"Write a function to validate email addresses"
"Create a React component for a login form"
"Generate unit tests for this function"
"Add TypeScript types to this file"
```

### 4. Edit Code

**Manual Editing:**
1. Open a file in the editor
2. Make your changes
3. Click "Save" button
4. Changes are committed to GitHub

**AI-Suggested Changes:**
1. Ask AI to suggest changes
2. AI will show code in chat
3. Copy code to editor
4. Review and save

### 5. Context-Aware Help

The AI knows:
- Current repository and branch
- Current file you're viewing
- File structure of your project
- Code in the editor

So you can ask:
- "Fix the bug in this file"
- "Add validation here"
- "What's wrong with this code?"

## Features

### 💬 Intelligent Chat
- Markdown formatting
- Code syntax highlighting
- Multi-turn conversations
- Context awareness

### 📝 Code Editing
- Syntax highlighting
- Line numbers
- Auto-save to GitHub
- Commit messages

### 🔍 Code Analysis
- Bug detection
- Performance suggestions
- Best practices
- Security recommendations

### 🎯 Code Generation
- Function generation
- Boilerplate code
- Test generation
- Documentation

## Tips & Tricks

### 1. Be Specific
❌ "Fix this"
✅ "Fix the null pointer error on line 45"

### 2. Provide Context
❌ "Add validation"
✅ "Add email validation to the signup form, checking for valid format and domain"

### 3. Ask for Explanations
```
"Explain this code like I'm a beginner"
"What design pattern is this using?"
"Why is this approach better?"
```

### 4. Request Multiple Options
```
"Show me 3 ways to implement this"
"What are the pros and cons of each approach?"
```

### 5. Use Keyboard Shortcuts
- `Ctrl + Enter` - Send message
- `Ctrl + S` - Save file

## Usage Limits

### Free Tier (10 messages/day)
- View code
- Ask questions
- Get suggestions
- Limited editing

### Professional ($29/month - 100 messages/day)
- Full code editing
- Unlimited file access
- Direct GitHub commits
- Priority support

### Enterprise (Custom - Unlimited)
- Unlimited AI messages
- Advanced features
- Team collaboration
- Dedicated support

## Common Use Cases

### 1. Code Review
```
"Review this function for bugs and improvements"
"Is this code following best practices?"
"What security issues do you see?"
```

### 2. Debugging
```
"Why is this function returning undefined?"
"Help me fix this error: [paste error]"
"Debug this API call that's failing"
```

### 3. Learning
```
"Explain how this algorithm works"
"What is dependency injection?"
"Show me examples of the factory pattern"
```

### 4. Refactoring
```
"Refactor this to be more readable"
"Convert this to use modern ES6 syntax"
"Split this large function into smaller ones"
```

### 5. Testing
```
"Generate unit tests for this function"
"Write integration tests for this API"
"Create test cases for edge cases"
```

## Troubleshooting

### "GitHub not connected"
**Solution:**
1. Go to Settings → Integrations
2. Click "Connect" next to GitHub
3. Authorize the app
4. Return to AI Pair

### "No repositories found"
**Solution:**
- Make sure you have repositories in your GitHub account
- Check that GitHub integration is active
- Try refreshing the page

### "Daily limit reached"
**Solution:**
- Wait until tomorrow (resets at midnight)
- Upgrade to Professional for 100 messages/day
- Or Enterprise for unlimited

### "Failed to save file"
**Solution:**
- Check your internet connection
- Verify GitHub token hasn't expired
- Make sure you have write access to the repo

### AI not responding
**Solution:**
- Check your internet connection
- Verify Gemini API key is configured
- Try refreshing the page
- Contact support if issue persists

## Best Practices

### 1. Start Small
- Begin with simple questions
- Test the AI's understanding
- Build up to complex tasks

### 2. Review AI Suggestions
- Always review code before saving
- Test changes locally if possible
- Don't blindly trust AI output

### 3. Provide Feedback
- If AI misunderstands, clarify
- Give more context if needed
- Be patient with complex requests

### 4. Use Sessions Wisely
- One session per feature/task
- Keep conversations focused
- Start new session for new topics

### 5. Save Your Work
- Commit changes regularly
- Use meaningful commit messages
- Keep backups of important code

## Privacy & Security

### What AI Can See
- ✅ Files you explicitly open
- ✅ Code in current editor
- ✅ Repository structure
- ✅ Your chat messages

### What AI Cannot See
- ❌ Other users' code
- ❌ Private repositories (unless you select them)
- ❌ Your GitHub credentials
- ❌ Other sessions

### Data Handling
- Chat history stored in your account
- Code changes tracked for audit
- GitHub tokens encrypted
- No data shared with third parties

## Support

### Need Help?
- Check this guide first
- Review troubleshooting section
- Contact support: support@codexinc.com
- Join our Discord community

### Feature Requests
Have ideas for improvements? Let us know!
- Email: feedback@codexinc.com
- GitHub Issues: github.com/codexinc/feedback

---

**Happy Coding with AI! 🚀**

*Last Updated: January 2026*
