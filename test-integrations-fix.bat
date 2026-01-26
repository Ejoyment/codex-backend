@echo off
echo ========================================
echo Testing Integration & Team Fixes
echo ========================================
echo.

echo This script will help you test the fixes for:
echo 1. GitHub repositories not showing
echo 2. Discord servers not showing  
echo 3. Team creation not working
echo.

echo STEP 1: Restart the backend server
echo ----------------------------------------
echo Press Ctrl+C to stop the current server, then run:
echo   start-backend.bat
echo.
pause

echo.
echo STEP 2: Check your integrations
echo ----------------------------------------
echo Open your browser and go to:
echo   http://localhost:5500/settings.html
echo.
echo Verify that you see:
echo   - GitHub: Connected (with your username)
echo   - Discord: Connected (with your username)
echo.
echo If NOT connected, click "Connect" for each integration.
echo.
pause

echo.
echo STEP 3: Test GitHub data loading
echo ----------------------------------------
echo 1. Go to: http://localhost:5500/dashboard.html
echo 2. Click the "GitHub" button in the Integrations Hub
echo 3. You should see your actual GitHub repositories
echo.
echo If you see "No repositories found":
echo   - Open browser console (F12)
echo   - Check for error messages
echo   - Look for 401/403 errors (token expired)
echo.
pause

echo.
echo STEP 4: Test Discord data loading
echo ----------------------------------------
echo 1. On the dashboard, click the "Discord" button
echo 2. You should see your actual Discord servers
echo.
echo If you see "No servers found":
echo   - Check browser console for errors
echo   - Your Discord token may have expired
echo   - Try disconnecting and reconnecting Discord
echo.
pause

echo.
echo STEP 5: Test Team Creation
echo ----------------------------------------
echo 1. Go to: http://localhost:5500/teams.html
echo 2. Click "Create Workspace"
echo 3. Enter a workspace name (e.g., "My Team")
echo 4. Click "Create"
echo.
echo Expected results:
echo   - Freebie users: Can create 1 workspace (max 3 members)
echo   - Professional users: Can create 1 workspace (max 10 members)
echo   - Enterprise users: Can create unlimited workspaces
echo.
echo If creation fails, you'll see a clear error message explaining why.
echo.
pause

echo.
echo STEP 6: Check backend logs
echo ----------------------------------------
echo Look at your backend terminal for any error messages.
echo Common issues:
echo   - "Integration not found" = Not connected in settings
echo   - "401 Unauthorized" = Token expired, reconnect integration
echo   - "403 Forbidden" = Tier restriction (upgrade needed)
echo.
pause

echo.
echo ========================================
echo TROUBLESHOOTING TIPS
echo ========================================
echo.
echo Problem: GitHub repos still not showing
echo Solution: 
echo   1. Go to Settings and disconnect GitHub
echo   2. Reconnect GitHub (this gets a fresh token)
echo   3. Go back to Dashboard and check again
echo.
echo Problem: Discord servers still not showing
echo Solution:
echo   1. Disconnect and reconnect Discord in Settings
echo   2. Make sure you're in at least one Discord server
echo   3. Check browser console for API errors
echo.
echo Problem: Team creation says "Upgrade required"
echo Solution:
echo   - Freebie users can now create 1 workspace!
echo   - If you already have a workspace, delete it first
echo   - Or upgrade to Professional for more features
echo.
echo Problem: "Invalid token" errors
echo Solution:
echo   - Your auth token may have expired
echo   - Sign out and sign back in
echo   - Check localStorage.getItem('authToken') in console
echo.
echo ========================================
echo Testing complete!
echo ========================================
pause
