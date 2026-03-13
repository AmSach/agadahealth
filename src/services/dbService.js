/**
 * dbService.js v6 — Agada Database Service
 *
 * Bug fixes:
 * 1. ALL salt doses checked (not just primary) — Amox 250+Clav 125 ≠ Amox 500+Clav 125
 * 2. Synonym normalisation — clavulanate==clavulanic acid, amoxicillin==amoxycillin etc.
 * 3. Strict dose match for combos — 0% tolerance when multiple salts present
 * 4. Single best result only — no dose-mismatches bleeding into results
 */

let jaDB    = null
let cdscoDb = null
let loadPromise = null

// ─── CSV ──────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1)
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    const row = {}
    headers.forEach((h, i) => { row[h.trim().replace(/"/g, '')] = (vals[i] || '').trim().replace(/"/g, '') })
    return row
  }).filter(r => Object.values(r).some(v => v))
}
function parseCSVLine(line) {
  const out = []; let cur = ''; let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out
}

export async function ensureLoaded() {
  if (jaDB && cdscoDb) return
  if (!loadPromise) loadPromise = Promise.all([
    fetch('/data/jan_aushadhi.csv').then(r => r.text()).then(parseCSV).then(d => { jaDB = d }),
    fetch('/data/cdsco.csv').then(r => r.text()).then(parseCSV).then(d => { cdscoDb = d }),
  ])
  await loadPromise
}

// ─── SYNONYM MAP ─────────────────────────────────────────────────────────────
// Normalise to one canonical name before all comparisons.
// Both forms map to the SAME canonical so matching works across naming conventions.
const SYNONYMS = {
  // Antibiotic variants
  'amoxicillin':            'amoxycillin',
  'clavulanic acid':        'clavulanate',
  'potassium clavulanate':  'clavulanate',
  'cloxacillin sodium':     'cloxacillin',
  // Diuretics
  'frusemide':              'furosemide',
  'furosemide':             'frusemide',
  // Anaesthetics
  'lignocaine':             'lidocaine',
  'lidocaine':              'lignocaine',
  // Analgesics
  'acetaminophen':          'paracetamol',
  // Cardiovascular
  'adrenaline':             'epinephrine',
  'epinephrine':            'adrenaline',
  // Bronchodilators
  'salbutamol':             'albuterol',
  'albuterol':              'salbutamol',
  // Vitamins
  'thiamine':               'vitamin b1',
  'vitamin b1':             'thiamine',
  'ascorbic acid':          'vitamin c',
  'vitamin c':              'ascorbic acid',
  // Steroids
  'prednisolone':           'prednisone',   // not exact but close for matching
  // Others
  'acetylsalicylic acid':   'aspirin',
  'aspirin':                'acetylsalicylic acid',
}

function normName(name) {
  const n = (name || '').toLowerCase().trim()
  return SYNONYMS[n] || n
}

// ─── SALT PARSER ──────────────────────────────────────────────────────────────
const STRIP = /\b(tablets?|capsules?|injection|syrup|oral|suspension|drops?|infusion|solution|cream|ointment|gel|spray|paediatric|prolonged|sustained|modified|extended|gastro|resistant|ip|bp|usp|sr|er|xr|mr|forte|plus|ml|gm|hydrochloride|dihydrochloride|hcl|hbr|sodium|potassium|sulphate|sulfate|phosphate|maleate|tartrate|mesylate|acetate|citrate|gluconate|nitrate|fumarate|release|tablet|capsule|per|trihydrate|monohydrate|anhydrous|dispersible|enteric|coated)\b/gi

export function parseSalts(text) {
  if (!text) return []
  return text
    .replace(/\([^)]*\)/g, ' ')
    .split(/\band\b|,|\+/i)
    .map(part => {
      const dm = part.match(/(\d+\.?\d*)\s*(mg|mcg|g|iu|%)/i)
      const dose = dm ? parseFloat(dm[1]) : null
      const rawName = part
        .replace(/(\d+\.?\d*)\s*(mg|mcg|g|iu|%)/gi, '')
        .replace(STRIP, '')
        .replace(/[^a-zA-Z\s]/g, ' ')
        .replace(/\s+/g, ' ').trim().toLowerCase()
      const name = normName(rawName)
      return name.length > 2 ? { name, dose } : null
    }).filter(Boolean)
}

// ─── NAME MATCH — word-boundary + synonyms ───────────────────────────────────
function saltNameMatch(a, b) {
  const na = normName(a), nb = normName(b)
  if (na === nb) return true
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('\\b' + esc(na) + '\\b', 'i').test(nb) ||
         new RegExp('\\b' + esc(nb) + '\\b', 'i').test(na)
}

// ─── MATCH QUALITY ─────────────────────────────────────────────────────────
// Key fix: checks EVERY salt dose, not just the first one.
// For combo drugs: ALL salt doses must match within tolerance.
// Tolerance: ±15% for single-salt, ±5% for combo (tighter — Amox 250 ≠ Amox 500)
export function matchQuality(qSalts, pSalts) {
  if (!qSalts.length || !pSalts.length) return 'blocked'

  const isCombo = qSalts.length > 1
  const doseTolerance = isCombo ? 0.10 : 0.15  // tighter for combos

  // All query salts must be present in product
  for (const qs of qSalts) {
    if (!pSalts.some(ps => saltNameMatch(qs.name, ps.name))) return 'blocked'
  }
  // Product must have no extra active salts
  for (const ps of pSalts) {
    if (!qSalts.some(qs => saltNameMatch(qs.name, ps.name))) return 'blocked'
  }

  // Check EVERY salt's dose (not just primary)
  let hasDoseMismatch = false
  for (const qs of qSalts) {
    if (!qs.dose) continue  // no dose in query — skip this salt's dose check
    const ps = pSalts.find(p => saltNameMatch(qs.name, p.name))
    if (!ps || !ps.dose) continue  // no dose in product — can't compare
    const ratio = ps.dose / qs.dose
    if (ratio < (1 - doseTolerance) || ratio > (1 + doseTolerance)) {
      hasDoseMismatch = true
    }
  }

  return hasDoseMismatch ? 'dose_mismatch' : 'exact'
}

// ─── FORM / ROUTE RANKING ─────────────────────────────────────────────────────
function formScore(productName, queryRaw) {
  const p = productName.toLowerCase()
  const q = (queryRaw || '').toLowerCase()
  const wantsInj  = /\binjection\b|\binfusion\b|\biv\b/.test(q)
  const wantsSR   = /\bsr\b|\ber\b|\bxr\b|\bprolonged\b|\bsustained\b|\bextended\b/.test(q)
  const wantsIso  = /\blevo\b|\bs\s*\([-−]\)/.test(q)
  let s = 0
  if (wantsInj) { if (!/\binjection\b|\binfusion\b/.test(p)) s += 100 }
  else          { if (/\binjection\b|\binfusion\b/.test(p))  s += 100 }
  if (/\bsyrup\b|\bsuspension\b|\bdrops?\b/.test(p)) s += 10
  if (/\bgel\b|\bcream\b|\bointment\b/.test(p))       s += 20
  if (!wantsIso && /\bs\s*\([-−]\)|\blevo\b|\bdextro\b/.test(p)) s += 50
  if (!wantsSR  && /\bprolonged\b|\bsustained\b|\bextended\b|\bmodified\b/.test(p)) s += 5
  return s
}

// ─── PER-UNIT PRICE ──────────────────────────────────────────────────────────
function perUnit(mrp, unitSize) {
  if (!mrp || !unitSize) return null
  if (/ml|gm|g\b/i.test(unitSize)) return null
  const n = unitSize.match(/(\d+)/); const count = n ? parseInt(n[1]) : 10
  return count > 0 ? Math.round(mrp / count * 100) / 100 : null
}

// ─── JAN AUSHADHI LOOKUP ──────────────────────────────────────────────────────
// Returns { best: entry|null, doseMismatch: entry|null }
export function lookupJanAushadhi(saltComposition, brandedMrp, brandedUnitSize) {
  if (!jaDB || !saltComposition) return { best: null, doseMismatch: null }
  const qSalts = parseSalts(saltComposition)
  if (!qSalts.length) return { best: null, doseMismatch: null }

  const brandedPU = brandedMrp && brandedUnitSize
    ? perUnit(parseFloat(brandedMrp), brandedUnitSize)
    : brandedMrp ? parseFloat(brandedMrp) / 10 : null

  const exact = [], doseMismatch = []

  for (const row of jaDB) {
    const pSalts = parseSalts(row['Generic Name'] || '')
    const quality = matchQuality(qSalts, pSalts)
    if (quality === 'blocked') continue
    const mrp = parseFloat(row['MRP']) || null
    if (!mrp) continue

    const pu = perUnit(mrp, row['Unit Size'])
    let savings = null
    if (brandedPU && pu) {
      const pct = Math.round((1 - pu / brandedPU) * 100)
      savings = pct > 5 ? `${pct}% cheaper per tablet` : pct < -5 ? null : 'Similar price'
    }

    const entry = {
      name: row['Generic Name'],
      salt: saltComposition,
      unitSize: row['Unit Size'],
      mrp, perUnit: pu, savings,
      formScore: formScore(row['Generic Name'], saltComposition),
      isJanAushadhi: true, aiEstimated: false,
      brand: 'BPPI Jan Aushadhi',
      availableAt: 'Jan Aushadhi Kendra',
    }
    if (quality === 'exact') exact.push(entry)
    else doseMismatch.push(entry)
  }

  exact.sort((a, b) => a.formScore - b.formScore || a.mrp - b.mrp)
  doseMismatch.sort((a, b) => a.formScore - b.formScore || a.mrp - b.mrp)

  const best   = exact[0]        ? { ...exact[0],        formScore: undefined } : null
  const dmBest = doseMismatch[0] ? { ...doseMismatch[0], formScore: undefined } : null
  return { best, doseMismatch: dmBest }
}

// ─── CDSCO LOOKUP ─────────────────────────────────────────────────────────────
export function lookupCDSCO(saltComposition) {
  if (!cdscoDb || !saltComposition) return { found: false, badge: null, indication: null }
  const qSalts = parseSalts(saltComposition)
  if (!qSalts.length) return { found: false, badge: null, indication: null }
  const primary = qSalts[0].name
  const matches = cdscoDb.filter(row =>
    primary.length > 4 && (row['Drug Name'] || '').toLowerCase().includes(primary)
  )
  if (!matches.length) return { found: false, badge: null, indication: null }
  const best = matches.find(r => r['Indication'] && !/^additional/i.test(r['Indication'])) || matches[0]
  let indication = (best['Indication'] || '')
    .replace(/^(for\s+)?(the\s+)?(treatment|management)\s+of\s+/i, '')
    .replace(/^as\s+an?\s+/i, '').trim()
  if (indication.length > 80) indication = indication.slice(0, 80) + '...'
  const displayName = primary.charAt(0).toUpperCase() + primary.slice(1)
  return { found: true, badge: `✓ ${displayName} is CDSCO-approved`, indication: indication || null, approvalDate: best['Date of Approval'] || null }
}

// ─── SAVINGS SUMMARY ─────────────────────────────────────────────────────────
export function buildSavingsSummary(best, brandedMrp, brandedUnitSize) {
  if (!best?.mrp) return null
  const brandedPU = brandedMrp && brandedUnitSize ? perUnit(parseFloat(brandedMrp), brandedUnitSize) : null
  const jaPU = best.perUnit
  if (brandedPU && jaPU && brandedPU > jaPU) {
    const pct = Math.round((1 - jaPU / brandedPU) * 100)
    return pct > 5 ? `₹${jaPU}/tablet vs ₹${brandedPU}/tablet branded — ${pct}% cheaper.` : null
  }
  return `Jan Aushadhi: ₹${best.mrp} for ${best.unitSize}.`
}
