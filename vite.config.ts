import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The frontend lives in web/ and builds to web/dist, which the Express
// server serves in production. In dev, Vite runs on 5173 and proxies the
// API to the Express server on 4242.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4242",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
