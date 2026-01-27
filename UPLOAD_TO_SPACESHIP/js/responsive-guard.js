// Responsive Guard - Desktop Only Protection
// Blocks mobile devices and small browser windows from accessing dashboard pages

class ResponsiveGuard {
    constructor(options = {}) {
        this.minWidth = options.minWidth || 1024; // Minimum width for desktop
        this.allowMobile = options.allowMobile || false; // Allow mobile access
        this.redirectUrl = options.redirectUrl || 'index.html'; // Redirect URL for mobile
        
        this.init();
    }

    init() {
        // Check on load
        this.checkDevice();
        
        // Check on resize
        window.addEventListener('resize', () => {
            this.checkDevice();
        });
        
        // Check on orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.checkDevice(), 100);
        });
    }

    isMobileDevice() {
        // Check user agent for mobile devices
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        
        // Mobile device patterns
        const mobilePatterns = [
            /Android/i,
            /webOS/i,
            /iPhone/i,
            /iPad/i,
            /iPod/i,
            /BlackBerry/i,
            /Windows Phone/i,
            /Mobile/i
        ];
        
        return mobilePatterns.some(pattern => userAgent.match(pattern));
    }

    isSmallWindow() {
        // Check if window width is below minimum
        return window.innerWidth < this.minWidth;
    }

    checkDevice() {
        const body = document.body;
        const isMobile = this.isMobileDevice();
        const isSmall = this.isSmallWindow();

        // Remove existing classes
        body.classList.remove('show-mobile-block', 'show-small-window');

        if (!this.allowMobile && isMobile) {
            // Block mobile devices
            body.classList.add('show-mobile-block');
            this.createMobileBlockOverlay();
        } else if (isSmall) {
            // Block small windows on desktop
            body.classList.add('show-small-window');
            this.createSmallWindowOverlay();
        }
    }

    createMobileBlockOverlay() {
        // Check if overlay already exists
        if (document.querySelector('.mobile-block-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'mobile-block-overlay';
        overlay.innerHTML = `
            <div class="mobile-block-content">
                <div class="mobile-block-icon">💻</div>
                <h1 class="mobile-block-title">Desktop Required</h1>
                <p class="mobile-block-message">
                    The CODEX INC dashboard is optimized for desktop use. 
                    Please access this page from your PC or laptop for the best experience.
                </p>
                <a href="${this.redirectUrl}" class="mobile-block-button">
                    Go to Homepage
                </a>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    createSmallWindowOverlay() {
        // Check if overlay already exists
        if (document.querySelector('.small-window-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'small-window-overlay';
        overlay.innerHTML = `
            <div class="small-window-content">
                <div class="small-window-icon">⛶</div>
                <h1 class="small-window-title">Maximize Your Browser</h1>
                <p class="small-window-message">
                    Please maximize your browser window or increase the window size to at least ${this.minWidth}px width to view the dashboard.
                </p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    // Allow programmatic control
    enable() {
        this.allowMobile = false;
        this.checkDevice();
    }

    disable() {
        this.allowMobile = true;
        document.body.classList.remove('show-mobile-block', 'show-small-window');
    }
}

// Auto-initialize for dashboard pages (can be customized per page)
if (typeof window !== 'undefined') {
    // Check if this is a protected page (has data-protected attribute on body)
    document.addEventListener('DOMContentLoaded', () => {
        const body = document.body;
        if (body.hasAttribute('data-protected') || body.hasAttribute('data-desktop-only')) {
            const minWidth = body.getAttribute('data-min-width') || 1024;
            const redirectUrl = body.getAttribute('data-redirect-url') || 'index.html';
            
            window.responsiveGuard = new ResponsiveGuard({
                minWidth: parseInt(minWidth),
                redirectUrl: redirectUrl
            });
        }
    });
}
