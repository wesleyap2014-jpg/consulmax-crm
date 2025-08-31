/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        consulmax: {
          primary: "#A11C27",
          secondary: "#1E293F",
          neutral: "#F5F5F5",
          gold: "#E0CE8C"
        }
      },
      borderRadius: {
        '2xl': '1rem'
      }
    }
  },
  plugins: []
}
