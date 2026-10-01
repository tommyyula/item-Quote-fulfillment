import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// base "./" so the build also works from GitHub Pages sub-paths or a file share
export default defineConfig({
  base: "./",
  plugins: [vue()],
  // own port (5173 is used by another local project); strictPort = fail instead of silently sharing a port
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 }, // exceljs chunk is lazy-loaded on export
  test: { environment: "node" },
});
