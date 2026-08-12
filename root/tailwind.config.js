/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F9F9F7",
        foreground: "#111111",
        muted: "#E5E5E0",
        accent: "#CC0000",
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Times New Roman', 'serif'],
        body: ['"Lora"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'Helvetica Neue', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};