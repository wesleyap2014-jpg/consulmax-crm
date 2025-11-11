// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Garante caminhos absolutos corretos no Vercel e local
  base: "/",

  plugins: [
    react({
      // habilita fast refresh estável
      jsxRuntime: "automatic",
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  // Evita que libs herdadas que esperam "process.env" quebrem no browser
  define: {
    "process.env": {},
  },

  server: {
    host: true,       // acessível na rede local
    port: 5173,       // padrão do Vite
    strictPort: true, // evita variar porta (bom para envs com proxy)
  },

  // preview local do build
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true, // útil para depurar “tela branca” em produção
  },

  // Otimizações (geralmente o Vite acerta, mas deixo explícito)
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "lucide-react"],
  },
});
