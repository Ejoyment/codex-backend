# System Architecture & Flow Diagrams

## 📊 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CODEX INC                                │
│                   Authentication System                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Frontend   │ ◄─────► │   Backend    │ ◄─────► │   Database   │
│  (HTML/CSS)  │  HTTP   │  (Node.js)   │  Query  │  (MongoDB)   │
└──────────────┘         └──────────────┘         └──────────────┘
                                │
                                │
                    ┌───────────┼───────────┐
                    │           │           │
                    ▼           ▼           ▼
              ┌─────────┐ ┌─────────┐ ┌─────────┐
              │  Email  │ │ Google  │ │Facebook │
              │ Service │ │  OAuth  │ │  OAuth  │
              └─────────┘ └─────────┘ └─────────┘
```

---

## 🔄 Authentication Flows

### 1. Email/Password Sign Up Flow

```
User                Frontend              Backend              Email Service        Database
 │                     │                     │                      │                  │
 │  Fill Form          │                     │                      │                  │
 ├────────────────────►│                     │                      │                  │
 │                     │  POST /auth/signup  │                      │                  │
 │                     ├────────────────────►│                      │                  │
 │                     │                     │  Create User         │                  │
 │                     │                     ├─────────────────────────────────────────►│
 │                     │                     │                      │                  │
 │                     │                     │  POST /otp/send      │                  │
 │                     │                     ├─────────────────────►│                  │
 │                     │                     │                      │  Generate OTP    │
 │                     │                     │                      ├─────────────────►│
 │                     │                     │                      │                  │
 │                     │                     │                      │  Send Email      │
 │  Receive Email      │                     │                      │                  │
 │◄────────────────────┼─────────────────────┼──────────────────────┤                  │
 │                     │                     │                      │                  │
 │  Redirect to OTP    │                     │                      │                  │
 │◄────────────────────┤                     │                      │                  │
 │                     │                     │                      │                  │
 │  Enter OTP          │                     │                      │                  │
 ├────────────────────►│  POST /otp/verify   │                      │                  │
 │                     ├────────────────────►│                      │                  │
 │                     │                     │  Verify OTP          │                  │
 │                     │                     ├─────────────────────────────────────────►│
 │                     │                     │                      │                  │
 │                     │                     │  Mark Verified       │                  │
 │                     │                     ├─────────────────────────────────────────►│
 │                     │                     │                      │                  │
 │                     │                     │  Send Welcome Email  │                  │
 │                     │                     ├─────────────────────►│                  │
 │  Success!           │                     │                      │                  │
 │◄────────────────────┴─────────────────────┤                      │                  │
 │                                           │                      │                  │
```

### 2. Email/Password Sign In Flow

```
User                Frontend              Backend              Database
 │                     │                     │                      │
 │  Enter Credentials  │                     │                      │
 ├────────────────────►│                     │                      │
 │                     │  POST /auth/signin  │                      │
 │                     ├────────────────────►│                      │
 │                     │                     │  Find User           │
 │                     │                     ├─────────────────────►│
 │                     │                     │                      │
 │                     │                     │  Verify Password     │
 │                     │                     │  (bcrypt compare)    │
 │                     │                     │                      │
 │                     │                     │  Generate JWT        │
 │                     │                     │                      │
 │  JWT Token          │                     │                      │
 │◄────────────────────┴─────────────────────┤                      │
 │                                           │                      │
 │  Store in localStorage                    │                      │
 │                                           │                      │
 │  Redirect to Dashboard                    │                      │
 │                                           │                      │
```

### 3. Google OAuth Flow

```
User              Frontend         Backend         Google OAuth      Database
 │                   │                │                  │               │
 │  Click Google     │                │                  │               │
 ├──────────────────►│                │                  │               │
 │                   │  Redirect      │                  │               │
 │                   ├───────────────►│                  │               │
 │                   │                │  Redirect        │               │
 │                   │                ├─────────────────►│               │
 │                   │                │                  │               │
 │  Google Login     │                │                  │               │
 │◄──────────────────┼────────────────┼──────────────────┤               │
 │                   │                │                  │               │
 │  Authorize App    │                │                  │               │
 ├──────────────────►│                │                  │               │
 │                   │                │  Auth Code       │               │
 │                   │                │◄─────────────────┤               │
 │                   │                │                  │               │
 │                   │                │  Exchange Code   │               │
 │                   │                │  for User Info   │               │
 │                   │                │                  │               │
 │                   │                │  Create/Find User│               │
 │                   │                ├─────────────────────────────────►│
 │                   │                │                  │               │
 │                   │                │  Generate JWT    │               │
 │                   │                │                  │               │
 │  Redirect + Token │                │                  │               │
 │◄──────────────────┴────────────────┤                  │               │
 │                                    │                  │               │
 │  Store Token & Redirect            │                  │               │
 │                                    │                  │               │
```

### 4. Facebook OAuth Flow

```
Similar to Google OAuth, but with Facebook's OAuth endpoints
```

---

## 🗄️ Database Schema

### Users Collection

```javascript
{
  _id: ObjectId,
  fullName: String,
  email: String (unique, indexed),
  password: String (hashed with bcrypt),
  isVerified: Boolean,
  googleId: String (optional),
  facebookId: String (optional),
  profilePicture: String (optional),
  authProvider: String ('local' | 'google' | 'facebook'),
  createdAt: Date,
  lastLogin: Date
}
```

### OTPs Collection

```javascript
{
  _id: ObjectId,
  email: String (indexed),
  otp: String (4-digit code),
  createdAt: Date (auto-expires after 10 minutes),
  attempts: Number (max 3),
  verified: Boolean
}
```

---

## 🔐 Security Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Security Layers                       │
├─────────────────────────────────────────────────────────┤
│  1. Rate Limiting                                        │
│     • 5 auth attempts per 15 minutes                     │
│     • 3 OTP requests per 15 minutes                      │
├─────────────────────────────────────────────────────────┤
│  2. Password Security                                    │
│     • Bcrypt hashing with salt rounds                    │
│     • Minimum 6 characters                               │
├─────────────────────────────────────────────────────────┤
│  3. OTP Security                                         │
│     • 4-digit random code                                │
│     • 10-minute expiry                                   │
│     • Maximum 3 verification attempts                    │
│     • Auto-delete after verification                     │
├─────────────────────────────────────────────────────────┤
│  4. JWT Tokens                                           │
│     • 7-day expiry                                       │
│     • Signed with secret key                             │
│     • Stored in localStorage                             │
├─────────────────────────────────────────────────────────┤
│  5. CORS Protection                                      │
│     • Whitelist specific origins                         │
│     • Credentials enabled                                │
├─────────────────────────────────────────────────────────┤
│  6. Environment Variables                                │
│     • Sensitive data not in code                         │
│     • .env file not committed to git                     │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
codex-inc/
│
├── Frontend Files
│   ├── index.html              # Landing page
│   ├── signup.html             # Registration form
│   ├── sign_in.html            # Login form
│   ├── verify-email.html       # OTP verification
│   ├── verify-success.html     # Success page
│   ├── auth-success.html       # OAuth redirect handler
│   ├── signup.css              # Signup styles
│   ├── signin.css              # Signin styles
│   └── js/
│       └── api.js              # API integration
│
├── Backend Files
│   ├── server.js               # Express server
│   ├── package.json            # Dependencies
│   ├── .env                    # Environment variables
│   │
│   ├── config/
│   │   └── passport.js         # OAuth strategies
│   │
│   ├── models/
│   │   ├── User.js             # User schema
│   │   └── OTP.js              # OTP schema
│   │
│   ├── routes/
│   │   ├── auth.js             # Auth endpoints
│   │   └── otp.js              # OTP endpoints
│   │
│   └── utils/
│       └── emailService.js     # Email sending
│
└── Documentation
    ├── README.md               # Full documentation
    ├── SETUP_GUIDE.md          # Detailed setup
    ├── QUICK_START.md          # Quick start guide
    └── ARCHITECTURE.md         # This file
```

---

## 🌐 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/signup` | Create new account | No |
| POST | `/api/auth/signin` | Login with credentials | No |
| GET | `/api/auth/google` | Initiate Google OAuth | No |
| GET | `/api/auth/google/callback` | Google OAuth callback | No |
| GET | `/api/auth/facebook` | Initiate Facebook OAuth | No |
| GET | `/api/auth/facebook/callback` | Facebook OAuth callback | No |
| GET | `/api/auth/me` | Get current user | Yes (JWT) |

### OTP Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/otp/send` | Send OTP to email | No |
| POST | `/api/otp/verify` | Verify OTP code | No |
| POST | `/api/otp/resend` | Resend OTP | No |

### Health Check

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/health` | Server status | No |

---

## 🔄 State Management

### Frontend State (sessionStorage)

```javascript
// During signup
sessionStorage.setItem('userEmail', email);
sessionStorage.setItem('userName', fullName);

// During OTP verification
sessionStorage.setItem('otp', otpCode);

// After successful auth
localStorage.setItem('authToken', jwtToken);
localStorage.setItem('user', JSON.stringify(userObject));
```

### Backend State (MongoDB)

- User accounts stored in `users` collection
- OTP codes stored in `otps` collection (auto-expire)
- Sessions managed via JWT tokens

---

## 📊 Data Flow Summary

```
1. User Registration
   └─► Create Account → Send OTP → Verify OTP → Account Active

2. User Login
   └─► Enter Credentials → Verify → Generate JWT → Store Token

3. OAuth Login
   └─► Redirect to Provider → Authorize → Callback → Create/Link Account → Generate JWT

4. Protected Routes
   └─► Send JWT in Header → Verify Token → Allow Access
```

---

## 🎯 Key Features

1. **Multi-factor Authentication**
   - Email/Password + OTP verification
   - Social OAuth (Google, Facebook)

2. **Security Best Practices**
   - Password hashing (bcrypt)
   - JWT tokens
   - Rate limiting
   - CORS protection

3. **User Experience**
   - Auto-focus on inputs
   - Real-time validation
   - Loading states
   - Error handling
   - Responsive design

4. **Email Integration**
   - OTP delivery
   - Welcome emails
   - HTML templates
   - Retry mechanism

---

## 🚀 Deployment Architecture

```
Production Setup:

Frontend (Vercel/Netlify)
    │
    │ HTTPS
    ▼
Backend (Heroku/Railway)
    │
    ├─► MongoDB Atlas (Database)
    ├─► Gmail SMTP (Email)
    ├─► Google OAuth (Authentication)
    └─► Facebook OAuth (Authentication)
```

---

This architecture provides a scalable, secure, and maintainable authentication system! 🎉
