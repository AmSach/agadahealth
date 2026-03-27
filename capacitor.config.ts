import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agada.health',
  appName: 'Agada',
  webDir: 'dist',
  // The Android WebView will load from the built dist/ folder.
  // All API calls go to your Vercel URL via VITE_API_BASE (set in .env.production).
  server: {
    // Uncomment for live-reload during development (replace with your Vercel URL):
    // url: 'https://your-app.vercel.app',
    // cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      // Request camera permissions on first use
    },
  },
  android: {
    minSdkVersion: 24,
    targetSdkVersion: 34,
    buildToolsVersion: '34.0.0',
    allowMixedContent: false,
    // Network security: only allow HTTPS
    useLegacyBridge: false,
  },
};

export default config;
