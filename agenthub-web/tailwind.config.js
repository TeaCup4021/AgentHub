/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        "primary-active": "var(--color-primary-active)",
        "bg-app": "var(--color-bg-app)",
        "bg-sidebar": "var(--color-bg-sidebar)",
        "bg-chat": "var(--color-bg-chat)",
        "bg-elevated": "var(--color-bg-elevated)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-tertiary": "var(--color-text-tertiary)",
        "border-light": "var(--color-border-light)",
        "border-medium": "var(--color-border-medium)",
        "bubble-user": "var(--color-bubble-user-bg)",
        "bubble-agent": "var(--color-bubble-agent-bg)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
    },
  },
  plugins: [],
};
