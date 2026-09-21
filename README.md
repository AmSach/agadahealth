# 💊 AGADA: AI MEDICINE STRIP SCANNER & GENERIC ALTERNATIVE FINDER

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo: Vercel](https://img.shields.io/badge/Live%20App-agadahealth.vercel.app-brightgreen.svg)](https://agadahealth.vercel.app)
[![Tech: React + Vite + Tailwind](https://img.shields.io/badge/Stack-React%20%7C%20Vite%20%7C%20Tailwind-blue.svg)]()
[![OCR: Tesseract WASM](https://img.shields.io/badge/OCR-100%25%20In--Browser%20WASM-orange.svg)]()
[![Privacy: Zero Server Uploads](https://img.shields.io/badge/Privacy-Zero%20Data%20Leaves%20Device-green.svg)]()

> *"Why pay ₹180 for a branded blister pack when the identical bioequivalent chemical salt costs ₹30? Scan any medicine strip in 3 seconds and reveal the government-certified Jan Aushadhi generic equivalent."*

**Agada** is an open-source, privacy-first progressive web application designed to break pharma monopoly markups in India. Powered by **in-browser WebAssembly OCR**, **phonetic fuzzy search (Double Metaphone + BM25)**, and **real-time pharmacokinetic curve modeling**, Agada empowers patients at the pharmacy counter.

---

## ⚡ The Price Disparity Reality

| Branded Formulation | Typical Retail Price | Jan Aushadhi Generic Salt Equivalent | Patient Savings |
| :--- | :---: | :---: | :---: |
| **Augmentin 625 Duo** | ₹205.00 | **Amoxycillin + Pot. Clavulanate (₹55.00)** | **73% OFF** |
| **Telma 40** (Telmisartan) | ₹145.00 | **Telmisartan 40mg (₹18.00)** | **88% OFF** |
| **Pan-D** (Pantoprazole + Domp) | ₹195.00 | **Pantoprazole + Domperidone (₹32.00)** | **84% OFF** |
| **Rosuvas 10** (Rosuvastatin) | ₹240.00 | **Rosuvastatin 10mg (₹35.00)** | **85% OFF** |

---

## 🔬 How It Works

```
        [ Photograph Medicine Strip with Smartphone Camera ]
                                 │
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │        IN-BROWSER WASM OCR ENGINE               │
        │   (Tesseract.js WebAssembly • Zero Cloud Upload)│
        └────────────────────────┬────────────────────────┘
                                 │ Raw Extracted Text
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │      PHONETIC & FUZZY SALT RESOLVER             │
        │   (Double Metaphone • BM25 • Levenshtein Distance)
        └────────────────────────┬────────────────────────┘
                                 │ Matched Active Ingredients
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │      NATIONAL JAN AUSHADHI REGISTRY INDEX       │
        │   (IndexedDB Cache • Instant Offline Querying)  │
        └────────────────────────┬────────────────────────┘
                                 │
        ┌────────────────────────┴────────────────────────┐
        ▼                                                 ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│     GENERIC EQUIVALENTS       │         │   BATEMAN PK CURVE MODEL      │
│ • Government PMBJP Price      │         │ • Plasma Concentration Graph  │
│ • Nearest Jan Aushadhi Stores │         │ • Absorption & Elimination T½ │
└───────────────────────────────┘         └───────────────────────────────┘
```

---

## 🌟 Key Features

### 1. 100% In-Browser Privacy (WASM OCR)
Zero photos are uploaded to external cloud servers. All optical character recognition is executed locally via Tesseract compiled to WebAssembly.

### 2. Blurry Label Fault-Tolerant Matching
Curved, crinkled, and metallic foil blister packs frequently yield garbled OCR strings. Agada runs a dedicated background Web Worker utilizing **Double Metaphone phonetic transforms** and **BM25 token ranking** to map noisy text back to active pharmaceutical ingredients (APIs).

### 3. Integrated Bateman Pharmacokinetic (PK) Curves
Simulates the drug's oral absorption and metabolic clearance kinetics in JavaScript using the two-compartment Bateman equation, showing peak concentration ($C_{max}$) and biological half-life ($t_{1/2}$).

### 4. Offline First with IndexedDB
The entire Jan Aushadhi generic medicines registry is cached directly in your browser's IndexedDB, enabling instantaneous lookups even inside hospital basements with zero cellular reception.

---

## 🚀 Development Setup

```bash
# Clone the repository
git clone https://github.com/AmSach/agadahealth.git
cd agadahealth

# Install dependencies
npm install

# Start local Vite development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🛡️ Medical & Legal Disclaimer
Agada is an informational and educational tool designed to surface publicly registered generic equivalents under the Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP). Always consult a licensed medical doctor or certified pharmacist before modifying prescriptions or dosage regimens.

---

## 📄 License
Released under the **MIT License**. Crafted with care by [AmSach](https://github.com/AmSach).
