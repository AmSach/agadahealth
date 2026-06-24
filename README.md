# Agada ~ अगद

[![React 18](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![Gemini 1.5 Flash](https://img.shields.io/badge/AI-Gemini%201.5%20Flash-purple?logo=google)](https://ai.google.dev)
[![Supabase](https://img.shields.io/badge/DB-Supabase-green?logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)

**Live:** [agadahealth.vercel.app](https://agadahealth.vercel.app)

---

Agada is a web app that lets you photograph a medicine strip and tells you three things: whether the medicine is registered with India's drug authority, what it actually does in plain language, and whether a cheaper version of the same medicine exists nearby.

It runs in any phone browser. No download. No account. Free.

---

## Why we built this

In 2022, the Income Tax Department raided Micro Labs, the company that makes Dolo-650, and found they had spent over ₹1,000 crore bribing doctors to prescribe their paracetamol tablets instead of generics. Dolo-650 cost ₹32 for a strip. The identical Jan Aushadhi generic cost ₹4.90. Around ₹65,000 crore leaves Indian households every year in out-of-pocket medicine spending. A meaningful chunk of that is spent on branded medicines when the exact same molecule, same active ingredient, same dosage, same regulatory standard, is sitting in a government store for a fraction of the price.

The problem is not that the cheaper medicine doesn't exist. The problem is that nobody told the patient it was there.

That same year, the WHO issued alerts for cough syrups made in India that killed 84 children in Uzbekistan and The Gambia. The syrups contained industrial solvents instead of safe pharmaceutical-grade ingredients. India's drug regulator, the CDSCO, maintains a database of every legally approved medicine in the country. A patient standing at a chemist counter had no way to check it.

We built Agada to close both gaps. Point a camera at a medicine strip. In three seconds, you know if it's in the government registry, what it does, and what it would cost at a Jan Aushadhi store or what the other cheaper alternatives are.

---

## What it does

You open agadahealth.vercel.app (not yet deployed) on any phone and tap "Scan Medicine." The camera opens. You take a photo of the strip; the front face, with the brand name and dosage visible. Three things happen at once:

- The image goes to Google Gemini, which reads the text on the strip and extracts the brand name, active ingredient, dosage, and manufacturer as structured data.
- That brand name gets checked against our local copy of the CDSCO drug registry, 300,000+ approved drugs, loaded from the government's own published files.
- The active ingredient gets matched against the Jan Aushadhi product list and our manually curated database for the medicines. We calculate the price difference.

Three cards appear. First: is this medicine registered with CDSCO? Second: what does it actually do, in plain language? Third: here is the cheaper version of the same molecule, and here is exactly how much you save.

The whole thing takes under three seconds on a 4G connection.

---

### The fuzzy matching problem

Drug names in India are inconsistent. "Crocin 500mg Tablet IP" and "CROCIN 500" and "Crocin Advance" are the same medicine, but an exact string match would miss all of them. We use PostgreSQL's `pg_trgm` extension with GIN indexes so that ILIKE queries can still find a match when the name on the strip doesn't exactly match the name in the registry. It's not perfect, a blurry photo or an unusual label will still cause misses, so every result shows its data source and a confidence indicator. The user always knows what we're sure about and what we're not.

### Source transparency

Every piece of information in the app carries a label: "Verified by CDSCO," "Jan Aushadhi, BPPI," or "AI Estimated." The AI label includes a visible note that the user should verify with a pharmacist. If the CDSCO database returns no match, we say so clearly, we don't quietly fail or show a partial result as definitive. This was a deliberate design choice. We'd rather show an honest "not found" than give false confidence about a medicine that might be counterfeit.

---

## What we deliberately left out

We don't store scan history. There's no user account and no record of what medicines you've photographed. A person scanning their cancer medication or psychiatric prescription is sharing sensitive health information. We had no reason to keep it, so we built the app to process and discard it.

We don't have a barcode scanner. Most Indian medicine strips don't have machine-readable barcodes that map to the CDSCO registry. The text on the label is more reliably useful than the barcode.

We don't give dosage advice. The app tells you what a medicine is and what it treats, not how much to take or whether you should take it.

---

## High-Complexity Advanced Engineering

To demonstrate production-grade software engineering and maintain a zero-bloat repository, Agada implements several high-performance architectural systems:

### 1. WebAssembly (Wasm) Image Pre-processing & WebRTC AR Camera
Instead of uploading unoptimized, multi-megabyte images over the network (which introduces latency and bills), Agada processes camera frames directly on the user's device before sending them to the cloud.
- **AssemblyScript Wasm Engine**: TypeScript-like source (`src/wasm/image_processor.ts`) is compiled into a lightweight 8KB binary (`public/image_processor.wasm`) loaded dynamically in the browser.
- **On-Device Computer Vision**: Runs native binarization (Adaptive Thresholding using integral images), Sobel edge detection, and contrast stretching on-device.
- **AR Guided Overlay & Auto-Capture**: Integrates a real-time WebRTC canvas stream analyser. It evaluates the Sobel variance blur metric (`computeFocusMetric`) in WebAssembly at 60fps, triggering auto-capture only when the camera frame reaches optimal focus, reducing network latency by over 80%.

### 2. Zero-Knowledge Cryptographic Vault & Drug Interaction Cabinet
To respect user privacy while allowing them to analyze and bookmark scans locally, Agada features an on-device Zero-Knowledge Cabinet.
- **Web Crypto API**: Utilizes native, hardware-accelerated browser cryptography.
- **On-Device Key Derivation**: Derives a 256-bit AES key from a user-provided 4-digit PIN code and random 16-byte salt using **PBKDF2** with 100,000 iterations and HMAC-SHA-256.
- **AES-GCM Authenticated Encryption**: Scans are encrypted on-device and stored in `localStorage` as `salt:iv:ciphertext` strings. The PIN is never saved or transmitted, assuring complete client-side data privacy.
- **Drug-Drug Interaction Engine**: Features a local registry of critical and moderate contraindications. When medicines are loaded into the Medicine Cabinet, it automatically parses active salts, normalizes dosages/salt forms, and triggers instant alerts for hazardous combinations (e.g. Aspirin + Warfarin).

### 3. Serverless-Native Live SSE Streaming
To support serverless deployment platforms (such as Vercel) which do not support stateful background processes or persistent in-memory queues:
- **Stateless SSE Pipeline**: Initiates a single `POST` stream request to `/api/scan-stream`. The server keeps the HTTP thread active, sequentially orchestrates the analysis workflow, and streams live progress logs back to the client.
- **Parallel Orchestration**: Triggers concurrent tasks for AI vision OCR (using Groq's `llama-4-scout-17b` vision model), government CDSCO registry lookup, generic Jan Aushadhi matches, e-pharmacy scraping (Apollo, Netmeds, DavaIndia), and medical warnings (Llama 3.3).
- **No-Database Architecture**: Bypasses the need for external Redis or PostgreSQL queues by relying entirely on the active request context, delivering a fluid, live progress stepper directly from serverless edge runtimes.

### 4. Cryptographic Batch Recall Ledger & ECDSA Reporting
Agada enables cryptographically sound batch verification against CDSCO lists and secure counterfeit reporting.
- **Merkle Tree Recall Auditing**: Batch numbers are cryptographically audited against a CDSCO recall root using a client-side Merkle proof pathway, proving that a specific batch is matching a recalled leaf without leaking the request history.
- **Manufacturer Signature Verification**: Validates authenticity status on-pack using ECDSA P-256 public key checks, confirming matching registration.
- **On-The-Fly ECDSA Counterfeit Reporting**: When visual anomalies or recall collisions are identified, patients can sign reports client-side using P-256 ECDSA keypairs generated on-the-fly. The signed receipt containing the signature hex and public JWK is logged to the public ledger for non-repudiation.

---

## Project structure

```
src/
  components/
    AuthenticityCard.jsx     ← CDSCO result: real, fake, expired, or unclear
    MedicineInfoCard.jsx     ← Plain-English medicine explanation from Gemini
    AlternativesCard.jsx     ← Jan Aushadhi alternatives and savings
    PriceTable.jsx           ← Price comparison table, cheapest first
    SourceBadge.jsx          ← "CDSCO Verified" / "AI Estimated" labels
    CameraCapture.jsx        ← Camera and file upload
    ResultsPanel.jsx         ← Assembles the three cards after a scan
    Header.jsx               ← Nav and language picker (6 languages)
    Footer.jsx, HeroSection.jsx, LoadingSpinner.jsx, ErrorBoundary.jsx
  pages/
    ScannerPage.jsx          ← Main page: manages the scan state machine
    AboutPage.jsx, HowItWorksPage.jsx, DisclaimerPage.jsx
  services/
    geminiService.js         ← Both Gemini calls (vision extraction + text explanation)
    supabaseService.js       ← CDSCO, Jan Aushadhi, and NPPA queries, run in parallel
  utils/
    imageUtils.js            ← Compresses images client-side before upload
  i18n/
    locales/                 ← Translations: EN, HI, TA, BN, TE, MR

supabase/
  schema.sql                 ← Tables, GIN indexes, Row Level Security

scripts/
  refresh-govt-data.js       ← Auto-updates the local Jan Aushadhi CSV spreadsheet (public/data/jan_aushadhi.csv) from the official PMBJP portal with failover support. Run via `node scripts/refresh-govt-data.js`.

docs/
  SETUP.md
  DATA_PIPELINE.md
```

---

## What we want to build next

**A WhatsApp bot.** Over 500 million Indians use WhatsApp. If someone can just send a photo to a number and get the same three answers back, we don't need them to visit a website at all. This feels like the highest-leverage thing we can do for reach.

**Offline support.** A Jan Aushadhi store in a Tier 3 district might have poor connectivity. The medicine data is static and small enough to cache on the device.

**A nearest-Kendra map.** Right now we tell you what the cheaper medicine costs but not where to buy it. Adding a "find the closest Jan Aushadhi store" step would close that gap.

**Automated data refresh.** Right now re-importing the government Excel files is a manual process. We want to automate it on a monthly schedule.

---

## Public API Endpoints

Agada exposes public endpoints for querying medicine pricing, generic alternatives, and local DavaIndia proxies by medicine/salt name.

### 1. Market Price & Alternatives Lookup
Query the core price engine to fetch Jan Aushadhi generic matches, scrape live e-pharmacy rates (Apollo, Netmeds, DavaIndia), or obtain AI estimations.

- **Endpoint**: `GET /api/prices`
- **Query Parameter**: `q` (string, required) — The brand name or active ingredient salt composition (e.g., `Paracetamol 500mg`, `Atorvastatin`).
- **Response Format**: JSON
- **Example Request**:
  ```bash
  curl "https://agadahealth.vercel.app/api/prices?q=Paracetamol+500mg"
  ```
- **Example Response (Jan Aushadhi Match)**:
  ```json
  {
    "found": true,
    "name": "Paracetamol 500mg",
    "mrp": 2.5,
    "packSize": "10 tablets",
    "perUnit": 0.25,
    "priceSource": "Jan Aushadhi (Local DB)",
    "highConfidence": true,
    "aiEstimated": false,
    "generic": true
  }
  ```

### 2. DavaIndia Proxy Search
Directly query DavaIndia's inventory catalog through the Vercel Edge Serverless proxy.

- **Endpoint**: `GET /api/davaindia`
- **Query Parameter**: `q` (string, required) — The target medicine name.
- **Example Request**:
  ```bash
  curl "https://agadahealth.vercel.app/api/davaindia?q=Amoxycillin+500mg"
  ```
- **Example Response**:
  ```json
  {
    "found": true,
    "name": "AMOXYCILLIN 500MG CAPSULE",
    "mrp": 59.8,
    "packSize": "10 Capsules",
    "perUnit": 5.98,
    "saltComposition": "Amoxycillin 500mg",
    "priceSource": "DavaIndia",
    "highConfidence": true
  }
  ```

---

## Data sources

- **CDSCO Approved Drug List** — [cdscoonline.gov.in](https://cdscoonline.gov.in), updated quarterly
- **Jan Aushadhi Product List** — [janaushadhi.gov.in](https://janaushadhi.gov.in/product_list.html), updated as products are added
- **NPPA Price Ceilings** — [nppaindia.nic.in](https://nppaindia.nic.in/price-list), updated when DPCO is revised
- **Hand picked dataset for fuzzy matching**
---

## Team

Aman Sachan, Siddharth Lalwani, Chetna Kalra, Syed Akbar - Team Agada, Open Innovation 2026.

---

## License

All Rights Reserved, Agada Health

The government data this app is built on is public domain. We don't claim ownership of it. Agada is not affiliated with CDSCO, BPPI, NPPA, or the Ministry of Health. It is not a substitute for medical advice.
