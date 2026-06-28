# Agada (अगद) 🍃

A quick, offline-first tool to scan medicine strips and find cheap, government-verified generic alternatives in India.

**Live Demo → [agadahealth.vercel.app](https://agadahealth.vercel.app)**

---

## Why did I build this?

I stood at a pharmacy counter and paid ₹380 for a strip of branded pills, only to find out later that the exact same chemical formulation (same active salt, same dosage) was sold by the government's Jan Aushadhi scheme for ₹32. 

In India, branded pharmaceutical markups are insane. The government publishes a registry of identical generics (the PMBJP database), but nobody is going to load a clunky government search portal and copy-paste long chemical salt names while waiting in line at the chemist.

So, I built Agada. You point your phone camera at a medicine strip, it extracts the name, runs phonetic checks against local indices, and tells you exactly what generic version to ask the pharmacist for.

---

## What it actually does under the hood

1. **Local OCR (No Server Uploads)**: Compiles Tesseract to WebAssembly so text recognition runs entirely in your browser. None of your prescription images or medicine photos ever leave your device.
2. **Double Metaphone + BM25 Matching**: Medicine packaging is usually bent, shiny, or smudged, which throws off standard text recognition. To handle this, the app uses a phonetic matching worker to match the blurry text against the CDSCO registry database.
3. **Interactive Bloodstream Tracker**: Plots a concentration curve over a 24-hour timeline using a Bateman differential equation solver in JavaScript. It estimates drug absorption and elimination based on standard half-life rates, age, weight, and body mass.
4. **Offline Cabinet & Bookmarks**: Save scanned pills to an encrypted local database (using browser IndexedDB) for quick refilling and tracking.
5. **No tracking, no signups, no bloat.** Just a simple page that runs instantly in your mobile browser.

---

## How to run it locally

Get a local dev server running in 30 seconds:

```bash
# Clone and install dependencies
npm install

# Run the dev server
npm run dev
```

The app will start at `http://localhost:5173`.

---

## Disclaimer

I am a programmer, not a doctor. This is a helper utility to help you cross-reference drug prices and ask better questions at the chemist counter. Always verify your dosage strength and active ingredients with a certified medical professional or pharmacist before swallowing pills.
