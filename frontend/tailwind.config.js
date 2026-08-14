/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        apple: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          card: 'rgb(var(--color-card) / <alpha-value>)',
          secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--color-tertiary) / <alpha-value>)',
          blue: 'rgb(var(--color-accent) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          separator: 'rgb(var(--color-separator) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'sans-serif'],
      },
      borderRadius: {
        apple: '14px',
      },
      backdropBlur: {
        apple: '40px',
      },
    },
  },
  plugins: [],
}
