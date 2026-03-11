import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          gemini: ['@google/generative-ai'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
  // PWA-ready: service worker support via vite-plugin-pwa (Phase 2)
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
})
