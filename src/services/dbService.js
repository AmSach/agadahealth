/**
 * dbService.js — Agada Local Database Service
 *
 * Loads Jan Aushadhi and CDSCO CSVs from /public/data/
 * Does exact + fuzzy salt matching — zero AI involvement in results
 *
 * Jan Aushadhi CSV columns: Drug Code, Generic Name, Unit Size, MRP, Group Name
 * CDSCO CSV columns: Sr.No, Drug Name, Strength, Indication, Date of Approval
 */

let jaDB = null     // Jan Aushadhi rows
let cdscoDb = null  // CDSCO rows
let loadPromise = null

// ─── CSV PARSER ───────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []

  // Handle BOM
  if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1)

  const headers = parseCSVLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    if (vals.length === 0) continue
    const row = {}
    headers.forEach((h, idx) => { row[h.trim().replace(/^"/, '').replace(/"$/, '')] = (vals[idx] || '').trim().replace(/^"/, '').replace(/"$/, '') })
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

// ─── LOADER ────────────────────────────────────────────────────
async function loadDBs() {
  const [jaRes, cdscoRes] = await Promise.all([
    fetch('/data/jan_aushadhi.csv'),
    fetch('/data/cdsco.csv'),
  ])
  const [jaText, cdscoText] = await Promise.all([jaRes.text(), cdscoRes.text()])
  jaDB    = parseCSV(jaText)
  cdscoDb = parseCSV(cdscoText)
}

export async function ensureLoaded() {
  if (jaDB && cdscoDb) return
  if (!loadPromise) loadPromise = loadDBs()
  await loadPromise
}

// ─── SALT EXTRACTION ──────────────────────────────────────────
// Extract individual salt names from a compound string like
// "Paracetamol 500mg" → ["paracetamol"]
// "Amoxicillin 500mg and Clavulanate 125mg" → ["amoxicillin", "clavulanate"]
function extractSaltTokens(str) {
  if (!str) return []
  const lower = str.toLowerCase()
  // Remove dosage, form words, and common filler
  const cleaned = lower
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?)/gi, '')
    .replace(/\b(tablets?|capsules?|injection|syrup|cream|ointment|gel|drops?|spray|solution|suspension|powder|patch|lotion|liniment|suppository|inhaler|nasal|ear|eye|ip|bp|usp|nf|extended|sustained|modified|prolonged|release|sr|er|mr|xr|forte|plus|and|with|each|contains?|per)\b/gi, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.split(' ').filter(t => t.length > 3)
}

// Score how well a JA product matches a query salt string
function matchScore(genericName, querySalt) {
  const queryTokens  = extractSaltTokens(querySalt)
  const targetTokens = extractSaltTokens(genericName)
  if (queryTokens.length === 0) return 0

  let hits = 0
  for (const qt of queryTokens) {
    if (targetTokens.some(tt => tt.includes(qt) || qt.includes(tt))) hits++
  }

  // Exact substring match bonus
  const qLower = querySalt.toLowerCase()
  const gLower = genericName.toLowerCase()
  let bonus = 0
  if (gLower.includes(qLower)) bonus = 50
  else if (queryTokens.some(qt => gLower.includes(qt))) bonus = 20

  return (hits / queryTokens.length) * 100 + bonus
}

// ─── JAN AUSHADHI LOOKUP ──────────────────────────────────────
/**
 * Given a salt string from the scanned medicine (e.g. "Paracetamol 500mg"),
 * return the best-matching Jan Aushadhi alternatives, sorted by MRP ascending.
 *
 * Returns array of:
 * { name, salt, unitSize, mrp, perUnit, group, savingsVsBranded, isJanAushadhi }
 */
export function lookupJanAushadhi(saltComposition, brandedMrp = null) {
  if (!jaDB || !saltComposition) return []

  const scored = jaDB
    .map(row => ({
      row,
      score: matchScore(row['Generic Name'] || '', saltComposition),
    }))
    .filter(({ score }) => score >= 40)
    .sort((a, b) => {
      // Primary: score desc, secondary: MRP asc
      if (b.score !== a.score) return b.score - a.score
      return parseFloat(a.row['MRP'] || 999) - parseFloat(b.row['MRP'] || 999)
    })
    .slice(0, 8) // top 8 candidates

  // De-duplicate by similar name
  const seen = new Set()
  const results = []
  for (const { row, score } of scored) {
    const key = extractSaltTokens(row['Generic Name']).sort().join('-')
    if (seen.has(key)) continue
    seen.add(key)

    const mrp = parseFloat(row['MRP']) || null
    const unitSize = row['Unit Size'] || ''
    const units = parseUnitCount(unitSize)
    const perUnit = mrp && units ? Math.round((mrp / units) * 100) / 100 : null

    let savings = null
    if (brandedMrp && mrp) {
      const pct = Math.round((1 - mrp / brandedMrp) * 100)
      if (pct > 0) savings = `${pct}% cheaper`
    }

    results.push({
      name: row['Generic Name'],
      drugCode: row['Drug Code'],
      salt: saltComposition,
      unitSize,
      mrp,
      perUnit,
      group: row['Group Name'],
      savingsVsBranded: savings || 'Jan Aushadhi price',
      isJanAushadhi: true,
      brand: 'BPPI',
      score,
    })
  }

  return results.slice(0, 6)
}

function parseUnitCount(unitSize) {
  const m = unitSize.match(/(\d+)/)
  return m ? parseInt(m[1]) : null
}

// ─── CDSCO LOOKUP ──────────────────────────────────────────────
/**
 * Given a salt/drug name, check if it exists in the CDSCO registry.
 * Returns { found, entries, indication, approvalDate }
 */
export function lookupCDSCO(saltComposition, brandName) {
  if (!cdscoDb || (!saltComposition && !brandName)) {
    return { found: false, entries: [], indication: null, approvalDate: null }
  }

  const query = (saltComposition || brandName || '').toLowerCase()
  const queryTokens = extractSaltTokens(query)

  const matches = cdscoDb
    .filter(row => {
      const drugName = (row['Drug Name'] || '').toLowerCase()
      // Must match at least one primary salt token
      return queryTokens.some(t => t.length > 4 && drugName.includes(t))
    })
    .slice(0, 5)

  if (matches.length === 0) {
    return { found: false, entries: [], indication: null, approvalDate: null }
  }

  // Pick the best match
  const best = matches[0]
  return {
    found: true,
    entries: matches,
    drugName: best['Drug Name'],
    indication: best['Indication'] || null,
    approvalDate: best['Date of Approval'] || null,
    scheduleInfo: best['Strength'] || null,
  }
}

// ─── SAVINGS SUMMARY ──────────────────────────────────────────
export function buildSavingsSummary(jaResults, brandedMrp) {
  if (jaResults.length === 0) return null
  const cheapest = jaResults[0]
  if (!cheapest.mrp) return null

  if (brandedMrp) {
    const savings = Math.round((1 - cheapest.mrp / brandedMrp) * 100)
    return `Same medicine available at Jan Aushadhi for ₹${cheapest.mrp} vs ₹${brandedMrp} branded — ${savings}% cheaper.`
  }
  return `Available at Jan Aushadhi for just ₹${cheapest.mrp} (${cheapest.unitSize}).`
}
