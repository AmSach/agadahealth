/**
 * geminiService.js v4 — Agada AI Service
 *
 * Key changes:
 * - 5 API key rotation (VITE_GROQ_KEY_1..5)
 * - Full model cascade — 6 models tried before giving up
 * - QR saltFromQR = ground truth, skips vision call entirely for that field
 * - Strict: if QR has salt, DB lookup uses ONLY that. Vision AI = fallback only.
 * - Parallel: vision + DB preload in parallel from start
 * - Pharmacy deep links for live prices (no CORS issues)
 */

import { ensureLoaded, lookupJanAushadhi, lookupCDSCO, buildSavingsSummary } from './dbService.js'

// ─── KEY ROTATION ─────────────────────────────────────────────────────────────
// Add up to 5 keys in Vercel: VITE_GROQ_KEY_1, VITE_GROQ_KEY_2 ... VITE_GROQ_KEY_5
const API_KEYS = [
  import.meta.env.VITE_GROQ_KEY_1,
  import.meta.env.VITE_GROQ_KEY_2,
  import.meta.env.VITE_GROQ_KEY_3,
  import.meta.env.VITE_GROQ_KEY_4,
  import.meta.env.VITE_GROQ_KEY_5,
  import.meta.env.VITE_GROQ_KEY, // legacy single key fallback
].filter(Boolean)

// ─── MODEL CASCADE ────────────────────────────────────────────────────────────
// Vision models — tried in order, skip on 429/404
const VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',  // fastest, best for OCR
  'meta-llama/llama-4-maverick-17b-128e-instruct', // larger, better for complex labels
  'llama-3.2-90b-vision-preview',               // fallback, slower
  'llama-3.2-11b-vision-preview',               // last resort vision
]
// Text-only models — for description + generics (no image)
const TEXT_MODELS = [
  'llama-3.3-70b-versatile',   // best quality
  'llama-3.1-70b-versatile',   // fallback
  'llama-3.1-8b-instant',      // fast fallback if others rate-limited
  'gemma2-9b-it',              // last resort
]
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Round-robin key selector — distributes load across all keys
let keyIndex = 0
const nextKey = () => {
  if (!API_KEYS.length) return null
  const k = API_KEYS[keyIndex % API_KEYS.length]
  keyIndex++
  return k
}

// ─── VISION PROMPT — lean, exact, fast ───────────────────────────────────────
const IMAGE_READ_PROMPT = `Medicine label reader. Extract ONLY what is printed. No advice.

SALT: Copy EXACTLY. Never infer. Bilastine≠Cetirizine. Pantoprazole≠Omeprazole.
If unreadable: saltComposition=null, confidence<50.
TORN/BLURRY/BOTTLE: Read what IS visible. cannotRead=true only if zero text legible.
Damaged areas: ignore for fake signals.

Genuine signals (only list if actually SEEN): hologram, QR/barcode, govt MRP sticker, tamper seal, batch no, expiry, full address+PIN, licence no
Fake signals (only list if actually SEEN): pixelated text on clear image, font mismatch, missing MRP/batch/expiry on INTACT label

JSON only, no markdown:
{"productType":"MEDICINE|AYURVEDIC|SUPPLEMENT|DROPS","brandName":null,"saltComposition":null,"manufacturer":null,"mrp":null,"unitSize":null,"batchNumber":null,"expiryDate":null,"licenceNumber":null,"genuineSignalsFound":[],"fakeSignalsFound":[],"confidence":85,"cannotRead":false,"cannotReadReason":null}`

// ─── DESCRIPTION PROMPT ───────────────────────────────────────────────────────
const mkDescPrompt = (brand, salt, type) =>
`Indian patient medicine info. Medicine: ${brand||'Unknown'} (${salt||'Unknown'}). Type: ${type||'MEDICINE'}.
No brand suggestions. General drug class only. JSON only:
{"whatItDoes":"2-3 plain sentences","howToTake":"general guidance","commonUses":["","",""],"prescriptionRequired":false,"sideEffects":["","",""],"importantWarnings":["",""],"overdoseRisk":"plain language","ayurvedicWarning":null,"supplementWarning":null,"doNotTakeWith":null}`

// ─── GENERICS PROMPT ─────────────────────────────────────────────────────────
const mkGenericsPrompt = (salt) =>
`You are an Indian pharmacist. Patient needs: ${salt}
List EXACTLY 3 real branded generics sold at Indian chemists with the EXACT SAME salt composition and dose.
Use prices from Netmeds, Apollo Pharmacy, 1mg, and DavaIndia as your reference.
Only real products from real manufacturers. Do not fabricate.
Manufacturers: Cipla, Sun Pharma, Dr Reddy's, Lupin, Mankind, Alkem, Intas, Zydus, Abbott India, Torrent, Glenmark, Micro Labs, FDC, Macleods, Aristo, Cadila, Hetero, Alembic, Ipca.
JSON array, no markdown, exactly 3 items:
[{"name":"Full Brand Name Strength","brand":"Manufacturer","salt":"${salt}","packSize":"10 tablets","estimatedMrp":25,"perUnit":2.5,"availableAt":"Any chemist","isJanAushadhi":false,"aiEstimated":true}]`

// ─── PHARMACY DEEP LINKS ─────────────────────────────────────────────────────
// Full salt+dose in query so user lands on the right strength, not just the salt
export function pharmacyLinks(saltComposition) {
  if (!saltComposition) return []
  const q = encodeURIComponent(saltComposition)
  return [
    { name: 'Netmeds',   url: `https://www.netmeds.com/products/?q=${q}` },
    { name: 'Apollo',    url: `https://www.apollopharmacy.in/search-medicines/${q}` },
    { name: '1mg',       url: `https://www.1mg.com/search/all?name=${q}` },
    { name: 'DavaIndia', url: `https://www.davaindia.com/search/all?search=${q}` },
  ]
}

// ─── MAIN SCAN ────────────────────────────────────────────────────────────────
export async function scanMedicine(imageBase64, mimeType = 'image/jpeg', barcodeData = null) {
  if (!API_KEYS.length) throw new Error('No API key. Add VITE_GROQ_KEY_1 in Vercel → Environment Variables. Free key at console.groq.com')

  // Start DB load immediately — parallel with everything else
  const dbPromise = ensureLoaded().catch(() => {})

  // ── GROUND TRUTH from QR ──────────────────────────────────────────────────
  // If QR has salt: this IS the correct composition. Vision AI cannot override it.
  const qrSalt     = barcodeData?.saltFromQR  || null
  const qrBrand    = barcodeData?.brandFromQR || null
  const qrBatch    = barcodeData?.batchNumber || null
  const qrExpiry   = barcodeData?.expiryDate  || null
  const qrMrp      = barcodeData?.mrpFromQR   || null

  // ── Phase 1: Vision AI reads label ───────────────────────────────────────
  // If QR already gave us salt+brand, we still call vision for:
  //   manufacturer, unitSize, mrp, batch (if not in QR), authenticity signals
  // But we cap tokens lower since less work needed
  const img = await callVision(imageBase64, mimeType, IMAGE_READ_PROMPT)

  // QR data overrides vision — QR is always more reliable
  const finalSalt   = qrSalt   || img.saltComposition
  const finalBrand  = qrBrand  || img.brandName
  const finalBatch  = qrBatch  || img.batchNumber
  const finalExpiry = qrExpiry || img.expiryDate
  const finalMrp    = qrMrp    || img.mrp

  if (qrSalt) {
    img.genuineSignalsFound = [...(img.genuineSignalsFound || []), 'QR/barcode decoded — salt verified']
  }

  const expiryStr = finalExpiry
  const isExpired = expiryStr ? checkExpired(expiryStr) : false

  await dbPromise

  // ── Phase 2: DB lookup — word-boundary exact, single best JA result ───────
  const jaLookup    = lookupJanAushadhi(finalSalt, finalMrp, img.unitSize)
  const cdscoResult = lookupCDSCO(finalSalt)
  const jaBest      = jaLookup.best         // 1 exact JA match, or null
  const jaDoseDiff  = jaLookup.doseMismatch // different dose — shown with warning

  // ── Phase 3: description + exactly 3 branded generics (parallel) ─────────
  let info = null, aiGenerics = []
  if (finalSalt || finalBrand) {
    const [infoRes, genRes] = await Promise.allSettled([
      callText(mkDescPrompt(finalBrand, finalSalt, img.productType)),
      finalSalt ? callText(mkGenericsPrompt(finalSalt)) : Promise.resolve(null),
    ])
    info = infoRes.status === 'fulfilled' ? infoRes.value : null
    if (genRes.status === 'fulfilled' && Array.isArray(genRes.value)) {
      aiGenerics = genRes.value.slice(0, 3)
    }
  }

  // 1 JA verified + up to 3 AI-estimated branded generics
  const allAlts = [
    ...(jaBest ? [jaBest] : []),
    ...aiGenerics,
  ]

  const authenticity = buildAuthenticity(img, cdscoResult, isExpired, barcodeData, qrSalt)
  if ((img.confidence || 0) < 50 && !qrSalt) {
    authenticity.status  = 'CANNOT_DETERMINE'
    authenticity.warning = ((authenticity.warning || '') + ' Low confidence — verify with pharmacist.').trim()
  }

  return {
    productType:     img.productType || 'MEDICINE',
    brandName:       finalBrand,
    saltComposition: finalSalt,
    manufacturer:    img.manufacturer,
    mrp:             finalMrp,
    unitSize:        img.unitSize,
    batchNumber:     finalBatch,
    expiryDate:      expiryStr,
    isExpired,
    licenceNumber:   img.licenceNumber,
    confidence:      qrSalt ? 99 : (img.confidence || 70),
    saltSource:      qrSalt ? 'QR_BARCODE' : 'AI_VISION',
    cannotRead:      img.cannotRead || false,
    cannotReadReason:img.cannotReadReason,
    authenticity,
    medicineInfo:    info || fallbackInfo(img.productType),
    alternatives: {
      hasGenerics:          allAlts.length > 0,
      janAushadhiAvailable: !!jaBest,
      topAlternatives:      allAlts,
      doseMismatchAlt:      jaDoseDiff,   // singular — one dose-mismatch at most
      jaCount:              jaBest ? 1 : 0,
      savingsSummary:       buildSavingsSummary(jaBest, finalMrp, img.unitSize),
      pharmacyLinks:        pharmacyLinks(finalSalt),
      whereToFind:          'Jan Aushadhi Kendras — janaushadhi.gov.in · 1800-180-8080',
      disclaimer:           'Jan Aushadhi prices from official BPPI database. Branded generic prices are AI-estimated. Check pharmacy sites for live prices.',
    },
    dataSource: {
      salt:       qrSalt ? 'QR barcode (verified)' : 'AI vision (estimated)',
      alts:       'BPPI Jan Aushadhi DB + AI',
      cdsco:      cdscoResult.found ? 'CDSCO Drug Registry' : 'Not in CDSCO registry',
      cdscoFound: cdscoResult.found,
    }
  }
}

// ─── AUTHENTICITY ─────────────────────────────────────────────────────────────
function buildAuthenticity(img, cdsco, isExpired, barcode, qrSalt) {
  const genuine = img.genuineSignalsFound || []
  const fake    = img.fakeSignalsFound    || []

  if (isExpired) return {
    status: 'CANNOT_DETERMINE',
    reason: `Medicine appears expired (${img.expiryDate}).`,
    genuineSignalsFound: genuine, fakeSignalsFound: [...fake, 'Expired'],
    cdscoBadge: cdsco.badge || null, cdscoIndication: cdsco.indication || null,
    warning: '⚠ Expired. Do not consume.',
  }

  const score = genuine.length * 18 - fake.length * 25 + (cdsco.found ? 20 : 0) + (barcode ? 15 : 0) + (qrSalt ? 20 : 0)
  const status = fake.length >= 2 || score < -20 ? 'LIKELY_FAKE'
    : score >= 30 || genuine.length >= 2           ? 'LIKELY_GENUINE'
    : 'CANNOT_DETERMINE'

  return {
    status,
    reason: [
      genuine.length ? `Genuine signals: ${genuine.join(', ')}` : '',
      fake.length    ? `Suspicious: ${fake.join(', ')}` : '',
      !genuine.length && !fake.length ? 'Insufficient visual evidence.' : '',
    ].filter(Boolean).join(' | '),
    genuineSignalsFound: genuine,
    fakeSignalsFound:    fake,
    cdscoBadge:      cdsco.badge || (
      img.productType === 'AYURVEDIC'  ? '🌿 Regulated by AYUSH, not CDSCO.' :
      img.productType === 'SUPPLEMENT' ? 'Dietary supplement — not CDSCO scheduled.' :
      'Salt not found in CDSCO registry.'
    ),
    cdscoIndication:  cdsco.indication || null,
    cdscoFound:       cdsco.found,
    approvalDate:     cdsco.approvalDate || null,
    warning: fake.length ? 'Return to chemist. Report fakes: 1800-180-3024 (free).' : null,
  }
}

// ─── GROQ CALLERS ─────────────────────────────────────────────────────────────
async function callVision(b64, mime, prompt) {
  let lastErr = 'no models available'
  for (const model of VISION_MODELS) {
    const key = nextKey()
    if (!key) continue
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model, max_tokens: 600, temperature: 0.05,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
          ]}]
        })
      })
      if (res.status === 429 || res.status === 404) { lastErr = `${model} ${res.status}`; continue }
      if (res.status === 401) throw new Error('Invalid API key. Check VITE_GROQ_KEY_1 in Vercel.')
      if (!res.ok) { const e = await res.json().catch(()=>({})); lastErr = e?.error?.message || `${res.status}`; continue }
      const data = await res.json()
      const parsed = safeJSON(data?.choices?.[0]?.message?.content)
      if (parsed) return parsed
      lastErr = 'JSON parse fail'
    } catch(e) {
      if (e.message.includes('Invalid API')) throw e
      lastErr = e.message
    }
  }
  throw new Error(`Could not read image: ${lastErr}`)
}

async function callText(prompt) {
  let lastErr = 'no models'
  for (const model of TEXT_MODELS) {
    const key = nextKey()
    if (!key) continue
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 800, temperature: 0.1, messages: [{ role: 'user', content: prompt }] })
      })
      if (res.status === 429 || res.status === 404) { lastErr = `${model} ${res.status}`; continue }
      if (!res.ok) { lastErr = `${res.status}`; continue }
      const data = await res.json()
      const parsed = safeJSON(data?.choices?.[0]?.message?.content)
      if (parsed) return parsed
      lastErr = 'JSON parse'
    } catch(e) { lastErr = e.message }
  }
  return null // text calls are non-fatal
}

function safeJSON(t) {
  try { return JSON.parse((t||'').replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()) }
  catch { return null }
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
  if (type === 'AYURVEDIC') return { whatItDoes: 'Ayurvedic product.', ayurvedicWarning: 'Regulated by AYUSH Ministry. Consult a qualified practitioner.', commonUses:[], sideEffects:[], importantWarnings:[], prescriptionRequired:false }
  if (type === 'SUPPLEMENT') return { whatItDoes: 'Dietary supplement.', supplementWarning: 'Do not exceed stated dose. Consult doctor if on other medicines.', commonUses:[], sideEffects:[], importantWarnings:[], prescriptionRequired:false }
  return { whatItDoes: 'Medicine information unavailable.', commonUses:[], sideEffects:[], importantWarnings:[], prescriptionRequired:false }
}

// ─── IMAGE COMPRESSION ────────────────────────────────────────────────────────
export async function compressAndEncode(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const MAX = 1600
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height/width*MAX); width = MAX }
        else { width = Math.round(width/height*MAX); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height); ctx.drawImage(img,0,0,width,height)
      const tryEncode = (quality, cb) => {
        canvas.toBlob(blob => {
          const r = new FileReader()
          r.onload = () => cb(r.result.split(',')[1])
          r.onerror = reject
          r.readAsDataURL(blob)
        }, 'image/jpeg', quality)
      }
      tryEncode(0.90, b64 => {
        if (b64.length > 4_000_000) tryEncode(0.70, resolve)
        else resolve(b64)
      })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}
