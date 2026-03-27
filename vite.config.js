import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base: './' is required for Capacitor's Android WebView to load assets
  // from the local filesystem correctly (file:// protocol)
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Dev proxy: forward /api/* to your Vercel preview URL during local dev
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
