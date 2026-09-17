import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "rgb(var(--surface-base) / <alpha-value>)",
          card: "rgb(var(--surface-card) / <alpha-value>)",
          sunken: "rgb(var(--surface-sunken) / <alpha-value>)",
        },
        ink: {
          primary: "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          muted: "rgb(var(--text-muted) / <alpha-value>)",
        },
        line: "rgb(var(--border) / <alpha-value>)",
        good: "rgb(var(--status-good) / <alpha-value>)",
        warn: "rgb(var(--status-warning) / <alpha-value>)",
        bad: "rgb(var(--status-critical) / <alpha-value>)",
        accent: "rgb(var(--series-1) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { card: "14px" },
    },
  },
  plugins: [],
} satisfies Config;
