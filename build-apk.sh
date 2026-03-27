#!/bin/bash
# build-apk.sh — Agada Android APK builder
# Run this on your machine (macOS/Linux/WSL) with Android Studio installed.
# Usage: chmod +x build-apk.sh && ./build-apk.sh

set -e

echo "╔══════════════════════════════════════════╗"
echo "║       Agada APK Builder v1.0             ║"
echo "╚══════════════════════════════════════════╝"

# ── 0. Check prerequisites ────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install from nodejs.org"; exit 1; }
command -v java >/dev/null 2>&1 || { echo "❌ Java not found. Install JDK 17 from adoptium.net"; exit 1; }

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current: $(node -v)"
  exit 1
fi

# ── 1. Set your Vercel URL ────────────────────────────────────────────────────
if [ -z "$VERCEL_URL" ]; then
  echo ""
  echo "Enter your Vercel deployment URL (e.g. https://agada.vercel.app):"
  read -r VERCEL_URL
fi

if [[ ! "$VERCEL_URL" == https://* ]]; then
  echo "❌ URL must start with https://"
  exit 1
fi

echo "✅ Using Vercel URL: $VERCEL_URL"

# Write it into the production env so Vite bakes it into the bundle
echo "VITE_API_BASE=$VERCEL_URL" > .env.production
echo "✅ Written .env.production"

# ── 2. Install dependencies ───────────────────────────────────────────────────
echo ""
echo "📦 Installing npm dependencies..."
npm install

# ── 3. Build the web app ──────────────────────────────────────────────────────
echo ""
echo "🔨 Building web app (npm run build)..."
npm run build
echo "✅ dist/ built"

# ── 4. Initialize Capacitor Android project (first run only) ──────────────────
if [ ! -d "android" ]; then
  echo ""
  echo "🤖 Initializing Capacitor Android project..."
  npx cap add android
  echo "✅ android/ project created"
fi

# ── 5. Sync web build into Android project ────────────────────────────────────
echo ""
echo "🔄 Syncing dist/ into android/..."
npx cap sync android
echo "✅ Synced"

# ── 6. Set up Android SDK path if needed ──────────────────────────────────────
ANDROID_DIR="android"
LOCAL_PROPS="$ANDROID_DIR/local.properties"

if [ ! -f "$LOCAL_PROPS" ]; then
  # Try to find Android SDK automatically
  if [ -d "$HOME/Library/Android/sdk" ]; then
    SDK_PATH="$HOME/Library/Android/sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    SDK_PATH="$HOME/Android/Sdk"
  elif [ -n "$ANDROID_HOME" ]; then
    SDK_PATH="$ANDROID_HOME"
  else
    echo ""
    echo "Enter your Android SDK path (e.g. /Users/you/Library/Android/sdk):"
    read -r SDK_PATH
  fi
  echo "sdk.dir=$SDK_PATH" > "$LOCAL_PROPS"
  echo "✅ local.properties written: sdk.dir=$SDK_PATH"
fi

# ── 7. Build the APK ──────────────────────────────────────────────────────────
echo ""
echo "🏗️  Building debug APK..."
cd android
./gradlew assembleDebug --no-daemon -q
cd ..

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
  cp "$APK_PATH" "agada.apk"
  APK_SIZE=$(du -sh agada.apk | cut -f1)
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║   ✅ agada.apk built successfully!       ║"
  echo "║   Size: $APK_SIZE                            ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "📱 To install on your phone:"
  echo "   1. Enable 'Install from Unknown Sources' in Android Settings"
  echo "   2. Transfer agada.apk to your phone"
  echo "   3. Tap it to install"
  echo ""
  echo "   Or via ADB: adb install agada.apk"
else
  echo "❌ APK not found at $APK_PATH"
  echo "   Check android/app/build/outputs/ for the output file"
  exit 1
fi
