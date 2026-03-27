/**
 * api/davaindia.js — backwards-compat alias for api/prices.js
 * All real logic lives in prices.js (multi-source parallel scraper).
 * This file stays for old callers; new code should call /api/prices directly.
 *
 * ORIGINAL api/davaindia.js — Vercel serverless price proxy
 *
 * Tries multiple Indian pharmacy APIs in order until one returns a price.
 * All calls are server-side — no CORS issues.
 *
 * Priority: DavaIndia → PharmEasy → NetMeds → not found
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (!q || q.length < 3) return res.status(400).json({ found: false, error: 'Query too short' })

  // Strip dose numbers for broader search: "Paracetamol 500mg" → "Paracetamol"
  const saltOnly = q.replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '').replace(/\s+/g, ' ').trim()

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en;q=0.9',
  }

  // ── 1. DavaIndia ──────────────────────────────────────────────────────────
  try {
    const urls = [
      `https://www.davaindia.com/api/v1/products/search?query=${encodeURIComponent(saltOnly)}&limit=10`,
      `https://www.davaindia.com/api/v1/products/search?query=${encodeURIComponent(q)}&limit=10`,
    ]
    for (const url of urls) {
      const r = await fetch(url, { headers: { ...HEADERS, 'Referer': 'https://www.davaindia.com/' }, signal: AbortSignal.timeout(6000) })
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.products || data?.data?.products || data?.results || data?.data || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'DavaIndia')
      if (result) return res.status(200).json(result)
    }
  } catch {}

  // ── 2. PharmEasy ──────────────────────────────────────────────────────────
  try {
    const r = await fetch(
      `https://pharmeasy.in/api/offer/search?name=${encodeURIComponent(saltOnly)}&page=1`,
      { headers: { ...HEADERS, 'Referer': 'https://pharmeasy.in/' }, signal: AbortSignal.timeout(6000) }
    )
    if (r.ok) {
      const data = await r.json()
      const products = data?.data?.productList || data?.products || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'PharmEasy')
      if (result) return res.status(200).json(result)
    }
  } catch {}

  // ── 3. NetMeds ────────────────────────────────────────────────────────────
  try {
    const r = await fetch(
      `https://www.netmeds.com/api/public/v1/catalog/search?q=${encodeURIComponent(saltOnly)}&page_size=10`,
      { headers: { ...HEADERS, 'Referer': 'https://www.netmeds.com/' }, signal: AbortSignal.timeout(6000) }
    )
    if (r.ok) {
      const data = await r.json()
      const products = data?.data?.product_suggestions || data?.products || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'NetMeds')
      if (result) return res.status(200).json(result)
    }
  } catch {}

  // ── 4. Apollo Pharmacy ────────────────────────────────────────────────────
  try {
    const r = await fetch(
      `https://www.apollopharmacy.in/api/Medicines/searchProducts?searchKey=${encodeURIComponent(saltOnly)}&pageNo=0&pageSize=10`,
      { headers: { ...HEADERS, 'Referer': 'https://www.apollopharmacy.in/' }, signal: AbortSignal.timeout(6000) }
    )
    if (r.ok) {
      const data = await r.json()
      const products = data?.data?.products || data?.products || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'Apollo')
      if (result) return res.status(200).json(result)
    }
  } catch {}

  return res.status(200).json({ found: false, reason: 'no_results_from_any_source' })
}

/**
 * Pick the best matching product from a list.
 * Scores by how many query words appear in name/salt, then picks cheapest among top matches.
 */
function pickBest(products, query, source) {
  if (!products.length) return null

  const qWords = query.toLowerCase()
    .replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '')
    .split(/\s+|and|\+/i)
    .map(w => w.trim())
    .filter(w => w.length > 3)

  const scored = products.map(p => {
    // Normalise field names across different pharmacy APIs
    const name     = p.name || p.product_name || p.title || p.medicineName || ''
    const salt     = p.salt_composition || p.composition || p.generic_name || p.saltComposition || p.salt || ''
    const mrp      = parseFloat(p.mrp || p.price || p.selling_price || p.maxPrice || 0)
    const packSize = p.pack_size_label || p.pack_size || p.packSize || p.quantity || p.packageSize || ''

    if (!mrp || mrp <= 0) return null

    const nameLow = name.toLowerCase()
    const saltLow = salt.toLowerCase()
    const nameHits = qWords.filter(w => nameLow.includes(w)).length
    const saltHits = qWords.filter(w => saltLow.includes(w)).length
    const relevance = nameHits + saltHits * 1.5
    if (relevance === 0) return null

    const countMatch = packSize.match(/(\d+)/)
    const count  = countMatch ? parseInt(countMatch[1]) : null
    const perUnit = count && count > 0 ? Math.round(mrp / count * 100) / 100 : null

    return { name, mrp, packSize, perUnit, relevance }
  }).filter(Boolean)

  if (!scored.length) return null

  scored.sort((a, b) => b.relevance - a.relevance || a.mrp - b.mrp)
  const best = scored[0]

  return {
    found: true,
    name: best.name,
    mrp: best.mrp,
    packSize: best.packSize || null,
    perUnit: best.perUnit || null,
    priceSource: source,
    highConfidence: true,
  }
}
