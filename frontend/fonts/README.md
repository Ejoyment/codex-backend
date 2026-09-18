# Space Grotesk Font Setup

## Overview
All HTML pages in this application have been configured to use the **"Space Grotesk"** font family - a bold, modern tech font perfect for developer tools and tech applications.

## Font Details
**Space Grotesk** is loaded directly from Google Fonts, so no local font files are required. The font is automatically available and will load from Google's CDN.

### Available Weights:
- Light (300)
- Regular (400)
- Medium (500)
- Semi-Bold (600)
- Bold (700)

## Why Space Grotesk?
Space Grotesk is a proportional variant of the fixed-width Space Mono family. It features:
- **Bold, modern appearance** - Perfect for tech and developer-focused applications
- **Excellent readability** - Optimized for both headings and body text
- **Contemporary design** - Geometric structure with a tech-forward aesthetic
- **Wide language support** - Supports multiple character sets
- **Free & Open Source** - Available via Google Fonts under the SFL Open Font License

## Implementation
The font is loaded via Google Fonts in `fonts/fonts.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
```

## Fallback Fonts
If Space Grotesk is unavailable, the system will fall back to:
- `-apple-system` (macOS/iOS)
- `BlinkMacSystemFont` (Chrome on macOS)
- `Segoe UI` (Windows)
- `sans-serif` (generic fallback)

## Files Updated
All HTML files reference `fonts/fonts.css`:
- Landing pages: index.html, features.html, about.html, blog.html, etc.
- Authentication: sign_in.html, signup.html
- Dashboard: dashboard.html, dashboard-pro.html
- Workspace: teams.html, tasks.html, source-code.html, settings.html
- Support: support.html, support-admin.html
- And all other HTML pages

CSS files updated:
- `css/workspace.css`
- `css/professional-ui.css`

## Font Usage in Code
All elements use Space Grotesk via:
```css
font-family: 'Space Grotesk', sans-serif;
```

## Performance
- Font files are loaded from Google's global CDN
- Uses `font-display: swap` for optimal loading performance
- Minimal impact on page load times
- Cached across all pages for efficiency

## Alternative Tech Fonts
If you want to try other bold tech fonts, consider:
- **Rajdhani** - Ultra-bold, condensed tech font
- **Orbitron** - Geometric, futuristic design
- **Inter** - Modern UI font with excellent readability
- **Poppins** - Geometric sans-serif with strong presence

To change fonts, simply update the `@import` URL in `fonts/fonts.css` and replace `'Space Grotesk'` with your chosen font name throughout the codebase.

## License
Space Grotesk is licensed under the SIL Open Font License 1.1, making it free for both personal and commercial use.

## Resources
- [Space Grotesk on Google Fonts](https://fonts.google.com/specimen/Space+Grotesk)
- [Space Grotesk GitHub Repository](https://github.com/floriankarsten/space-grotesk)
