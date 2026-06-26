/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#C9A84C",
        "gold-light": "#E8C97A",
        dark: "#141820",
        sidebar: "#0f1218",
        card: "#1C2333",
        border: "#2a3347",
      },
    },
  },
  plugins: [],
}