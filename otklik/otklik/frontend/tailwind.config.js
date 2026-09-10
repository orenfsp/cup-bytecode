/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lilac: {
          50: "#f4f1fb",
          100: "#ebe4f8",
          200: "#d9d0f0",
          300: "#b9b0e4",
          400: "#8f7fe0",
          500: "#6b4fd4",
          600: "#5a41c7",
          700: "#4a35a8",
          800: "#3d2f6b",
          900: "#2f2748",
        },
        cream: {
          50: "#fbf8f3",
          100: "#f6f1e8",
          200: "#efe8d8",
        },
      },
      fontFamily: {
        sans: ["Manrope", "Nunito", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 28px -16px rgba(90, 65, 160, 0.35)",
      },
      borderRadius: {
        "2xl": "1.15rem",
        "3xl": "1.6rem",
      },
      maxWidth: {
        page: "1120px",
      },
    },
  },
  plugins: [],
};
