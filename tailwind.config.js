/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Off-black backgrounds, warm-grey panels
        bg: {
          base: '#0E0F11',
          panel: '#15171A',
          elevated: '#1B1E22',
          hover: '#22262B',
        },
        // Borders and rules
        rule: {
          DEFAULT: '#2A2E34',
          subtle: '#1F2227',
          strong: '#3A3F47',
        },
        // Text
        ink: {
          primary: '#F7FAFC',
          secondary: '#A0AEC0',
          tertiary: '#718096',
          muted: '#4A5568',
        },
        // Signal colors
        signal: {
          critical: '#E53E3E',  // SAR / sanctions hit
          warning: '#D69E2E',   // structuring flag, monitoring alert
          ok: '#319795',        // normal state
          info: '#3182CE',      // informational
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
