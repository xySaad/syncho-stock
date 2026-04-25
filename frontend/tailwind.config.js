/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"DM Mono"', "monospace"],
        sans: ['"Outfit"', "sans-serif"],
      },
      colors: {
        bg: "#06060F",
        surface: "#0D0D1A",
        raised: "#161625",
        border: "#1E1E30",
        accent: "#F59E0B",
        cyan: "#22D3EE",
        success: "#10B981",
        danger: "#F43F5E",
        warning: "#F59E0B",
        muted: "#5C5C7A",
      },
      typography: {
        invert: {
          css: {
            "--tw-prose-body": "#EEEEF5",
            "--tw-prose-headings": "#EEEEF5",
            "--tw-prose-bold": "#EEEEF5",
            "--tw-prose-code": "#F59E0B",
            "--tw-prose-links": "#22D3EE",
            "--tw-prose-bullets": "#5C5C7A",
            "--tw-prose-hr": "#1E1E30",
            "--tw-prose-quotes": "#8888A8",
            "--tw-prose-quote-borders": "#2E2E48",
          },
        },
      },
    },
  },
  plugins: [],
};
