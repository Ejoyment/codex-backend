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
        // Figma semantic aliases
        figma: {
          bg: '#0f131c',
          deep: '#0a0d15',
          alt: '#090e16',
          surface: '#101d2c',
          raised: '#1d263b',
          blue: '#1a3345',
          accent: '#12dce5',
          'accent-bright': '#68f7ff',
          'accent-soft': '#a4edf0',
          purple: '#8a38f5',
          'purple-soft': '#c795e8',
          text: '#ffffff',
          'text-soft': '#c7d2dd',
          'text-alt': '#dee2f6',
          'text-muted': '#9aaeba',
          'text-faint': '#748194',
          'text-ghost': '#59687a',
          success: '#03ba03',
          error: '#ec1414',
          warning: '#e5b84a',
          info: '#1478e8',
        },

        // Legacy aliases now point at the Figma palette.
        navy: '#0f131c',
        'navy-light': '#121821',
        'navy-dark': '#0a0d15',
        'navy-lighter': '#1a2230',
        'blue-accent': '#12dce5',
        'green-accent': '#03ba03',
        'purple-accent': '#8a38f5',

        // Tailwind ramps overridden with Figma values so existing utility
        // classes inherit the design system automatically.
        blue: {
          300: '#a4edf0',
          400: '#68f7ff',
          500: '#12dce5',
          600: '#0fb9c1',
          700: '#0c969c',
        },
        cyan: {
          300: '#a4edf0',
          400: '#68f7ff',
          500: '#12dce5',
          600: '#0fb9c1',
          700: '#0c969c',
        },
        emerald: {
          300: '#56e5a9',
          400: '#03ba03',
          500: '#039503',
          600: '#028002',
        },
        green: {
          300: '#56e5a9',
          400: '#03ba03',
          500: '#039503',
          600: '#028002',
        },
        red: {
          300: '#ec8f8f',
          400: '#ec1414',
          500: '#d61111',
          600: '#b90e0e',
        },
        purple: {
          300: '#c795e8',
          400: '#a862f0',
          500: '#8a38f5',
          600: '#7429d6',
        },
        violet: {
          300: '#c795e8',
          400: '#a862f0',
          500: '#8a38f5',
          600: '#7429d6',
        },
        zinc: {
          200: '#dee2f6',
          300: '#c7d2dd',
          400: '#9aaeba',
          500: '#748194',
          600: '#59687a',
          700: '#3a4657',
          800: '#1d263b',
          900: '#101d2c',
          950: '#0a0d15',
        },
        slate: {
          200: '#dee2f6',
          300: '#c7d2dd',
          400: '#9aaeba',
          500: '#748194',
          600: '#59687a',
          700: '#3a4657',
          800: '#1d263b',
          900: '#101d2c',
          950: '#0a0d15',
        },
        gray: {
          200: '#dee2f6',
          300: '#c7d2dd',
          400: '#9aaeba',
          500: '#748194',
          600: '#59687a',
          700: '#3a4657',
          800: '#1d263b',
          900: '#101d2c',
          950: '#0a0d15',
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
