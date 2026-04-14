/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontSize: {
        'hero-title': ['1.75rem', { lineHeight: '2.25rem' }],
        'page-title': ['1.375rem', { lineHeight: '1.875rem' }],
        'section-title': ['1.125rem', { lineHeight: '1.625rem' }],
        'card-title': ['1rem', { lineHeight: '1.5rem' }],
        body: ['0.875rem', { lineHeight: '1.5rem' }],
        label: ['0.75rem', { lineHeight: '1rem' }],
        caption: ['0.6875rem', { lineHeight: '0.9375rem' }],
        micro: ['0.625rem', { lineHeight: '0.875rem' }],
        metric: ['1.5rem', { lineHeight: '2rem' }],
      },
    },
  },
  plugins: [],
}
