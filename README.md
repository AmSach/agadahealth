# agada (अगद) 🍃

built something that should've existed already.

ok so
chemists in india upcharge the fuck out of you and nobody talks about it.

i got overcharged for a basic prescription and it just sat in my head. so i built agada. 

you open it in a browser, snap a photo of any medicine strip, and it tells you:
- if the drug is actually listed in the government's official database
- what the chemical composition actually does in plain, simple english
- cheaper generic equivalents (literally 90% cheaper sometimes)
- if you even need a prescription for it (schedule H/H1/X)

no login. no ads. no tracking. runs offline in your browser.

live here: [agadahealth.vercel.app](https://agadahealth.vercel.app)

---

## how it works under the hood (no corporate speak)

i originally tried running scanner images through standard cloud APIs, but vercel's 10-second timeout killed the connections, and the bills were annoying. so I moved the entire pipeline to the browser.

### 1. the label scanner (ocr + WebAssembly)
when you snap a photo, we clean up the shadows inside a WebAssembly filter (essential because phone photos taken in dark pharmacies are usually garbage) and hand it to a client-side OCR engine. 

### 2. the phonetic guessing engine (IndexedDB + metaphone)
ocr text from curved drug packs is usually scrambled (e.g. reading "Dlo-650" instead of "Dolo-650"). if we searched the database for the exact word, we would find nothing. 
so agada preloads the official CDSCO approved drugs database (300k+ rows) into your browser's IndexedDB. we run a phonetic search using Double Metaphone and BM25 relevance to guess the correct drug even with heavy spelling mistakes.

### 3. blood concentration physics (Bateman ODEs)
to calculate when a drug actually peaks and leaves your bloodstream, we solve a 1-compartment open Bateman differential equation in javascript in real-time. as you slide the dosage and frequency controls, the SVG curve updates immediately.

### 4. private local cabinet (aes-gcm)
your cabinet is yours alone. if you set a 4-digit PIN, we stretch it 100,000 times using PBKDF2 to generate a key, then encrypt your cabinet list using AES-GCM before saving it to localStorage. i don't run a database server. if you forget your PIN, your cabinet is gone. 

### 5. emergency qr codes
you can generate an emergency card for first responders. because complex JSON or emojis crash older scanners in an ambulance, we compile a clean ASCII text block and bake it into a high-error-correction QR code. it's ugly, but it reads on ancient hardware.

### 6. safety overrides (schedule h & poison control)
we check if a drug requires a doctor's prescription or if it's safe to buy over-the-counter. i wrote custom override rules for 70+ commonly misclassified medicines. also, if you scan a household chemical (like bleach or acid), the app blocks the scan, warns you, and shows the national poison control helpline.

---

## the serverless backend endpoints

i built a few serverless proxy endpoints to handle integrations without exposing API keys to the browser:

### 1. `POST /api/scan-stream`
reads the strip image, does the ocr, searches the local database, and pulls generic price estimates. since vercel functions timeout after 10 seconds, this streams updates back using server-sent events (sse) so the frontend doesn't hang.
*   **payload**: `{ "image": "data:image/jpeg;base64,...", "barcodeData": null }`
*   **events streamed**:
    *   `vision`: OCR label processing starting.
    *   `database`: Matching CDSCO drug registry.
    *   `pricing`: Aggregating generic prices.
    *   `complete`: Sends the final compiled medicine JSON card.

### 2. `POST /api/groq`
proxies chat prompts safely to Groq chat completions, handling key rotation and model fallback cascading server-side to prevent keys from leaking.
*   **payload**: `{ "model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": "..."}] }`

### 3. `GET /api/prices`
scrapes apollo, netmeds, and 1mg for real retail pricing of the generic salt so you can see exactly how much you're getting ripped off.

### 4. `GET /api/davaindia`
looks up generic prices from davaindia's catalog so we have live local price baselines.

---

## run it locally

```bash
npm install
npm run dev
```

open `http://localhost:5173/` and you're good.

### automated tests
to run the Playwright verification suite:
```bash
pip install playwright
playwright install chromium
python C:\Users\amans\.gemini\antigravity\brain\247430f8-ea40-419a-8cd2-9c6df175042b\scratch\test_qr_and_security.py
python C:\Users\amans\.gemini\antigravity\brain\247430f8-ea40-419a-8cd2-9c6df175042b\scratch\test_adaptive_cabinet.py
```

---

## data credits & disclaimer
- CDSCO approved drugs database
- BPPI Jan Aushadhi price list
- FDA/NIH dosing sheets
- **disclaimer:** i am a developer, not a doctor. verify with a pharmacist before replacing your pills.
