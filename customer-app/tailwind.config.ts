import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        oasis: {
          ink: "#0C1F1A",
          deep: "#143D32",
          moss: "#1F6B56",
          mist: "#E8F2EE",
          sand: "#F6F1E8",
          gold: "#C4A35A",
          coral: "#E07A5F",
          line: "#D5E3DC",
          mute: "#5C726A",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 18px 40px rgba(12, 31, 26, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
