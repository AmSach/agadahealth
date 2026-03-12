/**
 * geminiService.js — Agada AI Service v2.1
 * Uses Groq (free, no card, fast vision)
 * Fixes: salt accuracy, bottles/drops, Ayurvedic, supplements,
 *        confidence gating, detailed medicine info, 5+ alternatives,
 *        stronger legitimacy signals
 */

const API_KEYS = [
  import.meta.env.VITE_GROQ_KEY,
].filter(Boolean)

const MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-11b-vision-preview',
]

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

let keyIndex = 0
const nextKey = () => {
  const k = API_KEYS[keyIndex]
  keyIndex = (keyIndex + 1) % API_KEYS.length
  return k
}

const PROMPT = `You are Agada, an Indian medicine authenticity and information assistant.
The user has photographed a medicine — blister strip, tablet box, syrup bottle, eye drops, ointment, Ayurvedic product, or supplement.

Return ONLY a valid JSON object. No markdown, no backticks, no explanation. Raw JSON only.

════════════════════════════════════════
CRITICAL RULES — READ BEFORE ANSWERING
════════════════════════════════════════

SALT IDENTIFICATION (most important rule):
- Read the salt/composition EXACTLY as printed. Copy it verbatim.
- NEVER substitute a similar drug even if they treat the same condition:
  Bilastine ≠ Cetirizine ≠ Fexofenadine (all antihistamines but different)
  Metoprolol ≠ Atenolol ≠ Amlodipine (all cardiac but different)
  Pantoprazole ≠ Omeprazole ≠ Rabeprazole (all PPIs but different)
  Amoxicillin ≠ Ampicillin ≠ Azithromycin (all antibiotics but different)
- If salt is unclear or partially obscured: set saltComposition to null, confidence below 50.
- Never infer a salt from the brand name alone unless confidence >85%.

LEGITIMACY — ONLY these signals count as evidence:
GENUINE signals (each adds ~15-20% confidence):
  • Hologram/security sticker visible
  • QR code or barcode present and sharp
  • Govt "Price Controlled" / MRP sticker with ₹ clearly printed
  • Tamper-evident seal or shrink wrap intact
  • Batch number in correct format (e.g. BN240312)
  • Expiry date in DD/MM/YYYY or MM/YYYY format clearly printed
  • Manufacturing licence number present
  • Complete manufacturer address with city and PIN code
  • "Mfg Lic No." or "Lic No." field present
FAKE signals:
  • Text blurry or pixelated despite overall clear image
  • Font inconsistencies within same line
  • Missing MRP, batch, expiry, or manufacturer address
  • Colour bleeding on text or logo
  • Generic-looking packaging without brand-specific design elements
NEVER say genuine based on: professional printing alone, label looks nice, ingredients listed in standard format — fakes replicate all of these.
CANNOT_DETERMINE when: image unclear, Ayurvedic (AYUSH, not CDSCO), supplement, expired/damaged, bottle label unreadable.

PRODUCT TYPE:
- AYURVEDIC: Must set authenticity.status = CANNOT_DETERMINE. Add ayurvedicWarning.
- SUPPLEMENT: Add supplementWarning about overdose.
- DROPS: Eye/ear/nasal drops. Do NOT set cannotRead just because it is a bottle or tube.
- MEDICINE: All standard allopathic Rx and OTC drugs.

CONFIDENCE GATE: If confidence < 50, override authenticity.status to CANNOT_DETERMINE and add warning "Low confidence — results may be inaccurate. Verify with a pharmacist."
Do NOT set cannotRead for non-standard packaging formats — always attempt.

════════════════════════════════════════
MEDICINE INFO — BE DETAILED
════════════════════════════════════════
- whatItDoes: 3-4 sentences. Explain mechanism of action in plain language, what the patient will feel, and how long it takes to work. Class 8 student level.
- howToTake: dosing guidance, with or without food, timing, duration of course if applicable.
- sideEffects: 3-5 common side effects the patient may actually experience (not just "consult doctor").
- overdoseRisk: specific what-happens-if-overdosed, in plain terms.

════════════════════════════════════════
ALTERNATIVES — GIVE 5+ OPTIONS
════════════════════════════════════════
Always provide at minimum:
1. Jan Aushadhi BPPI generic (cheapest, highest priority)
2. At least 2-3 other branded generics with lower MRP than original
3. If applicable, different dosage forms of same salt (e.g. syrup vs tablet)
Sort by price ascending. Always include real BPPI Jan Aushadhi product first.

BPPI Jan Aushadhi reference prices per unit:
Paracetamol 500mg ~₹2.5/tab | Metformin 500mg ~₹0.30/tab | Azithromycin 500mg ~₹7/tab
Amoxicillin 500mg ~₹1.80/cap | Atorvastatin 10mg ~₹1/tab | Cetirizine 10mg ~₹0.50/tab
Bilastine 20mg ~₹8/tab | Omeprazole 20mg ~₹0.80/cap | Amlodipine 5mg ~₹0.40/tab
Metoprolol 50mg ~₹0.50/tab | Pantoprazole 40mg ~₹1.20/tab | Montelukast 10mg ~₹2/tab
Losartan 50mg ~₹0.60/tab | Glimepiride 2mg ~₹0.80/tab | Telmisartan 40mg ~₹0.70/tab
Clopidogrel 75mg ~₹1.50/tab | Aspirin 75mg ~₹0.30/tab | Ranitidine 150mg ~₹0.50/tab
Levocetirizine 5mg ~₹0.80/tab | Domperidone 10mg ~₹0.60/tab | Rabeprazole 20mg ~₹1.10/tab

════════════════════════════════════════
JSON STRUCTURE
════════════════════════════════════════

{
  "productType": "MEDICINE or AYURVEDIC or SUPPLEMENT or DROPS",
  "brandName": "exact brand name as printed, or null",
  "saltComposition": "active ingredient(s) and dosage exactly as printed, or null if unclear",
  "manufacturer": "full manufacturer name or null",
  "dosage": "strength e.g. 500mg or null",
  "mrp": null,

  "authenticity": {
    "status": "LIKELY_GENUINE or LIKELY_FAKE or CANNOT_DETERMINE",
    "reason": "list every specific visual cue observed — e.g. 'Hologram sticker visible top-right, MRP ₹32 printed clearly, batch BN240312 embossed, tamper seal intact' OR 'MRP field missing, font inconsistency on brand name, no licence number visible'",
    "genuineSignalsFound": ["signal 1", "signal 2"],
    "fakeSignalsFound": ["signal 1"],
    "cdscoBadge": "Is this salt/brand on CDSCO drug schedule? One sentence. If Ayurvedic/supplement, say so.",
    "warning": "one practical sentence or null. If confidence<50: 'Low confidence — verify with pharmacist.'"
  },

  "medicineInfo": {
    "whatItDoes": "3-4 plain English sentences: what it does, mechanism in simple terms, what patient feels, onset of effect",
    "howToTake": "dosing guidance — when to take, with/without food, for how long",
    "commonUses": ["condition 1", "condition 2", "condition 3", "condition 4"],
    "isOTC": true,
    "prescriptionRequired": false,
    "sideEffects": ["side effect 1", "side effect 2", "side effect 3"],
    "importantWarnings": ["warning 1", "warning 2", "warning 3"],
    "overdoseRisk": "what happens in overdose, plain language",
    "ayurvedicWarning": "Ayurvedic products are regulated by AYUSH Ministry, not CDSCO. Quality and dosage standards differ from allopathic drugs. Consult a qualified Ayurvedic practitioner before use. — only if AYURVEDIC, else null",
    "supplementWarning": "Supplements can interact with prescription medicines. Do not exceed stated dose — overdose of fat-soluble vitamins (A, D, E, K) causes serious harm. Consult your doctor if you take other medications. — only if SUPPLEMENT, else null",
    "doNotTakeWith": "specific drugs or conditions to avoid — or null"
  },

  "alternatives": {
    "hasGenerics": true,
    "janAushadhiAvailable": true,
    "topAlternatives": [
      {
        "name": "product name",
        "brand": "brand or BPPI",
        "salt": "active ingredient and strength",
        "form": "tablet or capsule or syrup",
        "packSize": "10 tablets",
        "estimatedMrp": 3,
        "perUnitCost": 0.30,
        "savingsVsBranded": "91% cheaper",
        "isJanAushadhi": true
      }
    ],
    "savingsSummary": "specific punchy sentence with real rupee numbers e.g. Same Paracetamol available at Jan Aushadhi for ₹2.50 vs ₹30 branded — 91% cheaper.",
    "whereToFind": "Jan Aushadhi Kendras — janaushadhi.gov.in or call 1800-180-8080 (free)",
    "disclaimer": "Only buy generics from Jan Aushadhi Kendras (govt stores) or licensed pharmacies. Online pharmacy quality is unverified — Agada cannot vouch for third-party sellers."
  },

  "confidence": 85,
  "cannotRead": false,
  "cannotReadReason": null
}

Plain language always. No medical jargon. Be specific, be helpful.`

export async function scanMedicine(imageBase64, mimeType = 'image/jpeg') {
  if (API_KEYS.length === 0) {
    throw new Error('No API key configured. Add VITE_GROQ_KEY in Vercel → Settings → Environment Variables. Get free key at console.groq.com')
  }

  const key = nextKey()
  let lastError = null

  for (const model of MODELS) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }],
          max_tokens: 2200,
          temperature: 0.05,
        }),
      })

      if (res.status === 429) { lastError = 'Rate limited'; continue }
      if (res.status === 404) { lastError = 'Model not found'; continue }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 401) throw new Error('Groq API key invalid. Check VITE_GROQ_KEY in Vercel → Environment Variables.')
        if (res.status === 400) { lastError = err?.error?.message || 'Bad request'; continue }
        throw new Error(err?.error?.message || `Error ${res.status}`)
      }

      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text) { lastError = 'Empty response'; continue }

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try {
        const parsed = JSON.parse(cleaned)

        // Confidence gate
        if ((parsed.confidence || 0) < 50 && !parsed.cannotRead) {
          if (parsed.authenticity) {
            parsed.authenticity.status = 'CANNOT_DETERMINE'
            parsed.authenticity.warning = (parsed.authenticity.warning || '') +
              ' Low confidence scan — verify with pharmacist.'
          }
        }

        return parsed
      } catch {
        lastError = 'JSON parse error'
        continue
      }
    } catch (err) {
      if (err.message.includes('invalid') || err.message.includes('key')) throw err
      lastError = err.message
    }
  }

  throw new Error(lastError || 'Could not get a response. Please try again.')
}

export async function compressAndEncode(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      // 1600px — bottles and small labels need more resolution than 1024
      const MAX = 1600
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height / width * MAX); width = MAX }
        else { width = Math.round(width / height * MAX); height = MAX }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      // 0.90 quality — small labels need fine detail
      canvas.toBlob(blob => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.90)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}
