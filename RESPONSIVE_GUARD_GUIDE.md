# Responsive Guard Feature - Desktop-Only Dashboard

## Overview
The Responsive Guard feature ensures that your CODEX INC dashboard and authenticated pages are only accessible on desktop devices with adequate screen size. This provides the best user experience and prevents layout issues on mobile devices.

## Features

### 1. Mobile Device Blocking
- Automatically detects mobile devices (phones, tablets)
- Shows a beautiful full-screen message: "Desktop Required"
- Provides a button to return to the homepage
- Allows users to sign up, sign in, and verify email on mobile

### 2. Small Window Detection
- Monitors browser window size in real-time
- Blocks access when window width is below 1024px
- Shows message: "Maximize Your Browser"
- Automatically removes block when window is resized

### 3. Protected Pages
The following pages are now desktop-only:
- ✅ dashboard.html
- ✅ settings.html
- ✅ profile.html
- ✅ tasks.html
- ✅ source-code.html
- ✅ workspace.html

### 4. Public Pages (Mobile Accessible)
These pages remain accessible on all devices:
- ✅ index.html (Homepage)
- ✅ signup.html
- ✅ sign_in.html
- ✅ verify-email.html
- ✅ verify-success.html
- ✅ pricing.html

## How It Works

### Technical Implementation

1. **CSS File**: `css/responsive-guard.css`
   - Defines overlay styles
   - Includes animations (pulse, bounce)
   - Responsive and beautiful design

2. **JavaScript File**: `js/responsive-guard.js`
   - Detects mobile devices via user agent
   - Monitors window resize events
   - Creates dynamic overlays
   - Auto-initializes on protected pages

3. **Page Integration**
   Protected pages include:
   ```html
   <link rel="stylesheet" href="css/responsive-guard.css">
   <script src="js/responsive-guard.js"></script>
   ```
   
   And have data attributes on body tag:
   ```html
   <body data-protected data-desktop-only data-min-width="1024" data-redirect-url="index.html">
   ```

## Configuration

### Customize Minimum Width
Change the `data-min-width` attribute:
```html
<body data-min-width="1280">  <!-- Require 1280px instead of 1024px -->
```

### Customize Redirect URL
Change where mobile users are sent:
```html
<body data-redirect-url="pricing.html">  <!-- Send to pricing instead of home -->
```

### Disable for Specific Page
Remove the data attributes:
```html
<body>  <!-- No protection -->
```

## User Experience

### Mobile User Flow
1. User visits dashboard on mobile
2. Sees beautiful purple gradient overlay
3. Message: "Desktop Required - The CODEX INC dashboard is optimized for desktop use"
4. Button: "Go to Homepage"
5. Can still access signup/signin on mobile

### Desktop User with Small Window
1. User shrinks browser window below 1024px
2. Sees pink gradient overlay
3. Message: "Maximize Your Browser - Please maximize your browser window"
4. Overlay disappears when window is resized

## Testing

### Test Mobile Blocking
1. Open dashboard.html on your phone
2. Should see "Desktop Required" message
3. Click "Go to Homepage" button
4. Should redirect to index.html

### Test Small Window Blocking
1. Open dashboard.html on desktop
2. Shrink browser window to less than 1024px wide
3. Should see "Maximize Your Browser" message
4. Maximize window - message should disappear

### Test Public Pages
1. Open index.html on mobile - should work
2. Open signup.html on mobile - should work
3. Open sign_in.html on mobile - should work

## Deployment

### Files to Upload to Spaceship
```
css/responsive-guard.css (NEW)
js/responsive-guard.js (NEW)
dashboard.html (UPDATED)
settings.html (UPDATED)
profile.html (UPDATED)
tasks.html (UPDATED)
source-code.html (UPDATED)
workspace.html (UPDATED)
```

### Quick Deploy
Run the deployment script:
```bash
./DEPLOY_RESPONSIVE_GUARD.bat
```

This will:
1. Commit changes to GitHub
2. Push to Render (backend auto-deploys)
3. Copy files to UPLOAD_TO_SPACESHIP folder
4. Show you which files to upload

### Manual Upload via FTP
1. Connect to Spaceship FTP
2. Upload `css/responsive-guard.css` to `/public_html/css/`
3. Upload `js/responsive-guard.js` to `/public_html/js/`
4. Upload all updated HTML files to `/public_html/`

## Browser Compatibility
- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari (Desktop & Mobile)
- ✅ Opera (Desktop & Mobile)

## Customization

### Change Overlay Colors
Edit `css/responsive-guard.css`:
```css
/* Mobile block - currently purple gradient */
.mobile-block-overlay {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Small window block - currently pink gradient */
.small-window-overlay {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}
```

### Change Messages
Edit `js/responsive-guard.js`:
```javascript
// Mobile message
<p class="mobile-block-message">
    Your custom message here
</p>

// Small window message
<p class="small-window-message">
    Your custom message here
</p>
```

### Change Icons
Edit `js/responsive-guard.js`:
```javascript
// Mobile icon (currently 💻)
<div class="mobile-block-icon">🚀</div>

// Small window icon (currently ⛶)
<div class="small-window-icon">📱</div>
```

## Troubleshooting

### Issue: Overlay shows on desktop
**Solution**: Check browser window width is at least 1024px

### Issue: Can't access dashboard on tablet
**Solution**: This is intentional - tablets are treated as mobile devices

### Issue: Overlay doesn't disappear when resizing
**Solution**: Hard refresh the page (Ctrl+Shift+R)

### Issue: Public pages are blocked
**Solution**: Ensure public pages don't have `data-protected` attribute

## Advanced Usage

### Programmatic Control
```javascript
// Disable protection temporarily
window.responsiveGuard.disable();

// Re-enable protection
window.responsiveGuard.enable();

// Check if mobile
const isMobile = window.responsiveGuard.isMobileDevice();

// Check if window is small
const isSmall = window.responsiveGuard.isSmallWindow();
```

### Custom Initialization
```javascript
// Create custom guard with different settings
const customGuard = new ResponsiveGuard({
    minWidth: 1280,
    allowMobile: false,
    redirectUrl: 'pricing.html'
});
```

## Benefits

1. **Better UX**: Users get clear messaging instead of broken layouts
2. **Professional**: Shows attention to detail and user experience
3. **Flexible**: Easy to customize colors, messages, and behavior
4. **Performant**: Lightweight JavaScript with no dependencies
5. **Responsive**: Real-time detection of window resizing

## Support

If you encounter any issues:
1. Check browser console for errors (F12)
2. Verify all files are uploaded correctly
3. Clear browser cache (Ctrl+Shift+Delete)
4. Test in incognito mode

---

**Created**: January 27, 2026
**Version**: 1.0.0
**Status**: ✅ Production Ready
