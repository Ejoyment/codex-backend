# 🆓 Free AI Providers Guide

## Overview

Your AI Pair Programming feature now supports **4 free AI providers**! The system automatically uses whichever one you configure and falls back to others if one fails.

---

## 🎯 Recommended: Groq (Best Free Option)

### Why Groq?
- ✅ **100% FREE** with generous limits
- ⚡ **Extremely fast** (fastest inference available)
- 🚀 **High limits**: 30 requests/minute, 14,400/day
- 💪 **Powerful models**: Mixtral, Llama, Gemma
- 🎁 **No credit card required**

### How to Get Groq API Key (2 minutes)

1. **Visit**: https://console.groq.com/
2. **Sign up** with Google/GitHub (free)
3. **Go to**: API Keys section
4. **Click**: "Create API Key"
5. **Copy** the key
6. **Add to `.env`**:
   ```env
   GROQ_API_KEY=your_key_here
   GROQ_MODEL=mixtral-8x7b-32768
   AI_PROVIDER=groq
   ```

### Groq Models (All Free)

| Model | Speed | Quality | Context | Best For |
|-------|-------|---------|---------|----------|
| mixtral-8x7b-32768 | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 32K | Coding ⭐ |
| llama3-70b-8192 | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | 8K | Complex tasks |
| llama3-8b-8192 | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | 8K | Fast responses |
| gemma-7b-it | ⚡⚡⚡⚡ | ⭐⭐⭐ | 8K | General use |

### Groq Limits (Free Tier)
- **Requests**: 30 per minute, 14,400 per day
- **Tokens**: 20,000 per minute
- **Cost**: $0 (completely free)

---

## 🌟 Option 2: Mistral AI

### Why Mistral?
- ✅ Free tier available
- 🇫🇷 European AI (privacy-focused)
- 💪 Good for coding
- 🎯 Specialized models

### How to Get Mistral API Key (3 minutes)

1. **Visit**: https://console.mistral.ai/
2. **Sign up** (free)
3. **Go to**: API Keys
4. **Create** new key
5. **Add to `.env`**:
   ```env
   MISTRAL_API_KEY=your_key_here
   MISTRAL_MODEL=mistral-tiny
   AI_PROVIDER=mistral
   ```

### Mistral Models

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| mistral-tiny | ⚡⚡⚡⚡ | ⭐⭐⭐ | Free | Fast tasks |
| mistral-small | ⚡⚡⚡ | ⭐⭐⭐⭐ | Paid | Balanced |
| mistral-medium | ⚡⚡ | ⭐⭐⭐⭐⭐ | Paid | Complex |

### Mistral Limits (Free Tier)
- **Requests**: Limited (not publicly disclosed)
- **Tokens**: Varies by model
- **Cost**: Free tier + paid options

---

## 🤗 Option 3: Hugging Face

### Why Hugging Face?
- ✅ Free inference API
- 🌍 Largest model hub
- 🔓 Open source models
- 🎓 Great for learning

### How to Get Hugging Face Token (2 minutes)

1. **Visit**: https://huggingface.co/
2. **Sign up** (free)
3. **Go to**: Settings → Access Tokens
4. **Create** new token (read access)
5. **Add to `.env`**:
   ```env
   HUGGINGFACE_API_KEY=your_token_here
   HUGGINGFACE_MODEL=mistralai/Mistral-7B-Instruct-v0.2
   AI_PROVIDER=huggingface
   ```

### Recommended Models

| Model | Speed | Quality | Best For |
|-------|-------|---------|----------|
| mistralai/Mistral-7B-Instruct-v0.2 | ⚡⚡⚡ | ⭐⭐⭐⭐ | Coding ⭐ |
| codellama/CodeLlama-13b-Instruct-hf | ⚡⚡ | ⭐⭐⭐⭐ | Code only |
| meta-llama/Llama-2-7b-chat-hf | ⚡⚡⚡ | ⭐⭐⭐ | General |

### Hugging Face Limits (Free Tier)
- **Requests**: Rate limited (varies)
- **Tokens**: Limited per request
- **Cost**: Free (with rate limits)

---

## 🔵 Option 4: Google Gemini

### Why Gemini?
- ✅ Free tier available
- 🚀 Latest Google AI
- 💪 Multimodal (text + images)
- 🎯 Good for coding

### Status
- **Your Key**: Already configured
- **Issue**: Currently rate limited
- **Solution**: Wait 1 hour or use other providers

### Gemini Limits (Free Tier)
- **Requests**: 15 per minute, 1,500 per day
- **Tokens**: 1 million per day
- **Cost**: Free

---

## 🎯 Quick Setup Guide

### Step 1: Choose Provider

**Recommended Order:**
1. **Groq** (best free option)
2. **Mistral** (good alternative)
3. **Hugging Face** (most models)
4. **Gemini** (when limits reset)

### Step 2: Get API Key

Pick one from above and get the API key (2-3 minutes each).

### Step 3: Update .env

```env
# Option 1: Use Groq (Recommended)
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=mixtral-8x7b-32768

# Option 2: Use Mistral
AI_PROVIDER=mistral
MISTRAL_API_KEY=your_mistral_key_here
MISTRAL_MODEL=mistral-tiny

# Option 3: Use Hugging Face
AI_PROVIDER=huggingface
HUGGINGFACE_API_KEY=your_hf_token_here
HUGGINGFACE_MODEL=mistralai/Mistral-7B-Instruct-v0.2

# Option 4: Auto (uses first available)
AI_PROVIDER=auto
# Add keys for multiple providers
```

### Step 4: Restart Backend

```bash
START_AI_PAIR.bat
```

---

## 🔄 Auto-Fallback Feature

The system automatically tries providers in order:

1. **Primary**: Provider set in `AI_PROVIDER`
2. **Fallback**: Next available provider
3. **Error Handling**: Graceful degradation

Example:
```
Groq fails → Try Mistral → Try Hugging Face → Try Gemini
```

---

## 📊 Provider Comparison

| Provider | Free Tier | Speed | Quality | Limits | Setup Time |
|----------|-----------|-------|---------|--------|------------|
| **Groq** | ✅ Yes | ⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 30 RPM | 2 min |
| **Mistral** | ✅ Yes | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | Limited | 3 min |
| **Hugging Face** | ✅ Yes | ⚡⚡⚡ | ⭐⭐⭐ | Varies | 2 min |
| **Gemini** | ✅ Yes | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 15 RPM | 2 min |

**Winner**: 🏆 **Groq** (fastest + highest limits + completely free)

---

## 💡 Pro Tips

### 1. Use Multiple Providers
Configure all providers for maximum reliability:
```env
AI_PROVIDER=auto
GROQ_API_KEY=...
MISTRAL_API_KEY=...
HUGGINGFACE_API_KEY=...
GEMINI_API_KEY=...
```

### 2. Choose Right Model
- **Fast responses**: Groq Llama3-8b
- **Best quality**: Groq Llama3-70b
- **Coding**: Groq Mixtral or Mistral-7B
- **Balanced**: Groq Mixtral (recommended)

### 3. Monitor Usage
Check provider dashboards to track usage and limits.

### 4. Optimize Prompts
Shorter prompts = faster responses + lower token usage.

---

## 🧪 Testing Your Setup

### Test All Providers

```bash
node test-ai-providers.js
```

This will:
- Test each configured provider
- Show which ones work
- Recommend best option
- Display response times

---

## 🆘 Troubleshooting

### "No AI provider configured"
**Solution**: Add at least one API key to `.env`

### "Rate limit exceeded"
**Solution**: Switch to different provider or wait

### "Invalid API key"
**Solution**: Check key is correct and active

### "Model not found"
**Solution**: Use recommended models from this guide

---

## 📈 Cost Comparison

### Free Tier Costs (per 1M tokens)

| Provider | Input | Output | Total |
|----------|-------|--------|-------|
| Groq | $0 | $0 | **$0** 🏆 |
| Mistral (tiny) | $0 | $0 | **$0** |
| Hugging Face | $0 | $0 | **$0** |
| Gemini | $0 | $0 | **$0** |

### If You Exceed Free Tier

| Provider | Input | Output | Total |
|----------|-------|--------|-------|
| Groq | $0.10 | $0.10 | $0.20 |
| Mistral | $0.25 | $0.25 | $0.50 |
| Gemini | $0.10 | $0.30 | $0.40 |

**Groq remains cheapest even on paid tier!**

---

## 🎯 Recommended Setup

### For Best Experience

```env
# Primary: Groq (fastest, free)
AI_PROVIDER=auto
GROQ_API_KEY=your_groq_key
GROQ_MODEL=mixtral-8x7b-32768

# Backup: Mistral
MISTRAL_API_KEY=your_mistral_key
MISTRAL_MODEL=mistral-tiny

# Backup: Gemini (when limits reset)
GEMINI_API_KEY=AIzaSyDyHRFBooKMOAhqKORfMHTDn2nJ4tTmx8o
AI_MODEL=gemini-1.5-flash
```

This gives you:
- ✅ Primary: Groq (30 RPM, super fast)
- ✅ Fallback 1: Mistral (good quality)
- ✅ Fallback 2: Gemini (when available)
- ✅ Total: ~45+ requests/minute combined!

---

## 🚀 Quick Start (5 Minutes)

### Get Groq API Key (Recommended)

1. Visit: https://console.groq.com/
2. Sign up (free, no credit card)
3. Create API key
4. Add to `.env`:
   ```env
   GROQ_API_KEY=your_key_here
   AI_PROVIDER=groq
   ```
5. Restart: `START_AI_PAIR.bat`
6. Done! 🎉

---

## 📞 Support

### Provider Support
- **Groq**: https://console.groq.com/docs
- **Mistral**: https://docs.mistral.ai/
- **Hugging Face**: https://huggingface.co/docs
- **Gemini**: https://ai.google.dev/docs

### CODEX INC Support
- Check: `AI_PAIR_USER_GUIDE.md`
- Test: `node test-ai-providers.js`
- Email: support@codexinc.com

---

## ✅ Summary

**Best Free Option**: 🏆 **Groq**
- Fastest inference
- Highest free limits (30 RPM)
- No credit card required
- Excellent for coding

**Setup Time**: 2 minutes
**Cost**: $0
**Quality**: Excellent

**Get started now**: https://console.groq.com/

---

**Last Updated**: January 25, 2026
**Recommended**: Groq + Mistral + Gemini (all free!)
**Total Free Requests**: 45+ per minute combined
