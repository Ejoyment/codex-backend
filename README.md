# CODEX INC Backend

Enterprise Development Platform - Backend API

## Features

- User authentication with JWT
- Email verification with OTP (Resend API)
- Subscription management (Stripe)
- OAuth integrations (GitHub, Discord, Slack, Notion, Figma)
- AI pair programming (Groq)
- Team collaboration
- Real-time updates

## Tech Stack

- Node.js + Express
- MongoDB (Mongoose)
- Resend (Email service)
- Stripe (Payments)
- Passport.js (OAuth)
- Groq (AI)

## Environment Variables

Required in production:

```env
# MongoDB
MONGODB_URI=your_mongodb_connection_string

# JWT
JWT_SECRET=your_jwt_secret

# Resend Email
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=CODEX INC <onboarding@resend.dev>

# Frontend
FRONTEND_URL=https://your-frontend-url.com

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# AI (Groq)
GROQ_API_KEY=your_groq_api_key
AI_PROVIDER=groq

# OAuth (optional)
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
```

## Installation

```bash
npm install
```

## Development

```bash
npm start
```

## Production

Deploy to Render, Heroku, or any Node.js hosting platform.

Make sure to set all environment variables in your hosting platform.

## API Endpoints

- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `POST /api/otp/send` - Send OTP email
- `POST /api/otp/verify` - Verify OTP
- `GET /api/auth/me` - Get current user
- `POST /api/auth/upload-photo` - Upload profile picture
- `PUT /api/auth/update-profile` - Update user profile
- `POST /api/auth/change-password` - Change password
- `GET /api/subscription/current` - Get subscription status
- `POST /api/subscription/create-checkout` - Create Stripe checkout
- `GET /api/integrations` - Get user integrations
- `GET /api/integrations/:platform/auth` - OAuth authorization
- `DELETE /api/integrations/:platform/disconnect` - Disconnect integration
- `GET /api/ai-pair/repos` - Get GitHub repositories
- `POST /api/ai-pair/session` - Create AI pair session
- `POST /api/ai-pair/chat` - Chat with AI
- `GET /api/health` - Health check

## License

Proprietary - CODEX INC
