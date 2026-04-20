import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import Inspect from "vite-plugin-inspect";

const host = (process.env as Record<string, string>).TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle analyzer — build sonrası dist/stats.html oluşturur
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    // Dev'de plugin transform'larını incele: http://localhost:1420/__inspect/
    ...(process.env.VITE_INSPECT ? [Inspect()] : []),
  ],

  clearScreen: false,

  assetsInclude: ['**/*.onnx'],

  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },

  worker: {
    format: 'es',
  },

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
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          transformers: ['@huggingface/transformers'],
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
