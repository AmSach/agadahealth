# अगद | Agada — Know Your Medicine. Pay What It's Worth.

> **"The government built the data. We built the door."**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built with React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![Powered by Gemini](https://img.shields.io/badge/AI-Gemini%201.5%20Flash-purple?logo=google)](https://ai.google.dev)
[![Supabase](https://img.shields.io/badge/DB-Supabase-green?logo=supabase)](https://supabase.com)
[![Deployed on Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)

**[▶ Live Demo](https://agadahealth.vercel.app)** | **[📄 Full Intelligence Document](docs/INTELLIGENCE_DOCUMENT.md)**

---

## What is Agada?

Agada is a mobile-first web application that allows **any Indian citizen** to photograph a medicine strip and instantly receive **three critical answers**:

| # | Question | Source | Time |
|---|----------|--------|------|
| 1 | **Is this medicine real or counterfeit?** | CDSCO Government Registry | Real-time |
| 2 | **What does this medicine do?** | Google Gemini AI | ~1.5s |
| 3 | **Are you overpaying for it?** | Jan Aushadhi / NPPA | Real-time |

**One photo. Three seconds. Zero cost to the patient. No app download. No login.**

---

## The Problem

India loses **₹16,000 crore annually** to counterfeit medicines. Meanwhile:

- **72%** of Indians have never heard of Jan Aushadhi generics (CSE Survey 2023)
- **91% savings** are available through government generics — but patients don't know
- **No consumer tool** exists to verify medicines against the CDSCO registry at point of purchase
- Crocin costs ₹30. The identical generic in Jan Aushadhi costs ₹2.50. **Most patients don't know.**

Sunita from Kanpur paid ₹4,800 for a medicine available for ₹210. This is the story of 1.4 billion Indians. Not because the system failed — because no one built the door.

**Agada is the door.**

---

## The Solution

```
User opens agadahealth.vercel.app on any phone browser
    ↓
User taps "Scan Medicine" → camera opens
    ↓
User photographs medicine strip → 3 parallel API calls
    ↓
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  CALL A: CDSCO  │   │  CALL B: GEMINI  │   │ CALL C: JAN AUS │
│  Fuzzy match    │   │  Structured JSON │   │ Salt match.     │
│  Returns verdict│   │  Returns info,  │   │ Ranked by price.│
│  Badge: CDSCO   │   │  warnings, OTC  │   │ Savings shown.  │
└─────────────────┘   └─────────────────┘   └─────────────────┘
    ↓
Three result cards rendered simultaneously — total time: <3 seconds
```

---

## Why Agada Wins

| Feature | **Agada** | MedPlus / PharmEasy | CDSCO Website | Jan Aushadhi App |
|---------|-----------|--------------------|--------------|-----------------| 
| CDSCO registry check | ✅ Always first | ❌ No | ✅ But unusable | ❌ No |
| Fake medicine detection | ✅ Real-time scan | ❌ No | ❌ No interface | ❌ No |
| Jan Aushadhi alternatives | ✅ Auto-surfaced | ❌ Sells branded only | ❌ No | ✅ |
| Price savings shown | ✅ Exact rupees | ❌ Hides generics | ❌ No | ✅ Partial |
| No download needed | ✅ Browser only | ❌ App required | ✅ | ❌ App required |
| 6 Indian languages | ✅ EN/HI/TA/BN/TE/MR | ❌ English only | ❌ | ❌ Hindi only |
| Cost to patient | ✅ **FREE forever** | ❌ Commission-based | ✅ | ✅ |
| Works offline | 🔄 Phase 2 (PWA) | ❌ | ❌ | ❌ |

**The core competitive advantage:** MedPlus and PharmEasy *cannot* copy Agada. Their business models require showing paid placements. Putting Jan Aushadhi first would destroy their unit economics. Agada has no such conflict — no revenue model that competes with the patient's interest.

---

## Tech Stack

### Frontend
- **React 18** + **Vite 5** — Zero-download PWA. Camera API. Works on any phone browser.
- **Tailwind CSS** — Utility-first styling, mobile-optimised
- **React Router** — Client-side routing
- **i18next** — 6 Indian languages (EN/HI/TA/BN/TE/MR)

### AI
- **Google Gemini 1.5 Flash** — Vision model reads medicine strip photos, extracts structured JSON
  - Why Flash over Pro: lower latency (1.5–2.5s vs 3–5s), sufficient accuracy, higher free-tier limits

### Database
- **Supabase (PostgreSQL)** — Pre-loaded government data tables
  - `pg_trgm` extension for fuzzy medicine name matching
  - GIN indexes for fast ILIKE queries on 100,000+ drug records
  - Row Level Security: anon key is SELECT-only

### Government Data Sources
| Table | Source | Records |
|-------|--------|---------|
| `cdsco_drugs` | CDSCO Approved Drug Registry (cdsco.gov.in) | ~100,000+ |
| `jan_aushadhi_generics` | BPPI Jan Aushadhi Product List (janaushadhi.gov.in) | 1,900+ |
| `nppa_prices` | NPPA DPCO 2013 Price Ceilings (nppaindia.nic.in) | 800+ |

### Deployment
- **Vercel** — Static hosting, global CDN, zero-config React deployment

---

## Architecture

```
[User's Phone Browser — any phone, any browser]
     |
     | HTTPS · Vercel CDN
     |
[React App — agadahealth.vercel.app]
     |
     |── Base64 image ──────────→ [Gemini Vision API]
     |                                    ↓
     |                          JSON {brandName, salt, dosage, manufacturer}
     |                                    ↓
     |                          [Gemini Text API] → Plain English explanation
     |
     |── brand query ────────────→ [Supabase PostgreSQL]
     |                                 |── cdsco_drugs (authenticity)
     |── salt query ─────────────→    |── jan_aushadhi_generics (alternatives)
     |                                 |── nppa_prices (price ceiling)
     |
[Three Result Cards — rendered in browser · <3 seconds total]
```

**Privacy by architecture:** Agada has no application server. It is a static site. Medicine photos are processed by Gemini's API and never stored. There is no user database, no scan history, no analytics tracking individuals.

---

## Project Structure

```
agada/
├── src/
│   ├── components/
│   │   ├── AuthenticityCard.jsx   ← CDSCO real/fake verdict
│   │   ├── MedicineInfoCard.jsx   ← AI medicine explanation
│   │   ├── AlternativesCard.jsx   ← Jan Aushadhi savings
│   │   ├── PriceTable.jsx         ← Price comparison table
│   │   ├── SourceBadge.jsx        ← "CDSCO Verified" / "AI Estimated" badges
│   │   ├── CameraCapture.jsx      ← Camera/upload UI
│   │   ├── ResultsPanel.jsx       ← Orchestrates three cards
│   │   ├── Header.jsx             ← Nav + language picker
│   │   ├── Footer.jsx
│   │   ├── HeroSection.jsx
│   │   ├── LoadingSpinner.jsx
│   │   └── ErrorBoundary.jsx
│   ├── pages/
│   │   ├── ScannerPage.jsx        ← Main page, state machine
│   │   ├── AboutPage.jsx
│   │   ├── HowItWorksPage.jsx
│   │   └── DisclaimerPage.jsx
│   ├── services/
│   │   ├── geminiService.js       ← All Gemini API calls + prompts
│   │   └── supabaseService.js     ← All DB queries (CDSCO, JA, NPPA)
│   ├── utils/
│   │   └── imageUtils.js          ← Client-side image compression
│   ├── i18n/
│   │   ├── config.js              ← i18next setup
│   │   └── locales/               ← EN, HI, TA, BN, TE, MR
│   └── styles/
│       └── globals.css
├── supabase/
│   └── schema.sql                 ← Complete DB schema + RLS + indexes
├── scripts/
│   ├── seed-database.js           ← Sample data for testing
│   └── refresh-govt-data.js       ← Monthly data refresh automation
├── docs/
│   ├── SETUP.md                   ← Step-by-step setup guide
│   ├── DATA_PIPELINE.md           ← How to import government Excel files
│   └── INTELLIGENCE_DOCUMENT.md   ← Full technical + policy document
├── public/
│   └── manifest.json              ← PWA manifest
├── .env.example                   ← Environment variable template
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free tier is sufficient)

### 1. Clone and install

```bash
git clone https://github.com/agada-health/agada.git
cd agada
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
# Edit .env.local and add your keys
```

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Set up the database

1. In your Supabase dashboard, go to **SQL Editor**
2. Paste and run the contents of `supabase/schema.sql`
3. Seed test data: `npm run db:seed`

For full government data import, see [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md).

### 4. Run locally

```bash
npm run dev
# Open http://localhost:5173
```

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel
# Follow prompts. Add all VITE_ environment variables when asked.
```

---

## Data Pipeline

All government data is downloaded from official portals, cleaned, and loaded into Supabase:

```
1. Download CDSCO Excel → cdsco.gov.in/opencms/opencms/en/Drugs/
2. Download Jan Aushadhi product list → janaushadhi.gov.in/product_list.html  
3. Download NPPA prices → nppaindia.nic.in/price-list
4. Clean + standardise columns (see docs/DATA_PIPELINE.md)
5. Import via Supabase Dashboard → Table Editor → Import CSV
6. Run GIN indexes (already in schema.sql)
7. Test with: SELECT COUNT(*) FROM cdsco_drugs;
```

**Why no live government API calls?** Government APIs in India are unreliable, inconsistently documented, and not designed for consumer-scale queries. Pre-loading ensures zero-latency data access, 100% availability, and predictable performance.

---

## Security

- **Supabase anon key:** Safe to expose in frontend. RLS restricts to SELECT-only.
- **Gemini API key:** Rate-limit to 100 requests/day in Google AI Studio for public launch.
- **No user data stored:** No login, no scan history, no analytics tracking.
- **Privacy-first:** Images processed by Gemini and immediately discarded.
- **No write keys** in any frontend build. Ever.

---

## Roadmap

### Phase 1 — MVP (March 2026) ✅ Current
- Camera scan + photo upload
- Gemini Vision medicine extraction
- CDSCO authenticity verification
- Plain-English medicine explanation
- Jan Aushadhi cheaper alternatives
- NPPA ceiling price comparison
- Source badges on every result
- Privacy-first: no accounts, no storage

### Phase 2 — Reach (Q2–Q3 2026)
- WhatsApp Bot (500M+ Indian WhatsApp users)
- 8 additional regional languages
- Voice input for visually impaired users
- Automated monthly government data refresh
- Nearest Jan Aushadhi Kendra map
- Progressive Web App (PWA) for homescreen install

### Phase 3 — Platform (Q3–Q4 2026)
- State health ministry API integration
- AI drug interaction checker
- ASHA worker field toolkit (offline-capable)
- B2G licensing model
- Academic research API

---

## The Team

**Team Agada** — Open Innovation 2026 | India Innovates

- **Aman Sachan**
- **Siddharth Lalwani**
- **Chetna Kalra**
- **Syed Akbar**

---

## References

1. CDSCO Drug Registry — [cdscoonline.gov.in](https://cdscoonline.gov.in)
2. Jan Aushadhi Product List — [janaushadhi.gov.in](https://janaushadhi.gov.in/product_list.html)
3. NPPA Price Ceiling Data — [nppaindia.nic.in](https://nppaindia.nic.in/price-list)
4. WHO Medical Product Alert N°5/2022 — Maiden Pharmaceuticals, Gambia deaths
5. WHO Medical Product Alert N°6/2022 — Marion Biotech, Uzbekistan deaths
6. CSE Jan Aushadhi Awareness Survey 2023
7. National Health Accounts India 2021
8. Google Gemini Vision API — [ai.google.dev](https://ai.google.dev)
9. Supabase Documentation — [supabase.com/docs](https://supabase.com/docs)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

The government built the data. We built the door.

---

*"Her name was Sunita. A school teacher from Kanpur. Diagnosed with cancer. She paid ₹4,800 for a medicine available at ₹210. This is the story of 1.4 billion Indians. Agada is the door."*
