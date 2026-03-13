import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Don't let Vite touch the api/ directory — Vercel handles it separately
    rollupOptions: {
      external: [],
    }
  }
})
