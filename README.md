# CODEX INC - Authentication System

A complete authentication system with email OTP verification and social login (Google & Facebook).

## Features

✅ **User Registration** - Sign up with email and password
✅ **Email OTP Verification** - 4-digit OTP sent to email
✅ **User Sign In** - Secure authentication with JWT
✅ **Google OAuth** - Sign in with Google account
✅ **Facebook OAuth** - Sign in with Facebook account
✅ **Password Security** - Bcrypt hashing
✅ **Rate Limiting** - Protection against brute force attacks
✅ **Session Management** - JWT tokens with 7-day expiry
✅ **Responsive UI** - Works on all devices

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **Passport.js** - Authentication middleware
- **Nodemailer** - Email service
- **JWT** - Token-based authentication
- **Bcrypt** - Password hashing

### Frontend
- **HTML5** - Structure
- **CSS3** - Styling
- **Tailwind CSS** - Utility-first CSS
- **Vanilla JavaScript** - Interactivity

## Project Structure

```
codex-inc/
├── backend/
│   ├── config/
│   │   └── passport.js          # Passport OAuth configuration
│   ├── models/
│   │   ├── User.js              # User model
│   │   └── OTP.js               # OTP model
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   └── otp.js               # OTP routes
│   ├── utils/
│   │   └── emailService.js      # Email sending service
│   ├── server.js                # Main server file
│   ├── package.json             # Dependencies
│   └── .env                     # Environment variables
├── frontend/
│   ├── js/
│   │   └── api.js               # API integration
│   ├── index.html               # Landing page
│   ├── signup.html              # Sign up page
│   ├── sign_in.html             # Sign in page
│   ├── verify-email.html        # OTP verification
│   ├── verify-success.html      # Success page
│   └── auth-success.html        # Social auth redirect
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Gmail account (for sending emails)
- Google Cloud Console account (for Google OAuth)
- Facebook Developer account (for Facebook OAuth)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/codex-inc

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this

# Email (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=CODEX INC <noreply@codexinc.com>

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback

# Frontend
FRONTEND_URL=http://localhost:5500

# OTP
OTP_EXPIRY_MINUTES=10
```

### 3. Setup Gmail for Sending Emails

1. Go to your Google Account settings
2. Enable 2-Step Verification
3. Generate an App Password:
   - Go to Security → 2-Step Verification → App passwords
   - Select "Mail" and "Other (Custom name)"
   - Copy the generated password
   - Use it as `EMAIL_PASSWORD` in .env

### 4. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback`
6. Copy Client ID and Client Secret to .env

### 5. Setup Facebook OAuth

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add Facebook Login product
4. Configure OAuth redirect URIs:
   - `http://localhost:3000/auth/facebook/callback`
5. Copy App ID and App Secret to .env

### 6. Start MongoDB

```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env with your Atlas connection string
```

### 7. Start the Backend Server

```bash
npm start

# Or for development with auto-reload
npm run dev
```

Server will run on `http://localhost:3000`

### 8. Start the Frontend

Use any static file server. For example:

```bash
# Using Live Server (VS Code extension)
# Or using Python
python -m http.server 5500

# Or using Node.js http-server
npx http-server -p 5500
```

Frontend will run on `http://localhost:5500`

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create new account
- `POST /api/auth/signin` - Sign in with email/password
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/facebook` - Initiate Facebook OAuth
- `GET /api/auth/me` - Get current user (requires token)

### OTP

- `POST /api/otp/send` - Send OTP to email
- `POST /api/otp/verify` - Verify OTP code
- `POST /api/otp/resend` - Resend OTP

### Health Check

- `GET /api/health` - Check server status

## Usage Flow

### Sign Up Flow

1. User fills registration form (signup.html)
2. Backend creates user account
3. OTP is generated and sent to email
4. User enters OTP (verify-email.html)
5. Backend verifies OTP
6. User account is activated
7. Welcome email is sent
8. Redirect to sign in page

### Sign In Flow

1. User enters email and password (sign_in.html)
2. Backend validates credentials
3. JWT token is generated
4. Token stored in localStorage
5. User redirected to home page

### Social Login Flow

1. User clicks Google/Facebook button
2. Redirected to OAuth provider
3. User authorizes the app
4. Redirected back with auth code
5. Backend exchanges code for user info
6. User account created/linked
7. JWT token generated
8. Redirect to home page

## Security Features

- **Password Hashing** - Bcrypt with salt rounds
- **JWT Tokens** - Secure token-based authentication
- **Rate Limiting** - Prevents brute force attacks
- **OTP Expiry** - Codes expire after 10 minutes
- **Attempt Limiting** - Max 3 OTP verification attempts
- **CORS Protection** - Configured for specific origins
- **Environment Variables** - Sensitive data not in code

## Testing

### Test Sign Up

1. Open `http://localhost:5500/signup.html`
2. Fill in the form
3. Check your email for OTP
4. Enter OTP on verification page
5. Account should be verified

### Test Sign In

1. Open `http://localhost:5500/sign_in.html`
2. Enter your credentials
3. Should redirect to home page

### Test Social Login

1. Click Google or Facebook button
2. Authorize the app
3. Should redirect back and sign in

## Troubleshooting

### Email not sending

- Check Gmail App Password is correct
- Ensure 2-Step Verification is enabled
- Check EMAIL_USER and EMAIL_PASSWORD in .env

### MongoDB connection error

- Ensure MongoDB is running
- Check MONGODB_URI in .env
- For Atlas, check network access settings

### OAuth not working

- Verify redirect URIs match exactly
- Check client IDs and secrets
- Ensure OAuth consent screen is configured

### CORS errors

- Check FRONTEND_URL in .env matches your frontend URL
- Ensure backend server is running

## Production Deployment

### Backend (Heroku/Railway/Render)

1. Set all environment variables
2. Use production MongoDB (Atlas)
3. Set `NODE_ENV=production`
4. Update callback URLs to production domain

### Frontend (Vercel/Netlify)

1. Update API_BASE_URL in `js/api.js`
2. Deploy static files
3. Update FRONTEND_URL in backend .env

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
