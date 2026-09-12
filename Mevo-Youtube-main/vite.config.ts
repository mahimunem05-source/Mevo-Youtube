import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { devYouTubePlugin } from "./scripts/dev-youtube-server.ts";

// Live Lyrics & Dedicated YouTube Dev Server
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    devYouTubePlugin(),
  ],
  server: {
    host: true,
    proxy: {
      "/api/extract": {
        target: "https://mevo-extractor.onrender.com",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});


