/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        ink: '#0D0D0F',
        paper: '#F5F2ED',
        accent: '#E84C2E',
        muted: '#8B8B8B',
        border: '#E2DDD6',
        success: '#2A9D5C',
        warning: '#E8A22E',
      },
    },
  },
  plugins: [],
}
