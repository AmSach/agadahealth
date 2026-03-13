/**
 * dbService.js v5 — Agada Database Service
 *
 * Matching logic:
 * 1. Word-boundary match — 'cetirizine' never matches 'levocetirizine'
 * 2. Extra-salt block — combo products never shown for single-salt queries
 * 3. Form ranking — tablets > liquids > injections (unless query specifies)
 * 4. Isomer deprioritisation — plain form preferred over S(-)/Levo- variants
 * 5. Release-type depriotisation — immediate release preferred over SR/ER
 *    unless query explicitly asks for SR/ER
 * 6. Single best result returned — no lists, no confusion
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

// ─── SALT PARSER ──────────────────────────────────────────────────────────────
const STRIP = /\b(tablets?|capsules?|injection|syrup|oral|suspension|drops?|infusion|solution|cream|ointment|gel|spray|paediatric|prolonged|sustained|modified|extended|gastro|resistant|ip|bp|usp|sr|er|xr|mr|forte|plus|ml|gm|hydrochloride|dihydrochloride|hcl|hbr|sodium|potassium|sulphate|sulfate|phosphate|maleate|tartrate|mesylate|acetate|citrate|gluconate|nitrate|fumarate|release|tablet|capsule|per)\b/gi

export function parseSalts(text) {
  if (!text) return []
  return text
    .replace(/\([^)]*\)/g, ' ')
    .split(/\band\b|,|\+/i)
    .map(part => {
      const dm = part.match(/(\d+\.?\d*)\s*(mg|mcg|g|iu|%)/i)
      const dose = dm ? parseFloat(dm[1]) : null
      const name = part
        .replace(/(\d+\.?\d*)\s*(mg|mcg|g|iu|%)/gi, '')
        .replace(STRIP, '')
        .replace(/[^a-zA-Z\s]/g, ' ')
        .replace(/\s+/g, ' ').trim().toLowerCase()
      return name.length > 2 ? { name, dose } : null
    }).filter(Boolean)
}

// ─── WORD-BOUNDARY NAME MATCH ─────────────────────────────────────────────────
// 'cetirizine' does NOT match 'levocetirizine'
// 'flunarizine' DOES match 'flunarizine dihydrochloride' (after stripping)
function saltNameMatch(a, b) {
  if (a === b) return true
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('\\b' + esc(a) + '\\b', 'i').test(b) ||
         new RegExp('\\b' + esc(b) + '\\b', 'i').test(a)
}

// ─── MATCH QUALITY ─────────────────────────────────────────────────────────
export function matchQuality(qSalts, pSalts) {
  if (!qSalts.length || !pSalts.length) return 'blocked'

  // All query salts must be in product
  for (const qs of qSalts) {
    if (!pSalts.some(ps => saltNameMatch(qs.name, ps.name))) return 'blocked'
  }
  // Product must have NO extra active salts
  for (const ps of pSalts) {
    if (!qSalts.some(qs => saltNameMatch(qs.name, ps.name))) return 'blocked'
  }
  // Dose check on primary salt (±15% tolerance)
  const pq = qSalts[0]
  const pp = pSalts.find(ps => saltNameMatch(pq.name, ps.name))
  if (pq.dose && pp?.dose) {
    const ratio = pp.dose / pq.dose
    if (ratio < 0.85 || ratio > 1.15) return 'dose_mismatch'
  }
  return 'exact'
}

// ─── FORM / ROUTE RANKING ────────────────────────────────────────────────────
function formScore(productName, queryRaw) {
  const p = productName.toLowerCase()
  const q = (queryRaw || '').toLowerCase()

  const wantsInjection = /\binjection\b|\binfusion\b|\biv\b/.test(q)
  const wantsSR        = /\bsr\b|\ber\b|\bxr\b|\bprolonged\b|\bsustained\b|\bextended\b/.test(q)
  const wantsIsomer    = /\blevo\b|\bs\s*\([-−]\)/.test(q)
  const isInjection    = /\binjection\b|\binfusion\b/.test(p)
  const isLiquid       = /\bsyrup\b|\bsuspension\b|\bdrops?\b|\bsolution\b/.test(p)
  const isTopical      = /\bgel\b|\bcream\b|\bointment\b/.test(p)
  const isSR           = /\bprolonged\b|\bsustained\b|\bextended\b|\bmodified\b/.test(p)
  const isIsomer       = /\bs\s*\([-−]\)|\blevo\b|\bdextro\b/.test(p)

  let score = 0
  if (wantsInjection) {
    // User explicitly wants injection — penalise non-injections
    if (!isInjection) score += 100
  } else {
    // Default: prefer oral tablets
    if (isInjection) score += 100
    if (isLiquid)    score += 10
    if (isTopical)   score += 20
  }
  if (!wantsIsomer && isIsomer) score += 50
  if (!wantsSR && isSR)         score += 5

  return score
}

// ─── PER-UNIT PRICE ─────────────────────────────────────────────────────────
function perUnit(mrp, unitSize) {
  if (!mrp || !unitSize) return null
  if (/ml|gm|g\b/i.test(unitSize)) return null
  const n = unitSize.match(/(\d+)/); const count = n ? parseInt(n[1]) : 10
  return count > 0 ? Math.round(mrp / count * 100) / 100 : null
}

// ─── JAN AUSHADHI LOOKUP ─────────────────────────────────────────────────────
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
      mrp,
      perUnit: pu,
      savings,
      formScore: formScore(row['Generic Name'], saltComposition),
      isJanAushadhi: true,
      aiEstimated: false,
      brand: 'BPPI Jan Aushadhi',
      availableAt: 'Jan Aushadhi Kendra',
    }

    if (quality === 'exact') exact.push(entry)
    else if (quality === 'dose_mismatch') doseMismatch.push(entry)
  }

  // Sort: form preference first, then cheapest
  exact.sort((a, b) => a.formScore - b.formScore || a.mrp - b.mrp)
  doseMismatch.sort((a, b) => a.formScore - b.formScore || a.mrp - b.mrp)

  // Return single best of each — no lists, no confusion
  const best = exact[0] ? { ...exact[0] } : null
  const dmBest = doseMismatch[0] ? { ...doseMismatch[0] } : null
  if (best) delete best.formScore
  if (dmBest) delete dmBest.formScore

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
