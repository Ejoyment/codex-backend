# Adding Skeleton Loaders to All Pages

## ✅ What Was Done

I've created skeleton loading screens for your pages to show while content loads instead of blank screens.

---

## 📁 Files Created

1. **`css/skeleton.css`** - Skeleton loading styles
2. **`skeleton-loader.html`** - Reusable skeleton component

---

## ✅ Pages Already Updated

These pages now have skeleton loaders:

1. ✅ **dashboard.html** - Shows sidebar and card skeletons
2. ✅ **tasks.html** - Shows table skeleton
3. ✅ **pricing.html** - Shows pricing card skeletons

---

## 📝 How to Add to Other Pages

For any page that needs a skeleton loader, add this right after the `<body>` tag:

### Simple Method (Recommended):

Add this at the start of `<body>`:

```html
<body>
    <!-- Skeleton Loader -->
    <style>
        .page-skeleton {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #f8fafc;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        body.loaded .page-skeleton {
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s;
        }
        body:not(.loaded) > *:not(.page-skeleton):not(script):not(style) {
            opacity: 0;
        }
        body.loaded > * {
            opacity: 1;
            transition: opacity 0.3s;
        }
    </style>

    <div class="page-skeleton">
        <div style="text-align: center;">
            <div style="width: 64px; height: 64px; margin: 0 auto 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite;">
                <span style="color: white; font-size: 32px; font-weight: bold;">C</span>
            </div>
            <div style="color: #64748b; font-size: 14px;">Loading...</div>
        </div>
    </div>

    <style>
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    </style>

    <script>
        window.addEventListener('load', () => {
            setTimeout(() => {
                document.body.classList.add('loaded');
            }, 200);
        });
    </script>

    <!-- Your page content here -->
```

---

## 🎯 Pages That Need Skeleton Loaders

Add the skeleton loader to these pages:

- [ ] **signup.html**
- [ ] **sign_in.html** 
- [ ] **profile.html**
- [ ] **settings.html**
- [ ] **editor.html**
- [ ] **standup.html**
- [ ] **integrations.html**
- [ ] **payment-success.html**
- [ ] **verify-email.html**

---

## 🎨 Customization

### Change Loading Color:
```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
/* Change to your brand colors */
```

### Change Loading Text:
```html
<div>Loading CODEX INC...</div>
<!-- Change to any text you want -->
```

### Add Loading Bar:
```html
<div style="width: 200px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 16px auto;">
    <div style="width: 100%; height: 100%; background: #667eea; animation: loading 1.5s infinite;"></div>
</div>

<style>
    @keyframes loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }
</style>
```

---

## 🧪 Testing

1. Open any updated page
2. You should see the skeleton/loading screen briefly
3. Content fades in smoothly after loading
4. No more blank white screen!

---

## 💡 How It Works

1. **Skeleton shows immediately** when page loads
2. **Content is hidden** (opacity: 0) while loading
3. **When page loads**, `loaded` class is added to body
4. **Skeleton fades out**, content fades in
5. **Smooth transition** for better UX

---

## 🎊 Benefits

- ✅ No more blank screens
- ✅ Better perceived performance
- ✅ Professional loading experience
- ✅ Smooth transitions
- ✅ Consistent across all pages

---

## 📝 Quick Copy-Paste

For pages with **sidebar** (dashboard, tasks):
- Already done! ✅

For pages **without sidebar** (sign in, sign up, pricing):
- Use the simple method above

For **custom layouts**:
- Copy from `skeleton-loader.html`
- Customize the skeleton structure

---

*Last updated: January 24, 2026*
