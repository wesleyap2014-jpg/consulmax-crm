// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'), // permite importar com "@/..."
    },
  },
  build: {
    outDir: 'dist', // saída padrão do build
  },
})
