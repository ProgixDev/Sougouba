import type { Config } from 'tailwindcss';
// The single source of truth, shared with the Expo app. Both surfaces read the
// same plain-CJS file, so the palettes cannot drift apart.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { forest, terracotta, mustard, neutral } = require('../tailwind.tokens.js');

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest,
        terracotta,
        mustard,
        neutral,
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--color-card) / <alpha-value>)',
          foreground: 'rgb(var(--color-card-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        // Present in the app's ThemeColors but never exposed as a CSS variable
        // there, so it is unreachable from a className. Exposed here.
        'border-strong': 'rgb(var(--color-border-strong) / <alpha-value>)',
        destructive: {
          DEFAULT: 'rgb(var(--color-destructive) / <alpha-value>)',
          foreground: 'rgb(var(--color-destructive-foreground) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success) / <alpha-value>)',
        // Text-safe pairs. The plain `success`/`accent` tokens are fills; using
        // them as ink on a light ground fails AA.
        'success-strong': 'rgb(var(--color-success-strong) / <alpha-value>)',
        'accent-strong': 'rgb(var(--color-accent-strong) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        // 20px is the app's de-facto card radius (used 52 times) and has no token
        // there. It gets one here.
        card: '20px',
        xl: '24px',
      },
      boxShadow: {
        // Exactly two, plus the tinted CTA lift. The rejected CTA used 0.35;
        // 0.16 is the value that shipped.
        card: '0 4px 12px rgba(0,0,0,.06)',
        floating: '0 8px 20px rgba(0,0,0,.14)',
        cta: '0 3px 9px rgba(124,52,23,.16)',
        'cta-primary': '0 3px 9px rgba(28,84,57,.16)',
      },
      maxWidth: { content: '1200px' },
    },
  },
  plugins: [],
} satisfies Config;
