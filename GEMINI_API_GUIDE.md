# 🤖 Gemini API - Complete Guide

## Your Current Situation

**API Key**: `AIzaSyDyHRFBooKMOAhqKORfMHTDn2nJ4tTmx8o`
**Status**: ⚠️ Rate Limited (Free Tier)
**Issue**: You've exceeded the free tier quota

---

## 🚨 Rate Limit Issue

Your API key has hit the **free tier rate limits**. This is normal when testing or using the API frequently.

### Free Tier Limits
- **15 requests per minute**
- **1,500 requests per day**
- **1 million tokens per day**

### What Happened
You likely made too many test requests in a short time, hitting the per-minute or daily limit.

---

## ✅ Solutions

### Option 1: Wait (Free)
**Time**: 1-24 hours
**Cost**: Free

Rate limits reset automatically:
- **Per-minute limits**: Reset after 60 seconds
- **Daily limits**: Reset at midnight UTC

**What to do:**
1. Wait 1 hour
2. Run: `node check-gemini-access.js`
3. If still limited, wait until tomorrow

### Option 2: Use Different Model (Free)
**Time**: Immediate
**Cost**: Free

Different models have separate rate limits.

**What to do:**
1. Your `.env` is already set to: `gemini-1.5-flash`
2. Wait 1 hour for limits to reset
3. This model has better availability

### Option 3: Get New API Key (Free)
**Time**: 2 minutes
**Cost**: Free

Create a fresh API key with full quota.

**What to do:**
1. Visit: https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the new key
4. Update `.env`: `GEMINI_API_KEY=your_new_key`
5. Restart backend

### Option 4: Upgrade to Paid (Recommended)
**Time**: 5 minutes
**Cost**: Pay-as-you-go (~$0.10 per 1M tokens)

Get much higher limits and better models.

**What to do:**
1. Visit: https://ai.google.dev/pricing
2. Enable billing in Google Cloud Console
3. Your existing API key will automatically upgrade
4. Get access to:
   - 1,000 requests per minute (vs 15)
   - 10,000 requests per day (vs 1,500)
   - All models including Pro

---

## 📊 Available Models

### Recommended Models (in order)

#### 1. gemini-1.5-flash ⭐ (Currently in your .env)
- **Best for**: Production, AI Pair Programming
- **Speed**: Very fast
- **Cost**: Low
- **Availability**: Free & Paid tiers
- **Use case**: Perfect for coding assistance

#### 2. gemini-1.5-flash-latest
- **Best for**: Latest features
- **Speed**: Very fast
- **Cost**: Low
- **Availability**: Free & Paid tiers
- **Use case**: Same as above, auto-updates

#### 3. gemini-1.5-pro
- **Best for**: Complex reasoning
- **Speed**: Moderate
- **Cost**: Higher
- **Availability**: Paid tier only
- **Use case**: Advanced code analysis

#### 4. gemini-2.0-flash-exp
- **Best for**: Experimental features
- **Speed**: Fastest
- **Cost**: Free (experimental)
- **Availability**: Limited, often rate limited
- **Use case**: Testing new features

### Model Comparison

| Model | Speed | Quality | Cost | Free Tier |
|-------|-------|---------|------|-----------|
| gemini-1.5-flash | ⚡⚡⚡ | ⭐⭐⭐ | $ | ✅ |
| gemini-1.5-flash-latest | ⚡⚡⚡ | ⭐⭐⭐ | $ | ✅ |
| gemini-1.5-pro | ⚡⚡ | ⭐⭐⭐⭐⭐ | $$$ | ❌ |
| gemini-2.0-flash-exp | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | Free | ⚠️ |

---

## 🔧 How to Check Your Models

### Method 1: Run Test Script
```bash
node check-gemini-access.js
```

This will:
- Test all available models
- Show which ones work
- Provide recommendations
- Show rate limit status

### Method 2: Manual Test
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI('YOUR_API_KEY');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const result = await model.generateContent('Hello');
console.log(result.response.text());
```

---

## 🎯 Recommended Configuration

### For AI Pair Programming

**Best Configuration** (in your `.env`):
```env
GEMINI_API_KEY=AIzaSyDyHRFBooKMOAhqKORfMHTDn2nJ4tTmx8o
AI_MODEL=gemini-1.5-flash
AI_MAX_TOKENS=8192
AI_TEMPERATURE=0.7
```

**Why this configuration?**
- `gemini-1.5-flash`: Fast, reliable, good for coding
- `8192 tokens`: Enough for most code files
- `0.7 temperature`: Balanced creativity/accuracy

### Alternative Configuration (if rate limited)

Wait 1 hour, then use the same config. The model is correct.

---

## 💡 Tips to Avoid Rate Limits

### 1. Implement Caching
Cache AI responses for repeated questions.

### 2. Batch Requests
Combine multiple questions into one request.

### 3. Use Appropriate Model
- Simple tasks → gemini-1.5-flash
- Complex tasks → gemini-1.5-pro

### 4. Monitor Usage
Track your API calls to stay within limits.

### 5. Implement Retry Logic
Wait and retry when rate limited.

---

## 🔍 Checking Your Quota

### Via Google Cloud Console
1. Visit: https://console.cloud.google.com
2. Select your project
3. Go to "APIs & Services" → "Dashboard"
4. Click "Generative Language API"
5. View quotas and usage

### Via Code
```javascript
// The error message shows your limits:
// "Quota exceeded for metric: generativelanguage.googleapis.com/..."
// "Please retry in 40.475306522s"
```

---

## 📈 Pricing (if you upgrade)

### Free Tier
- 15 RPM (requests per minute)
- 1,500 RPD (requests per day)
- 1M tokens per day
- **Cost**: $0

### Pay-as-you-go
- 1,000 RPM
- 10,000 RPD
- Unlimited tokens
- **Cost**: ~$0.10 per 1M input tokens

### Example Costs
- 1,000 AI chat messages: ~$0.50
- 10,000 code reviews: ~$5.00
- 100,000 code generations: ~$50.00

**For AI Pair Programming**: Expect $5-20/month for moderate use.

---

## 🚀 Next Steps

### Immediate (Right Now)
1. ✅ Your `.env` is already configured correctly
2. ✅ Model set to `gemini-1.5-flash`
3. ⏳ Wait 1 hour for rate limits to reset
4. ✅ Then test: `node check-gemini-access.js`

### Short Term (Today)
1. Test AI Pair Programming feature
2. Monitor your usage
3. Consider getting a new API key if needed

### Long Term (This Week)
1. Decide if you need paid tier
2. Implement rate limit handling in code
3. Set up usage monitoring
4. Configure retry logic

---

## 🆘 Troubleshooting

### "429 Too Many Requests"
**Cause**: Rate limit exceeded
**Solution**: Wait 1 hour or upgrade to paid tier

### "404 Model Not Found"
**Cause**: Model name incorrect or not available
**Solution**: Use `gemini-1.5-flash` (already in your .env)

### "403 Permission Denied"
**Cause**: Model requires paid tier
**Solution**: Upgrade or use free tier model

### "Invalid API Key"
**Cause**: Key is wrong or revoked
**Solution**: Generate new key at https://makersuite.google.com/app/apikey

---

## 📞 Support

### Google AI Support
- Docs: https://ai.google.dev/docs
- Pricing: https://ai.google.dev/pricing
- Rate Limits: https://ai.google.dev/gemini-api/docs/rate-limits
- API Keys: https://makersuite.google.com/app/apikey

### CODEX INC Support
- Check: `AI_PAIR_USER_GUIDE.md`
- Test: `node check-gemini-access.js`
- Docs: All AI_PAIR_*.md files

---

## ✅ Summary

**Your Status:**
- ✅ API Key: Valid
- ⚠️ Rate Limit: Currently exceeded
- ✅ Model: Correctly configured (`gemini-1.5-flash`)
- ⏳ Action: Wait 1 hour, then test

**What Works:**
- Your API key is valid
- Configuration is correct
- Just need to wait for rate limits to reset

**What to Do:**
1. Wait 1 hour
2. Run: `node check-gemini-access.js`
3. If working, start backend: `START_AI_PAIR.bat`
4. Test AI Pair Programming feature

**Expected Timeline:**
- In 1 hour: Should work
- If not: Wait until tomorrow (daily limit)
- Alternative: Get new API key (2 minutes)

---

**Last Updated**: January 25, 2026
**Your API Key**: Configured and valid, just rate limited
**Status**: Ready to use after rate limit resets
