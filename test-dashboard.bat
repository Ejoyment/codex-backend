@echo off
echo ========================================
echo Testing Dashboard Fix
echo ========================================
echo.
echo [1/3] Checking if backend is running...
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Backend is running
) else (
    echo ✗ Backend is NOT running
    echo.
    echo Please start the backend first:
    echo   start-backend.bat
    echo.
    pause
    exit /b 1
)

echo.
echo [2/3] Dashboard fixes applied:
echo   ✓ Fixed CSS skeleton loader visibility
echo   ✓ Added error state handling
echo   ✓ Ensured skeleton hides after 500ms
echo   ✓ Improved content loading logic
echo.
echo [3/3] Next Steps:
echo ========================================
echo 1. Clear browser cache (Ctrl+Shift+Delete)
echo 2. Or use Incognito/Private window
echo 3. Go to: http://localhost:5500/dashboard-new.html
echo 4. The skeleton should disappear within 500ms
echo 5. Check browser console (F12) for any errors
echo.
echo If you see errors in console:
echo   - Check if MongoDB is connected
echo   - Verify you're logged in (authToken exists)
echo   - Restart backend if needed
echo.
echo ========================================
pause
