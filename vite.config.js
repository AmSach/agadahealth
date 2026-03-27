import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base: './' is REQUIRED for Capacitor Android WebView (file:// assets)
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Local dev: proxy /api/* to your Vercel URL so keys stay server-side
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
