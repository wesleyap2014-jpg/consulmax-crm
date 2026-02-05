// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "/",

  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  define: {
    // Evita quebrar libs que esperam process/env/global
    "process.env": {},
    global: "globalThis",
  },

  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },

  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,

    // Ajuda cache busting (Vite já faz hash, mas deixo explícito)
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },

  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "lucide-react"],
  },
});
