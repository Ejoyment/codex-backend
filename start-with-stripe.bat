@echo off
echo ========================================
echo CODEX INC - Starting with Stripe
echo ========================================
echo.
echo This will open TWO windows:
echo 1. Backend Server
echo 2. Stripe CLI (for webhooks)
echo.
echo Make sure you have:
echo - Stripe CLI installed
echo - Logged in with: stripe login
echo.
pause

echo.
echo Starting Backend Server...
start cmd /k "title CODEX Backend && start-backend.bat"

timeout /t 3 /nobreak >nul

echo Starting Stripe CLI...
start cmd /k "title Stripe Webhooks && stripe listen --forward-to localhost:3000/api/subscription/webhook/stripe"

echo.
echo ========================================
echo Both terminals are now running!
echo ========================================
echo.
echo IMPORTANT:
echo 1. Copy the webhook secret from Stripe CLI window
echo 2. Update .env file with: STRIPE_WEBHOOK_SECRET=whsec_...
echo 3. Restart backend (Ctrl+C in backend window, then run start-backend.bat again)
echo 4. Keep both windows open while testing
echo.
echo Press any key to close this window...
pause >nul
