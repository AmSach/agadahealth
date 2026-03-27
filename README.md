# Agada Health — Android APK + Vercel Proxy Setup

## Architecture Overview

```
Android APK (Capacitor WebView)
         │
         │  HTTPS  (no API keys in APK)
         ▼
  Vercel Deployment
  ┌─────────────────────────────────┐
  │  /api/groq      ← Groq proxy   │  ← GROQ_KEY_1..5 stored here (server-side)
  │  /api/davaindia ← Price proxy  │
  │  /*             ← React SPA    │
  └─────────────────────────────────┘
         │
         │  Server-side only
         ▼
    api.groq.com  (keys never leave Vercel)
```

**Key security improvement:** Groq API keys are no longer in the client bundle (`VITE_GROQ_KEY_*`). They now live exclusively in Vercel's server environment as `GROQ_KEY_1..5` and are called via the `/api/groq` proxy.

---

## Step 1 — Set up Vercel environment variables

In your Vercel dashboard → Project → Settings → Environment Variables, add:

| Variable     | Value              | Environment     |
|--------------|--------------------|-----------------|
| `GROQ_KEY_1` | `gsk_xxxxxxxxxxxx` | Production      |
| `GROQ_KEY_2` | `gsk_xxxxxxxxxxxx` | Production      |
| `GROQ_KEY_3` | `gsk_xxxxxxxxxxxx` | Production (optional) |
| `GROQ_KEY_4` | `gsk_xxxxxxxxxxxx` | Production (optional) |
| `GROQ_KEY_5` | `gsk_xxxxxxxxxxxx` | Production (optional) |

> ⚠️ **Remove** any old `VITE_GROQ_KEY_*` variables — they are no longer used and would expose keys in the client bundle.

---

## Step 2 — Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel --prod
```

Note your deployment URL (e.g. `https://agada.vercel.app`).

---

## Step 3 — Build the Android APK

### Prerequisites
- **Node.js 18+** — nodejs.org
- **JDK 17** — adoptium.net
- **Android Studio** — developer.android.com/studio
  - SDK Manager → install Android SDK 34

### Run the builder

```bash
chmod +x build-apk.sh
./build-apk.sh
```

It will ask for your Vercel URL, then automatically:
1. Install npm dependencies (including Capacitor)
2. Build the React app with VITE_API_BASE baked in
3. Initialize the Android project (android/)
4. Sync the web build into the Android WebView
5. Compile and output agada.apk

### Windows (PowerShell)

```powershell
$env:VERCEL_URL = "https://agada.vercel.app"
npm install
echo "VITE_API_BASE=$env:VERCEL_URL" | Out-File .env.production -Encoding utf8
npm run build
npx cap add android
npx cap sync android
cd android
.\gradlew.bat assembleDebug
cd ..
copy android\app\build\outputs\apk\debug\app-debug.apk agada.apk
```

---

## Step 4 — Install the APK

### Option A — Direct transfer
1. Transfer agada.apk to your Android phone
2. Settings → Security → Install Unknown Apps → allow your file manager
3. Tap the APK to install

### Option B — ADB
```bash
adb install agada.apk
```

---

## Local Development

```bash
cp .env.local.example .env.local
# Edit .env.local: VITE_API_BASE=https://agada.vercel.app
npm run dev
```

---

## Files Changed vs Original Repo

```
api/groq.js              NEW  — Vercel serverless Groq proxy (holds keys)
api/davaindia.js         unchanged
src/services/geminiService.js  MODIFIED — calls /api/groq, no client-side keys
capacitor.config.ts      NEW  — Capacitor/Android config
vite.config.js           MODIFIED — base='./' + dev proxy
vercel.json              NEW  — Vercel routing
.env.production          NEW  — VITE_API_BASE URL
.env.local.example       NEW  — local dev template
build-apk.sh             NEW  — one-command APK builder
android-res/network_security_config.xml  NEW — HTTPS-only Android policy
```

---

## Troubleshooting

**"No Groq API keys configured on server"**
→ Add GROQ_KEY_1 (not VITE_GROQ_KEY_1) in Vercel env vars.

**APK shows blank screen**
→ Confirm base: './' is in vite.config.js. Rebuild then re-sync.

**Camera not working**
→ Capacitor WebView supports getUserMedia on Android 7+. Grant camera permission when prompted.

**"INSTALL_FAILED_UPDATE_INCOMPATIBLE"**
→ adb uninstall com.agada.health then reinstall.

**API calls fail in APK**
→ Check your Vercel URL in .env.production has no trailing slash.
