import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: {input: {main:path.resolve(__dirname,'index.html'), admin:path.resolve(__dirname,'admin.html')}} },
  server: { proxy: { '/api': 'http://localhost:10000' } }
})
