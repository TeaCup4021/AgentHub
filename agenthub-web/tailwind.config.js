/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: "#f5f5f5",
          hover: "#e8e8e8",
          active: "#dcdcdc",
        },
        chat: {
          bg: "#ffffff",
          bubble: {
            user: "#e8f4fd",
            agent: "#f5f5f5",
          },
        },
      },
    },
  },
  plugins: [],
}

