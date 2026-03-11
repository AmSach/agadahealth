# Agada — अगद

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
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

## How we built it

### The core realisation

India's government has already done most of the hard work here. The CDSCO publishes its full approved drug list as a downloadable Excel file. The Jan Aushadhi scheme publishes its product list and prices. The NPPA publishes legally mandated price ceilings for essential medicines. None of it is secret, and all of it is updated regularly. We obtained the official copies from the government's own initiative with the Right To Information Act.

What doesn't exist is a consumer-facing interface to any of it.

We took those three independent databases, cleaned them, and loaded them into a PostgreSQL database on Supabase. When you scan a medicine, we're not calling a government API, we're querying our own pre-loaded copy of the government's data. We did this because government APIs in India are unreliable, undocumented for public use, and not designed for someone scanning medicine strips in real time. Pre-loading means zero-latency queries and no dependency on whether a government server is up.

### Why these tools

**React 18 + Vite**: We needed this to work as a zero-download web app on any Android or iOS phone browser. React handles the scan flow state (idle → processing → results → reset). Vite keeps the bundle small enough to load fast on a slow connection. Android application on the works.

**Google Gemini 1.5 Flash**: Reading text off a medicine strip is harder than it sounds. Strips are shiny, the text is small, the angles vary, and brand names are often printed in multiple fonts on the same label. And we added our own compression algorithm on the images  to compress them in under 100kbs to reduce latency. Gemini Vision was the only approach that consistently returned structured JSON; brand name, salt, dosage, manufacturer; from a casual phone photo. We use Flash rather than Pro because it responds in about 1.5 seconds versus 4+ for Pro, and on this specific task — extracting text fields from a label, the accuracy difference is small enough not to matter.

**Supabase**: Free tier handles all three tables at our data volumes. It generates a REST API automatically, so the React app can query the database directly without us running a backend server. Row Level Security restricts the public API key to read-only, so there's no way for a user to modify the government data.

**Vercel**: One command to deploy. HTTPS by default, which matters because the browser camera API only works on secure origins. Mobile browsers will block camera access on plain HTTP.

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
  seed-database.js           ← Sample data for testing
  refresh-govt-data.js       ← Monthly data refresh helper

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
