/**
 * geminiService.js — Agada AI Service v3
 *
 * AI ONLY reads the medicine name/salt from the photo.
 * Everything else — alternatives, pricing, authenticity — from local CSV DBs.
 *
 * Phase 1: Groq vision → read brand + salt from image
 * Phase 2: dbService → real JA alternatives + CDSCO registry check
 * Phase 3: Groq text  → plain English description + warnings only
 */

import { ensureLoaded, lookupJanAushadhi, lookupCDSCO, buildSavingsSummary } from './dbService.js'

const API_KEYS = [import.meta.env.VITE_GROQ_KEY].filter(Boolean)

const VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-11b-vision-preview',
]
const TEXT_MODEL = 'llama-3.3-70b-versatile'
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'

let keyIndex = 0
const nextKey = () => { const k = API_KEYS[keyIndex]; keyIndex = (keyIndex + 1) % API_KEYS.length; return k }

// Phase 1 prompt: READ ONLY
const IMAGE_READ_PROMPT = `You are a medicine label reader for an Indian healthcare app.
Your ONLY job: read text printed on this medicine packaging. Extract structured data.
Do NOT suggest alternatives. Do NOT give clinical advice. Read only what is visible.

SALT RULE: Copy salt/composition EXACTLY as printed. NEVER substitute.
Bilastine != Cetirizine. Metoprolol != Atenolol. Pantoprazole != Omeprazole.
If unclear: saltComposition=null, confidence<50.
Do NOT set cannotRead:true for bottles/tubes/drops — try to read what is visible.

DAMAGED / TORN / PARTIAL PACKAGING — VERY IMPORTANT:
- If the wrapper is torn, stained, crumpled, or partially missing: READ WHAT IS VISIBLE. Do not refuse.
- A torn wrapper does NOT mean fake. Ignore damage when assessing authenticity.
- Partial label: extract whatever fields are readable. Leave others null.
- Blurry image: lower confidence but still attempt to read brand name and salt.
- If you can read even just the brand name: return it. That alone is useful.
- ONLY set cannotRead:true if literally nothing is readable — not even a single word.
- The user's need for information is more important than having a perfect image.

LEGITIMACY: List every signal you actually see. Ignore torn/damaged portions.
Genuine: hologram, QR/barcode, govt price sticker with rupee amount, tamper seal, batch number, expiry date, full manufacturer address with PIN, licence number
Fake: pixelated text (despite clear image), missing MRP/batch/expiry on undamaged portions, font inconsistency, no manufacturer address on undamaged label
NOTE: Do not mark fake signals for missing fields if the label is visibly torn/damaged in that area.

Return ONLY valid JSON, no markdown:
{
  "productType": "MEDICINE or AYURVEDIC or SUPPLEMENT or DROPS",
  "brandName": "exact as printed or null",
  "saltComposition": "exact as printed or null",
  "manufacturer": "name or null",
  "dosage": "strength or null",
  "mrp": null,
  "batchNumber": "as printed or null",
  "expiryDate": "as printed or null",
  "licenceNumber": "as printed or null",
  "genuineSignalsFound": [],
  "fakeSignalsFound": [],
  "confidence": 85,
  "cannotRead": false,
  "cannotReadReason": null
}`

function descriptionPrompt(brand, salt, type) {
  return `Plain-language medicine information for Indian patients.
Medicine: ${brand || 'Unknown'} (${salt || 'Unknown salt'}) — Type: ${type || 'MEDICINE'}
Do NOT suggest brands or alternatives. General drug class info only. Return ONLY JSON, no markdown:
{
  "whatItDoes": "3-4 plain English sentences: mechanism, what patient feels, onset",
  "howToTake": "general guidance — with/without food, timing, typical duration",
  "commonUses": ["use1","use2","use3","use4"],
  "prescriptionRequired": false,
  "sideEffects": ["effect1","effect2","effect3"],
  "importantWarnings": ["warning1","warning2","warning3"],
  "overdoseRisk": "what happens in overdose, plain language",
  "ayurvedicWarning": "if AYURVEDIC only: AYUSH regulated, consult practitioner — else null",
  "supplementWarning": "if SUPPLEMENT only: overdose risk, interactions — else null",
  "doNotTakeWith": "interactions or null"
}`
}

// Separate prompt for generic branded alternatives — runs only when JA DB has < 3 results
function genericsPrompt(salt, jaCount) {
  return `You are a pharmacist assistant for Indian patients at an emergency.
The patient needs: ${salt}
Jan Aushadhi database found ${jaCount} result(s). Supplement with real branded generics available at ANY Indian chemist.

Rules:
- Only suggest medicines with the EXACT same active salt as: ${salt}
- Include real Indian manufacturers: Cipla, Sun Pharma, Dr Reddy's, Lupin, Mankind, Alkem, Intas, Zydus, Abbott, Torrent, Glenmark, Wockhardt, Pfizer India, Micro Labs, Macleods, FDC, Aristo, Cadila
- Estimate MRP conservatively — err on the low side. These are approximations.
- Do NOT make up medicines. Only suggest if you are confident this brand+salt exists.
- Sort by estimated MRP ascending.
- Mark isJanAushadhi as false for all of these.

Return ONLY JSON array, no markdown:
[
  {
    "name": "brand name and strength",
    "brand": "manufacturer name",
    "salt": "${salt}",
    "form": "tablet or capsule or syrup",
    "packSize": "e.g. 10 tablets",
    "estimatedMrp": 25,
    "perUnit": 2.5,
    "savingsNote": "e.g. 60% cheaper than Crocin",
    "isJanAushadhi": false,
    "aiEstimated": true,
    "availableAt": "Any chemist"
  }
]`
}

export async function scanMedicine(imageBase64, mimeType = 'image/jpeg', barcodeData = null) {
  if (API_KEYS.length === 0) throw new Error('No API key. Add VITE_GROQ_KEY in Vercel → Environment Variables. Free key at console.groq.com')

  const key = nextKey()

  // Load DBs in parallel with vision call
  const dbPromise = ensureLoaded().catch(() => {})

  // Phase 1: read image
  const img = await callVision(key, imageBase64, mimeType, IMAGE_READ_PROMPT)

  // Merge barcode (more reliable than AI for batch/expiry)
  if (barcodeData) {
    if (barcodeData.batchNumber && !img.batchNumber) img.batchNumber = barcodeData.batchNumber
    if (barcodeData.expiryDate  && !img.expiryDate)  img.expiryDate  = barcodeData.expiryDate
    if (barcodeData.brandFromQR && !img.brandName)   img.brandName   = barcodeData.brandFromQR
    if (barcodeData.mrpFromQR   && !img.mrp)         img.mrp         = barcodeData.mrpFromQR
    if (!img.genuineSignalsFound) img.genuineSignalsFound = []
    img.genuineSignalsFound.push('QR/barcode decoded successfully')
  }

  const expiryStr = img.expiryDate || barcodeData?.expiryDate
  const isExpired = expiryStr ? checkExpired(expiryStr) : false

  await dbPromise

  // Phase 2: DB lookups
  const jaResults   = lookupJanAushadhi(img.saltComposition, img.mrp ? parseFloat(img.mrp) : null)
  const cdscoResult = lookupCDSCO(img.saltComposition, img.brandName)

  // Phase 3: description + generic branded alternatives (run in parallel)
  let info = null
  let aiGenerics = []
  if (img.saltComposition || img.brandName) {
    const [infoResult, genericsResult] = await Promise.allSettled([
      callText(key, descriptionPrompt(img.brandName, img.saltComposition, img.productType)),
      // Only call AI for generics if JA DB found fewer than 3 results
      jaResults.length < 3 && img.saltComposition
        ? callText(key, genericsPrompt(img.saltComposition, jaResults.length))
        : Promise.resolve(null),
    ])
    info = infoResult.status === 'fulfilled' ? infoResult.value : null
    if (genericsResult.status === 'fulfilled' && Array.isArray(genericsResult.value)) {
      aiGenerics = genericsResult.value.slice(0, 5)
    }
  }

  // Merge: JA DB results (verified) + AI generics (estimated), deduplicated by salt similarity
  const allAlternatives = [
    ...jaResults,
    ...aiGenerics.filter(ag =>
      !jaResults.some(ja => ja.name?.toLowerCase().includes(ag.name?.toLowerCase().slice(0, 8)))
    )
  ]

  const authenticity = buildAuthenticity(img, cdscoResult, isExpired, barcodeData)
  if ((img.confidence || 0) < 50) {
    authenticity.status  = 'CANNOT_DETERMINE'
    authenticity.warning = ((authenticity.warning || '') + ' Low confidence — verify with pharmacist.').trim()
  }

  return {
    productType:     img.productType || 'MEDICINE',
    brandName:       img.brandName,
    saltComposition: img.saltComposition,
    manufacturer:    img.manufacturer,
    dosage:          img.dosage,
    mrp:             img.mrp,
    batchNumber:     img.batchNumber,
    expiryDate:      expiryStr,
    isExpired,
    licenceNumber:   img.licenceNumber,
    confidence:      img.confidence || 70,
    cannotRead:      img.cannotRead || false,
    cannotReadReason:img.cannotReadReason,
    authenticity,
    medicineInfo:    info || fallbackInfo(img.productType),
    alternatives: {
      hasGenerics:          allAlternatives.length > 0,
      janAushadhiAvailable: jaResults.some(r => r.isJanAushadhi),
      topAlternatives:      allAlternatives,
      jaCount:              jaResults.length,
      aiGenericsCount:      aiGenerics.length,
      savingsSummary:       buildSavingsSummary(allAlternatives, img.mrp ? parseFloat(img.mrp) : null),
      whereToFind:          'Jan Aushadhi Kendras — janaushadhi.gov.in · 1800-180-8080 (free)',
      disclaimer:           'Only buy generics from Jan Aushadhi Kendras or licensed pharmacies. Agada cannot verify online pharmacy quality.',
      dataSource:           'BPPI Jan Aushadhi Official Product List + AI-estimated branded generics',
    },
    dataSource: {
      imageRead:    'Groq AI Vision',
      alternatives: 'BPPI Jan Aushadhi Database',
      cdsco:        cdscoResult.found ? 'CDSCO Drug Registry' : 'Not found in CDSCO registry',
      cdscoFound:   cdscoResult.found,
    }
  }
}

function buildAuthenticity(img, cdsco, isExpired, barcode) {
  const genuine = img.genuineSignalsFound || []
  const fake    = img.fakeSignalsFound    || []

  if (isExpired) return {
    status: 'CANNOT_DETERMINE',
    reason: `Medicine appears expired (${img.expiryDate}). Cannot assess authenticity.`,
    genuineSignalsFound: genuine, fakeSignalsFound: [...fake, 'Expired medicine'],
    cdscoBadge: cdsco.found ? `Salt approved by CDSCO (${cdsco.approvalDate || 'on record'})` : 'Salt not found in CDSCO registry.',
    warning: '⚠ This medicine appears expired. Do not consume.',
  }

  const score = (genuine.length * 18) - (fake.length * 25) + (cdsco.found ? 20 : 0) + (barcode ? 15 : 0)
  const status = fake.length >= 2 || score < -20 ? 'LIKELY_FAKE'
    : score >= 30 || genuine.length >= 2          ? 'LIKELY_GENUINE'
    : 'CANNOT_DETERMINE'

  const cdscoBadge = cdsco.found
    ? `✓ Found in CDSCO registry: "${cdsco.drugName}". Approved for: ${(cdsco.indication || '').slice(0,80)}.`
    : img.productType === 'AYURVEDIC' ? 'Regulated by AYUSH, not CDSCO.'
    : img.productType === 'SUPPLEMENT' ? 'Supplements not scheduled under CDSCO.'
    : 'Not found in CDSCO database.'

  return {
    status,
    reason: [
      genuine.length ? `Genuine signals: ${genuine.join(', ')}` : '',
      fake.length    ? `Suspicious: ${fake.join(', ')}` : '',
      !genuine.length && !fake.length ? 'Insufficient visual evidence.' : '',
    ].filter(Boolean).join(' | '),
    genuineSignalsFound: genuine,
    fakeSignalsFound:    fake,
    cdscoBadge,
    cdscoApprovalDate:  cdsco.approvalDate || null,
    warning: fake.length ? 'Return to chemist and ask for CDSCO licence proof. Report fakes: 1800-180-3024 (free).' : null,
  }
}

function checkExpired(d) {
  try {
    const p = d.split('/')
    const dt = p.length === 3 ? new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`)
             : p.length === 2 ? new Date(`${p[1]}-${p[0].padStart(2,'0')}-01`) : null
    return dt ? dt < new Date() : false
  } catch { return false }
}

function fallbackInfo(type) {
  if (type === 'AYURVEDIC') return { whatItDoes: 'Ayurvedic product.', ayurvedicWarning: 'Regulated by AYUSH Ministry, not CDSCO. Consult a qualified Ayurvedic practitioner.', commonUses:[], importantWarnings:[], sideEffects:[], prescriptionRequired:false }
  if (type === 'SUPPLEMENT') return { whatItDoes: 'Dietary supplement.', supplementWarning: 'Do not exceed stated dose. Fat-soluble vitamins accumulate and overdose causes harm. Consult doctor if on other medications.', commonUses:[], importantWarnings:[], sideEffects:[], prescriptionRequired:false }
  return { whatItDoes: 'Medicine information unavailable.', commonUses:[], importantWarnings:[], sideEffects:[], prescriptionRequired:false }
}

async function callVision(key, b64, mime, prompt) {
  let last = 'no model succeeded'
  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(GROQ_URL, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
        body: JSON.stringify({ model, max_tokens:900, temperature:0.05,
          messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:${mime};base64,${b64}`}}]}]})})
      if (res.status===429||res.status===404){last=`${res.status}`;continue}
      if (res.status===401) throw new Error('Groq API key invalid.')
      if (!res.ok){const e=await res.json().catch(()=>({}));last=e?.error?.message||`${res.status}`;continue}
      const data=await res.json(); const text=data?.choices?.[0]?.message?.content
      if (!text){last='empty';continue}
      const p=safeJSON(text); if(p) return p; last='JSON parse'
    } catch(e){if(e.message.includes('invalid')||e.message.includes('key'))throw e; last=e.message}
  }
  throw new Error(`Could not read image: ${last}`)
}

async function callText(key, prompt) {
  const res = await fetch(GROQ_URL, {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body:JSON.stringify({model:TEXT_MODEL,max_tokens:1100,temperature:0.1,messages:[{role:'user',content:prompt}]})})
  if (!res.ok) throw new Error(`Text call ${res.status}`)
  const data=await res.json(); return safeJSON(data?.choices?.[0]?.message?.content)
}

function safeJSON(t) { try{return JSON.parse((t||'').replace(/```json\n?/g,'').replace(/```\n?/g,'').trim())}catch{return null} }

export async function compressAndEncode(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const MAX = 1600
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height / width * MAX); width = MAX }
        else { width = Math.round(width / height * MAX); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      // Try 0.90 quality first, fall back to 0.75 if result > 4MB base64
      canvas.toBlob(blob => {
        const reader = new FileReader()
        reader.onload = () => {
          const b64 = reader.result.split(',')[1]
          if (b64.length > 4_000_000) {
            // Too large — re-compress at lower quality
            canvas.toBlob(blob2 => {
              const r2 = new FileReader()
              r2.onload = () => resolve(r2.result.split(',')[1])
              r2.onerror = reject
              r2.readAsDataURL(blob2)
            }, 'image/jpeg', 0.70)
          } else {
            resolve(b64)
          }
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.90)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}
