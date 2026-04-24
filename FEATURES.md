# AGADA — Product Feature Report

## What is Agada?

**Agada** (Sanskrit: आगद — antidote/medicine) is a free public service launched at **India Innovates 2026**. It helps everyday Indians verify any medicine in seconds — whether it's genuine, what it does, and whether they're paying too much.

**Live at:** https://agadahealth.vercel.app
**Built by:** Team Agada | **Beta access:** Free, no login required

---

## Core Features

### 1. 📷 Medicine Strip Scanner
Photograph any medicine strip, box, bottle, or label to extract:
- Brand name (e.g. Crocin, Dolo-650, Metformin)
- Salt composition (e.g. Paracetamol 500mg)
- Dosage strength (e.g. 500mg, 10mg/5ml)
- Manufacturer name
- MRP / price
- Batch number & expiry date

**Works on:** Front of pack, back of pack, side panel, torn strips, blurry photos.

**Confidence score** is returned so users know when to verify with a pharmacist.

---

### 2. 📝 Prescription Scanner (Handwriting Reading)
Photograph a doctor's prescription to extract:
- Doctor's name and clinic
- Patient name
- Date of prescription
- **Each medicine** with:
  - Full drug name + strength
  - Dosage (e.g. "1 tablet", "5ml")
  - Frequency (e.g. "1-0-1", "OD", "BD", "TDS")
  - Duration (e.g. "5 days", "2 weeks")
  - Instructions (e.g. "after food", "before food")

**Abbreviation inference:** 1-0-1 → Morning & Night, BD → Twice a day, OD → Once a day, TDS → Three times a day, PC → After food, AC → Before food.

✅ **Tested — works on simulated handwriting at 90% confidence** (see test below).

---

### 3. 🔒 Authenticity Verification
Flags potential counterfeit indicators:
- **Genuine signals detected:** hologram, QR/barcode, govt MRP sticker, tamper seal, batch no., expiry, full address+PIN, licence no.
- **Fake signals detected:** pixelated text on clear image, font mismatch, missing MRP/batch/expiry on intact label
- **Expired medicines:** Auto-detected from expiry date
- **CDSCO badge:** Checks if the salt is in the CDSCO approved drug registry

---

### 4. 💸 Jan Aushadhi Generic Alternatives
Shows **government-subsidised Jan Aushadhi generic equivalents** with live prices from official BPPI database. Displays savings per tablet vs. the branded version scanned.

- Up to 20% cheaper generics at ~₹2.50/tablet for common medicines
- "Where to find" guidance with official Jan Aushadhi Kendra locator
- **DavaIndia live price enrichment** for real market prices on alternatives

---

### 5. 💊 AI-Brand Generics Comparison
Shows up to 3 branded generic alternatives with:
- Manufacturer name
- Per-tablet cost
- Live DavaIndia prices where available
- Pharmacy deep links (Netmeds, Apollo, 1mg, DavaIndia)
- All from **different manufacturers** (no duplicate brands)

---

### 6. 💰 Price Intelligence
- Jan Aushadhi BPPI official price database (embedded, always available)
- DavaIndia live prices via API
- Local Jan Aushadhi lookup for 1,000+ commonly tracked medicines
- **AI fallback** with strict no-hallucination prompt for unlisted medicines

---

### 7. 📋 Medicine Information
For each scanned medicine:
- **Plain-language description** of what it does (in simple English)
- **Common uses** (3-5 conditions treated)
- **Key warnings** in plain language
- **Side effects** (common ones)
- **Overdose risk** statement
- **Do-not-take-with** contraindications

---

### 8. ⚕️ Prescription vs. OTC Indicator
Correctly classifies medicines as:
- **Prescription required** (Schedule H/H1/X) — flagged with red badge
- **OTC (Over The Counter)** — flagged with green badge

**Schedule H/H1/X override map** corrects AI misclassifications for **70+ commonly known drugs** (e.g. Azithromycin → Rx, Paracetamol → OTC).

---

### 9. 🔍 Multi-Product Type Support
Handles all Indian medicine formats:
| Type | Examples |
|------|---------|
| MEDICINE | Tablets, capsules, strips |
| INJECTION | Vials, ampoules, IV |
| LIQUID | Syrups, suspensions, drops |
| TOPICAL | Creams, gels, ointments |
| AYURVEDIC | Ayurvedic formulations |
| SUPPLEMENT | Vitamins, calcium, health supplements |

---

### 10. ☠️ Hazardous Substance Detection
If someone scans a non-medicine chemical (acid, H2O2, bleach, pesticide), Agada:
- Blocks the result with **DANGER** warning
- Shows poison control helpline: **1800-116-117** (India, free)
- Never suggests it as a medicine

---

### 11. 🚫 Non-Medicine Detection
Rejects adhesives (Fevibond, Fevicol), cosmetics, food products, stationery — with a clear "This is not a medicine" message.

---

### 12. 🔗 Pharmacy Deep Links
Direct links to buy verified alternatives at:
- Netmeds, Apollo Pharmacy, 1mg, DavaIndia
- Pre-searched with exact salt + dose so users land on correct product page

---

## Edge Cases Handled

### Image Quality
| Case | Handling |
|------|---------|
| Torn/blurry strip | Reads visible text; only blocks if ZERO text legible |
| Back of pack | Valid — extracts salt from "Composition" table |
| Damaged area | Ignored for fake signals |
| Label totally unreadable | `cannotRead=true` with helpful reason |

### Multi-line / Layout
| Case | Handling |
|------|---------|
| Salt on line 1, dose on line 2 | Read across all lines — dose not treated as absent |
| Parenthetical dose (Mavyret 100mg/40mg) | Parsed correctly across /, +, commas |
| Multiple active ingredients | All extracted; all checked in DB |

### Dose Verification
| Case | Handling |
|------|---------|
| Dose visible | Confirmed — proceeds to DB lookup |
| Dose on back panel only | Allowed — salt is readable from front |
| Dose absent on topical/supplement | Normal by design — no block |
| Dose absent on medicine/injection | `doseUnconfirmed` flag + warning |
| Total unreadable | Blocked with `cannotRead=true` |

### Database Matching (dbService.js)
| Rule | What it does |
|------|-------------|
| Form bucket | Solid ≠ liquid ≠ injection — never interchangeable |
| Drug-prefix blocking | levo-thyroxine ≠ thyroxine (different drug!) |
| Combipack blocking | Always blocked |
| Dose tolerance | ±10% single drug, ±5% combo |
| Synonym mapping | amoxicillin ↔ amoxycillin, frusemide ↔ furosemide |
| SR penalty | Immediate-release preferred unless user asks for SR/ER |

### AI Safety
| Rule | What it does |
|------|-------------|
| Salt hallucination guard | AI-generic salt field validated against query drug names |
| Manufacturer deduplication | Max 1 brand per manufacturer in alternatives |
| Zero-hallucination price prompt | AI only returns price if ±20% confident |
| Expiry auto-check | Compares expiry date against today's date |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| AI (Vision) | Groq llama-4-scout + llama-4-maverick (model cascade) |
| AI (Text) | Groq llama-3.3-70b-versatile + fallbacks |
| Database | Jan Aushadhi BPPI CSV + CDSCO Drug Registry CSV |
| Live Prices | DavaIndia API, 1mg API |
| Deployment | Vercel (auto-deploy from GitHub) |
| Security | API keys server-side only; no client-side exposure |

---

## Security Measures

- ✅ **No API keys in browser** — all Groq calls proxy through `/api/groq`
- ✅ **VITE_GROQ_KEY removed** — was client-side exposure risk
- ✅ **CORS open only to API routes** — browser cannot read Vercel env vars
- ✅ **Rate limiting** per key rotation in proxy
- ✅ **JSON parse safety** — `safeJSON()` with try/catch, no `eval`
- ✅ **No SQL injection** — DB uses sanitised ILIKE matching only

---

## Prescription Handwriting Test Result ✅

```
Input: Simulated handwritten prescription
Medicines: Dolo 650, Azithro 500mg, Pantocid 40mg, Metron 400mg
Abbrevs: 1-0-1, OD, BD, TDS

Output:
- doctorName: "Dr. R. Sharma" ✓
- date: "20/04/2026" ✓
- 4 medicines extracted ✓
- Frequencies: BD, OD, TDS interpreted correctly ✓
- Confidence: 90% ✓
```

---

## Competitor Comparison

| Feature | Agada | 1mg | PharmEasy | Netmeds | Google Lens |
|---------|-------|-----|-----------|---------|--------------|
| Medicine strip OCR | ✅ | ❌ | ❌ | ❌ | ❌ |
| Prescription reading | ✅ | ❌ | ❌ | ❌ | ❌ |
| Handwriting inference | ✅ | ❌ | ❌ | ❌ | ❌ |
| Jan Aushadhi lookup | ✅ | ❌ | ❌ | ❌ | ❌ |
| CDSCO authenticity | ✅ | ❌ | ❌ | ❌ | ❌ |
| Schedule H override | ✅ | ❌ | ❌ | ❌ | ❌ |
| Generic alternatives | ✅ | Partial | Partial | Partial | ❌ |
| Hazardous chem block | ✅ | ❌ | ❌ | ❌ | ❌ |
| QR/barcode support | ✅ | ❌ | ❌ | ❌ | ❌ |
| Free, no login | ✅ | Partial | Partial | ❌ | ✅ |
| Indian government DB | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Summary

Agada is the **only free, no-login Indian medicine verification app** that combines:
- **Vision OCR** for strips + handwritten prescriptions
- **Government DB authenticity** (CDSCO + Jan Aushadhi)
- **AI safety overrides** (Schedule H/X drugs, hallucination guards)
- **Price intelligence** (official Jan Aushadhi + live market prices)
- **Hazardous substance detection** (poison control included)

Built for Indians with unreliable internet, low health literacy, and pharmacy price asymmetry — available in English with Hindi support.
