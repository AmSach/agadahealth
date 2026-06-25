# Agada (अगद) 🍃

Hello there, explorer! Welcome to **Agada**.

I built Agada because medicine pricing and transparency in India can be incredibly confusing. A branded pill might cost ₹30, while the exact same generic chemical compound is sitting in a government-subsidized *Jan Aushadhi Kendra* store down the road for ₹4. But doctors write prescriptions in ancient hieroglyphics, pharmacies hide the generic boxes behind the counter, and the government's official drug list is a massive, unsearchable spreadsheet.

So, I brewed a giant pot of chamomile tea, fired up my editor, and wrote this. It is a completely free, offline-first medicine scanner that fits right in your pocket. It helps you scan a medicine strip, check if you're paying too much, understand what the chemicals actually do in plain English, and track your cabinet without sending a single byte of your health data to some remote cloud server.

👉 **Live Link:** [agadahealth.vercel.app](https://agadahealth.vercel.app)

---

## 🌿 The Grand Tour of Agada's Systems

Here is a friendly, deep look into how the engineering actually works under the hood:

### 1. 📸 The Offline Label Scanner (Vision OCR & WebAssembly)
When you snap a photo of a medicine strip, Agada cleans it up completely on your device. We compile custom image filters (like adaptive thresholding and contrast stretching) to a tiny **WebAssembly** binary. This pre-processes the camera frame to remove glare and shadow before Tesseract.js extracts the raw text. Your photos are never uploaded to any server.

### 2. 🔍 The Phonetic Guessing Engine (BM25 + Double Metaphone in IndexedDB)
OCR text from curved, metallic pill strips is usually garbled (reading "Krocin" or "Crocn-500" instead of "Crocin"). If we searched a database for the exact word, we would find nothing. 

To solve this, Agada preloads a local copy of the official CDSCO drug registry (over 300,000 approved drugs!) into your browser's **IndexedDB** on first load. When you scan, we search this database using a **Double Metaphone** algorithm (which index words by how they *sound*) combined with **BM25 text relevance**. The app guesses the closest matching chemical composition even with heavy typos.

### 3. 🩸 The Active Bloodstream Simulator (Bateman ODEs)
Ever wonder when a pill actually peaks in your body or leaves your system? We solve a classic pharmacokinetic differential equation (the **1-compartment open Bateman model**) in real-time. As you slide the dosage strength and frequency controls, the math recalculates instantly and plots your concentration curve in a responsive SVG line chart.

### 4. 🔒 The Secret Cabinet (Zero-Knowledge AES Cryptography)
Your medication list and health history should be yours alone. If you choose to set a 4-digit PIN, we stretch it 100,000 times using **PBKDF2** to derive a strong cryptographic key. We then encrypt your saved medicine cabinet records locally using **AES-GCM** before writing them to the browser cache. Because I don't run database servers, I don't know your PIN and have no way to reset it. If you forget it, the records stay scrambled forever!

### 5. 🚨 First Responder QR Cards
You can generate a card for emergency personnel. Because complex JSON schemas or modern emojis can crash older barcode readers in an ambulance, we format your allergies, blood group, and emergency contact into a clean, old-school **ASCII text block** and bake it into a high-error-correction QR code. Any responder can scan it, even on ancient hardware.

### 6. 🌿 Safety Guards (Schedule H & Poison Controls)
Agada cross-references scanned drugs against standard pharmaceutical schedules to alert you if a medicine requires a doctor's prescription (Schedule H, H1, or X in India) or if it's safe to buy over-the-counter (OTC). We also look up your age and weight to display a warning if your daily logged dosage exceeds weight-adjusted safety limits. 

Additionally, if you accidentally scan a household chemical (like bleach, pesticide, or acid), the app immediately blocks the results, alerts you, and displays the national poison control helpline.

---

## 🔌 Serverless API Documentation

Agada includes a set of secure, serverless proxy endpoints that handle integrations without exposing API keys to client browsers:

### 1. `POST /api/scan-stream`
This endpoint processes scanned strips or prescriptions. It performs local database matching and online retail drug price aggregation, streaming events back via **Server-Sent Events (SSE)**.
*   **Request Payload**: 
    ```json
    {
      "image": "data:image/jpeg;base64,...",
      "barcodeData": null
    }
    ```
*   **SSE Event Sequence**:
    *   `vision`: Image thresholding and Tesseract OCR processing.
    *   `database`: Matching extracted text against the CDSCO approved drugs database in IndexDB.
    *   `pricing`: Scraping discounted generic and brand prices.
    *   `complete`: Emits the compiled medicine info card object.

### 2. `POST /api/groq`
A secure completion proxy. It intercepts standard OpenAI chat requests and forwards them to Groq using a server-side key rotation pool (safeguarding your keys).
*   **Request Payload**:
    ```json
    {
      "model": "llama-3.3-70b-versatile",
      "messages": [{ "role": "user", "content": "Explain Paracetamol..." }]
    }
    ```

### 3. `GET /api/prices`
Searches online pharmacy listings (Apollo, Netmeds, 1mg) for alternative branded and generic price mappings based on matching active ingredients.

### 4. `GET /api/davaindia`
Looks up discounted generic medicine items directly from DavaIndia's inventory lists.

---

## 🌱 Run it locally

To play with the code on your own machine:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser and you're ready to scan!

### Running the verification tests
If you want to run the Playwright automated test suites locally:
```bash
pip install playwright
playwright install chromium
python C:\Users\amans\.gemini\antigravity\brain\247430f8-ea40-419a-8cd2-9c6df175042b\scratch\test_qr_and_security.py
python C:\Users\amans\.gemini\antigravity\brain\247430f8-ea40-419a-8cd2-9c6df175042b\scratch\test_adaptive_cabinet.py
```

---

## 🍂 Data Credits & Disclaimer
- Indian Central Drugs Standard Control Organisation (CDSCO) drug registry.
- Jan Aushadhi Kendras price list (BPPI).
- Dosing variables calibrated from public FDA/NIH pharmacology sheets.
- **Disclaimer:** I am a developer, not a doctor or pharmacist. Always verify medication changes with a licensed medical professional. Let's make healthcare transparent!
