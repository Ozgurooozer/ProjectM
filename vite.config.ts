import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = (process.env as Record<string, string>).TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          d3: ["d3"],
          mermaid: ["mermaid"],
          codemirror: [
            "codemirror",
            "@codemirror/lang-markdown",
            "@codemirror/theme-one-dark",
            "@codemirror/view",
            "@codemirror/state",
            "@codemirror/autocomplete",
          ],
        },
      },
    },
  },
});
