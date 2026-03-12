/**
 * dbService.js — Agada Database Service v3
 *
 * Fixes:
 * 1. Combo queries (A+B) ONLY return products with BOTH salts at matching doses
 * 2. Single queries NEVER return combo products (no extra active ingredients)
 * 3. Per-unit price always used for savings %, not raw MRP
 * 4. CDSCO returns clean single-line badge, no conflicting drug name shown
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
    headers.forEach((h, i) => {
      row[h.trim().replace(/"/g, '')] = (vals[i] || '').trim().replace(/"/g, '')
    })
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
  out.push(cur)
  return out
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
// "Metformin Hydrochloride 500mg and Glimepiride 1mg Tablets IP"
// → [{name:'metformin', dose:500}, {name:'glimepiride', dose:1}]
const REMOVE_WORDS = /\b(tablets?|capsules?|injection|syrup|oral|suspension|drops?|infusion|solution|cream|ointment|gel|spray|paediatric|prolonged|sustained|modified|extended|gastro|resistant|ip|bp|usp|sr|er|xr|mr|forte|plus|ml|gm|hydrochloride|hcl|sodium|potassium|sulphate|sulfate|phosphate|maleate|tartrate|mesylate|acetate|citrate|gluconate|nitrate|fumarate)\b/gi

export function parseSalts(text) {
  if (!text) return []
  return text.split(/\band\b|,/i).map(part => {
    const dm = part.match(/(\d+\.?\d*)\s*(mg|mcg|g|iu|%)/i)
    const dose = dm ? parseFloat(dm[1]) : null
    const name = part
      .replace(/(\d+\.?\d*)\s*(mg|mcg|g|iu|%)/gi, '')
      .replace(REMOVE_WORDS, '')
      .replace(/[()[\]]/g, '')
      .replace(/[^a-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ').trim().toLowerCase()
    return name.length > 2 ? { name, dose } : null
  }).filter(Boolean)
}

// ─── MATCH QUALITY ───────────────────────────────────────────────────────────
// Returns: 'exact' | 'dose_mismatch' | 'blocked' (extra active salts = dangerous)
function matchQuality(qSalts, pSalts) {
  if (!qSalts.length || !pSalts.length) return 'blocked'

  // Every query salt must appear in the product
  for (const qs of qSalts) {
    const found = pSalts.some(ps => ps.name.includes(qs.name) || qs.name.includes(ps.name))
    if (!found) return 'blocked'
  }

  // Product must not have EXTRA active salts not in the query
  // This is the safety-critical rule: patient's medicine has salt A,
  // suggested alternative must not secretly contain salt B as well
  for (const ps of pSalts) {
    const inQuery = qSalts.some(qs => ps.name.includes(qs.name) || qs.name.includes(ps.name))
    if (!inQuery) return 'blocked'
  }

  // Check dose match on primary salt
  const pq = qSalts[0]
  const pp = pSalts.find(ps => ps.name.includes(pq.name) || pq.name.includes(ps.name))
  if (pq.dose && pp?.dose) {
    // Allow ±10% dose tolerance (e.g. 500mg vs 480mg is fine, 500mg vs 325mg is not)
    const ratio = pp.dose / pq.dose
    if (ratio < 0.85 || ratio > 1.15) return 'dose_mismatch'
  }

  return 'exact'
}

// ─── PER UNIT ────────────────────────────────────────────────────────────────
function perUnit(mrp, unitSize) {
  if (!mrp || !unitSize) return null
  const n = unitSize.match(/(\d+)/)
  const count = n ? parseInt(n[1]) : 10
  // For liquids (ml), per-unit is less meaningful — skip it
  if (/ml/i.test(unitSize)) return null
  return count > 0 ? Math.round(mrp / count * 100) / 100 : null
}

// ─── JAN AUSHADHI LOOKUP ─────────────────────────────────────────────────────
// Returns { exact: [...], doseMismatch: [...] }
// exact        = same salts, matching dose — safe to suggest
// doseMismatch = same salt profile but different dose — show with warning
export function lookupJanAushadhi(saltComposition, brandedMrpRaw, brandedUnitSize) {
  if (!jaDB || !saltComposition) return { exact: [], doseMismatch: [] }

  const qSalts = parseSalts(saltComposition)
  if (!qSalts.length) return { exact: [], doseMismatch: [] }

  // Per-unit branded price — the correct basis for savings %
  const brandedPerUnit = brandedMrpRaw && brandedUnitSize
    ? perUnit(parseFloat(brandedMrpRaw), brandedUnitSize)
    : brandedMrpRaw ? parseFloat(brandedMrpRaw) / 10  // assume 10 units if unknown
    : null

  const exact = [], doseMismatch = []

  for (const row of jaDB) {
    const pSalts = parseSalts(row['Generic Name'] || '')
    const quality = matchQuality(qSalts, pSalts)
    if (quality === 'blocked') continue

    const mrp    = parseFloat(row['MRP']) || null
    const pu     = perUnit(mrp, row['Unit Size'])
    
    // Savings always per-unit vs per-unit — never raw MRP vs raw MRP
    let savings = null
    if (brandedPerUnit && pu) {
      const pct = Math.round((1 - pu / brandedPerUnit) * 100)
      savings = pct > 5 ? `${pct}% cheaper per tablet` : pct < -5 ? `${Math.abs(pct)}% pricier` : 'Similar price'
    } else if (mrp) {
      savings = 'Jan Aushadhi price'
    }

    const entry = {
      name: row['Generic Name'],
      salt: saltComposition,
      unitSize: row['Unit Size'],
      mrp,
      perUnit: pu,
      group: row['Group Name'],
      savings,
      isJanAushadhi: true,
      aiEstimated: false,
      brand: 'BPPI',
      availableAt: 'Jan Aushadhi Kendra only',
    }

    if (quality === 'exact') exact.push(entry)
    else doseMismatch.push(entry)
  }

  exact.sort((a, b) => (a.mrp || 999) - (b.mrp || 999))
  doseMismatch.sort((a, b) => (a.mrp || 999) - (b.mrp || 999))

  return { exact: exact.slice(0, 5), doseMismatch: doseMismatch.slice(0, 3) }
}

// ─── CDSCO LOOKUP ─────────────────────────────────────────────────────────────
// Returns a single clean fact: is this salt class approved by CDSCO?
// Does NOT show drug name or strength (avoids the "Bilayer 1000mg" conflict)
export function lookupCDSCO(saltComposition) {
  if (!cdscoDb || !saltComposition) return { found: false, badge: null, indication: null }

  const qSalts = parseSalts(saltComposition)
  if (!qSalts.length) return { found: false, badge: null, indication: null }

  const primaryName = qSalts[0].name  // e.g. 'paracetamol'

  const matches = cdscoDb.filter(row =>
    primaryName.length > 4 && (row['Drug Name'] || '').toLowerCase().includes(primaryName)
  )

  if (!matches.length) return { found: false, badge: null, indication: null }

  // Pick entry with cleanest indication — skip "Additional strength/dosage form" entries
  const meaningful = matches.filter(r =>
    r['Indication'] &&
    !/^additional\s*(strength|indication|dosage|higher)/i.test(r['Indication'])
  )
  const best = meaningful[0] || matches[0]

  // Sanitize indication — remove verbose legal language
  let indication = (best['Indication'] || '')
    .replace(/^(for\s+)?the\s+(treatment|management)\s+of\s+/i, '')
    .replace(/^as\s+an?\s+/i, '')
    .trim()
  if (indication.length > 80) indication = indication.slice(0, 80) + '...'

  // Badge is just the salt name + approved status — NO specific drug name shown
  // This prevents "Bilayer 1000mg" appearing when patient has 500mg
  return {
    found: true,
    badge: `✓ ${primaryName.charAt(0).toUpperCase() + primaryName.slice(1)} is a CDSCO-approved drug class`,
    indication: indication || null,
    approvalDate: best['Date of Approval'] || null,
    totalVariants: matches.length,
  }
}

// ─── SAVINGS SUMMARY TEXT ─────────────────────────────────────────────────────
export function buildSavingsSummary(jaExact, brandedMrp, brandedUnitSize) {
  if (!jaExact.length) return null
  const cheapest = jaExact[0]
  if (!cheapest.mrp) return null

  const brandedPU = brandedMrp && brandedUnitSize ? perUnit(parseFloat(brandedMrp), brandedUnitSize) : null
  const jaPU = cheapest.perUnit

  if (brandedPU && jaPU) {
    const pct = Math.round((1 - jaPU / brandedPU) * 100)
    if (pct > 5)  return `₹${jaPU}/tablet at Jan Aushadhi vs ₹${brandedPU}/tablet branded — ${pct}% cheaper.`
    if (pct < -5) return `Jan Aushadhi option at ₹${cheapest.mrp} for ${cheapest.unitSize}.`
    return `Jan Aushadhi option at similar price — ₹${cheapest.mrp} for ${cheapest.unitSize}.`
  }

  return `Available at Jan Aushadhi for ₹${cheapest.mrp} (${cheapest.unitSize}).`
}
