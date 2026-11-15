const fs = require('fs');
const path = require('path');

/**
 * The Figma token file is the single source of truth for colour. Read the
 * `--figma-*` custom properties here instead of duplicating hex values, so a
 * token change in design-tokens.css reaches Tailwind utilities automatically.
 */
function readFigmaTokens() {
  const file = path.join(__dirname, 'styles', 'design-tokens.css');
  const css = fs.readFileSync(file, 'utf8');
  const tokens = {};
  const declaration = /--figma-([a-z0-9-]+)\s*:\s*([^;]+);/g;
  let match = declaration.exec(css);
  while (match) {
    const value = match[2].trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value)) {
      tokens[match[1]] = value;
    }
    match = declaration.exec(css);
  }
  if (!tokens.bg || !tokens.accent) {
    throw new Error(`Could not read Figma tokens from ${file}`);
  }
  return tokens;
}

const t = readFigmaTokens();

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx,ts,tsx,mdx}',
    './components/**/*.{js,jsx,ts,tsx,mdx}',
    './app/**/*.{js,jsx,ts,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Figma semantic aliases, derived from styles/design-tokens.css.
        figma: {
          bg: t.bg,
          deep: t['bg-deep'],
          alt: t['bg-alt'],
          surface: t.surface,
          raised: t['surface-raised'],
          'surface-raised': t['surface-raised'],
          blue: t['surface-blue'],
          overlay: t.overlay,
          accent: t.accent,
          'accent-bright': t['accent-bright'],
          'accent-soft': t['accent-soft'],
          'accent-dim': t['accent-dim'],
          'accent-deep': t['accent-deep'],
          purple: t.purple,
          'purple-soft': t['purple-soft'],
          'blue-text': t['blue-text'],
          text: t.text,
          'text-secondary': t['text-secondary'],
          'text-soft': t['text-soft'],
          'text-alt': t['text-alt'],
          'text-muted': t['text-muted'],
          'text-faint': t['text-faint'],
          'text-ghost': t['text-ghost'],
          success: t.success,
          'success-deep': t['success-deep'],
          'success-light': t['success-light'],
          error: t.error,
          'error-soft': t['error-soft'],
          warning: t.warning,
          info: t.info,
          'info-deep': t['info-deep'],
          border: t.border,
          'border-strong': t['border-strong'],
          'border-soft': t['border-soft'],
          'border-faint': t['border-faint'],
          'border-accent': t['border-accent'],
          'border-accent-strong': t['border-accent-strong'],
          panel: t.panel,
          'panel-deep': t['panel-deep'],
        },

        // Legacy aliases now point at the Figma palette.
        navy: t.bg,
        'navy-light': '#121821',
        'navy-dark': t['bg-deep'],
        'navy-lighter': '#1a2230',
        'blue-accent': t.accent,
        'green-accent': t.success,
        'purple-accent': t.purple,

        // Tailwind ramps overridden with Figma values so existing utility
        // classes inherit the design system automatically.
        blue: {
          300: t['accent-soft'],
          400: t['accent-bright'],
          500: t.accent,
          600: t['accent-dim'],
          700: t['accent-deep'],
        },
        cyan: {
          300: t['accent-soft'],
          400: t['accent-bright'],
          500: t.accent,
          600: t['accent-dim'],
          700: t['accent-deep'],
        },
        emerald: {
          300: t['success-light'],
          400: t.success,
          500: t['success-deep'],
          600: '#028002',
        },
        green: {
          300: t['success-light'],
          400: t.success,
          500: t['success-deep'],
          600: '#028002',
        },
        red: {
          300: t['error-soft'],
          400: t.error,
          500: '#d61111',
          600: '#b90e0e',
        },
        purple: {
          300: t['purple-soft'],
          400: '#a862f0',
          500: t.purple,
          600: '#7429d6',
        },
        violet: {
          300: t['purple-soft'],
          400: '#a862f0',
          500: t.purple,
          600: '#7429d6',
        },
        zinc: {
          200: t['text-alt'],
          300: t['text-soft'],
          400: t['text-muted'],
          500: t['text-faint'],
          600: t['text-ghost'],
          700: '#3a4657',
          800: t['surface-raised'],
          900: t.surface,
          950: t['bg-deep'],
        },
        slate: {
          200: t['text-alt'],
          300: t['text-soft'],
          400: t['text-muted'],
          500: t['text-faint'],
          600: t['text-ghost'],
          700: '#3a4657',
          800: t['surface-raised'],
          900: t.surface,
          950: t['bg-deep'],
        },
        gray: {
          200: t['text-alt'],
          300: t['text-soft'],
          400: t['text-muted'],
          500: t['text-faint'],
          600: t['text-ghost'],
          700: '#3a4657',
          800: t['surface-raised'],
          900: t.surface,
          950: t['bg-deep'],
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-roboto-mono)', 'Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        glow: '0 0 24px rgba(18, 220, 229, 0.35)',
        'glow-soft': '0 0 22px rgba(18, 220, 229, 0.28)',
        'glow-faint': '0 0 26px rgba(18, 220, 229, 0.2)',
        elevation: '0 18px 50px rgba(0, 0, 0, 0.24)',
        'elevation-lg': '0 28px 90px rgba(0, 0, 0, 0.55)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-in': 'slideIn 0.5s ease-out forwards',
        'blink': 'blink 1s infinite',
        'float': 'float 8s infinite ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
    },
  },
  plugins: [],
};
