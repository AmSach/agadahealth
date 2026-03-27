/**
 * api/prices.js — Agada multi-source live price scraper
 *
 * Sources tried in parallel (fast wins):
 *   1. DavaIndia API
 *   2. PharmEasy API
 *   3. NetMeds API
 *   4. Apollo Pharmacy API
 *   5. 1mg search API
 *   6. MedPlusMart API
 *
 * All are server-side — zero CORS issues.
 * Returns the LOWEST matched price found across all sources.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (!q || q.length < 2) return res.status(400).json({ found: false, error: 'Query too short' })

  // Strip dose for broader matching: "Cabergoline 0.25mg" → "Cabergoline"
  const saltOnly = q.replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '').replace(/\s+/g, ' ').trim()
  // Brand-only (first word): "Cabgolin 0.25mg" → "Cabgolin"
  const brandOnly = q.split(/\s+/)[0]

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Cache-Control': 'no-cache',
  }

  const T = 7000 // 7s per source timeout

  // ─── Run all scrapers in parallel ─────────────────────────────────────────
  const [davaindia, pharmeasy, netmeds, apollo, onemg, medplus] = await Promise.allSettled([
    scrapeDavaIndia(q, saltOnly, HEADERS, T),
    scrapePharmEasy(q, saltOnly, HEADERS, T),
    scrapeNetMeds(q, saltOnly, HEADERS, T),
    scrapeApollo(q, saltOnly, HEADERS, T),
    scrape1mg(q, saltOnly, brandOnly, HEADERS, T),
    scrapeMedPlus(q, saltOnly, HEADERS, T),
  ])

  const allResults = [davaindia, pharmeasy, netmeds, apollo, onemg, medplus]
    .map(r => (r.status === 'fulfilled' ? r.value : null))
    .filter(r => r?.found && r.mrp > 0)

  if (!allResults.length) {
    return res.status(200).json({ found: false, reason: 'no_results_from_any_source', query: q })
  }

  // Sort by relevance first, then mrp ascending (cheapest real match wins)
  allResults.sort((a, b) => b.relevance - a.relevance || a.mrp - b.mrp)

  // Return top result plus all sources for UI display
  const best = allResults[0]
  const allSources = allResults.map(r => ({
    source: r.priceSource,
    name: r.name,
    mrp: r.mrp,
    packSize: r.packSize,
    perUnit: r.perUnit,
  }))

  return res.status(200).json({
    found: true,
    name: best.name,
    mrp: best.mrp,
    packSize: best.packSize || null,
    perUnit: best.perUnit || null,
    priceSource: best.priceSource,
    highConfidence: true,
    allSources,
    query: q,
  })
}

// ─── DavaIndia ────────────────────────────────────────────────────────────────
async function scrapeDavaIndia(q, saltOnly, HEADERS, T) {
  const queries = [saltOnly, q]
  for (const query of queries) {
    try {
      const r = await fetch(
        `https://www.davaindia.com/api/v1/products/search?query=${encodeURIComponent(query)}&limit=15`,
        { headers: { ...HEADERS, Referer: 'https://www.davaindia.com/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.products || data?.data?.products || data?.results || data?.data || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'DavaIndia')
      if (result) return result
    } catch { /* try next */ }
  }
  return null
}

// ─── PharmEasy ────────────────────────────────────────────────────────────────
async function scrapePharmEasy(q, saltOnly, HEADERS, T) {
  const queries = [saltOnly, q]
  for (const query of queries) {
    try {
      const r = await fetch(
        `https://pharmeasy.in/api/offer/search?name=${encodeURIComponent(query)}&page=1&pageSize=15`,
        { headers: { ...HEADERS, Referer: 'https://pharmeasy.in/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.data?.productList || data?.products || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'PharmEasy')
      if (result) return result
    } catch { /* try next */ }
  }
  return null
}

// ─── NetMeds ──────────────────────────────────────────────────────────────────
async function scrapeNetMeds(q, saltOnly, HEADERS, T) {
  const queries = [saltOnly, q]
  for (const query of queries) {
    try {
      // Try the catalog/search API
      const r = await fetch(
        `https://www.netmeds.com/api/public/v1/catalog/search?q=${encodeURIComponent(query)}&page_size=15&page_id=0`,
        { headers: { ...HEADERS, Referer: 'https://www.netmeds.com/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.data?.product_suggestions
        || data?.data?.allopathy_list
        || data?.data?.products
        || data?.products
        || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'NetMeds')
      if (result) return result
    } catch { /* try next */ }
  }
  return null
}

// ─── Apollo Pharmacy ──────────────────────────────────────────────────────────
async function scrapeApollo(q, saltOnly, HEADERS, T) {
  const queries = [saltOnly, q]
  for (const query of queries) {
    try {
      // Try the public search API (no auth required for basic search)
      const r = await fetch(
        `https://www.apollopharmacy.in/api/Medicines/searchProducts?searchKey=${encodeURIComponent(query)}&pageNo=0&pageSize=15`,
        { headers: { ...HEADERS, Referer: 'https://www.apollopharmacy.in/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.data?.products || data?.products || []
      const result = pickBest(Array.isArray(products) ? products : [], q, 'Apollo')
      if (result) return result
    } catch { /* try next */ }
  }
  return null
}

// ─── 1mg ──────────────────────────────────────────────────────────────────────
async function scrape1mg(q, saltOnly, brandOnly, HEADERS, T) {
  // 1mg has a public search endpoint
  const queries = [q, saltOnly, brandOnly]
  for (const query of queries) {
    try {
      const r = await fetch(
        `https://www.1mg.com/pharmacy_api_gateway/v4/drug_skus/by_prefix?prefix=${encodeURIComponent(query)}&limit=15`,
        {
          headers: {
            ...HEADERS,
            Referer: 'https://www.1mg.com/',
            'X-Requested-With': 'XMLHttpRequest',
          },
          signal: AbortSignal.timeout(T),
        }
      )
      if (!r.ok) continue
      const data = await r.json()
      // 1mg returns { suggestions: [ { name, sku_id, ... } ] }
      // We then fetch details for the top suggestion
      const suggestions = data?.suggestions || data?.data || []
      if (!suggestions.length) continue

      // Map 1mg suggestion fields to standard shape
      const mapped = suggestions.slice(0, 10).map(s => ({
        name: s.name || s.drug_name || '',
        mrp: parseFloat(s.price || s.mrp || s.selling_price || 0),
        pack_size_label: s.pack_size_label || s.pack_size || s.quantity || '',
        salt_composition: s.salt_composition || s.composition || '',
      }))
      const result = pickBest(mapped, q, '1mg')
      if (result) return result
    } catch { /* try next */ }
  }

  // Fallback: try the public search page API
  try {
    const r = await fetch(
      `https://www.1mg.com/search/all?name=${encodeURIComponent(saltOnly)}&page=1`,
      {
        headers: { ...HEADERS, Referer: 'https://www.1mg.com/' },
        signal: AbortSignal.timeout(T),
      }
    )
    if (r.ok) {
      // Parse JSON-LD or embedded JSON from HTML
      const html = await r.text()
      // 1mg embeds product data in window.__INITIAL_STATE__
      const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});\s*<\/script>/s)
      if (match) {
        try {
          const state = JSON.parse(match[1])
          const products = state?.search?.products || state?.listing?.products || []
          const result = pickBest(products, q, '1mg')
          if (result) return result
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return null
}

// ─── MedPlusMart ──────────────────────────────────────────────────────────────
async function scrapeMedPlus(q, saltOnly, HEADERS, T) {
  try {
    const r = await fetch(
      `https://www.medplusmart.com/product/search?keyword=${encodeURIComponent(saltOnly)}&page=1&pageSize=15`,
      { headers: { ...HEADERS, Referer: 'https://www.medplusmart.com/' }, signal: AbortSignal.timeout(T) }
    )
    if (!r.ok) return null
    const data = await r.json()
    const products = data?.data?.productList || data?.products || data?.result || []
    return pickBest(Array.isArray(products) ? products : [], q, 'MedPlus')
  } catch {
    return null
  }
}

// ─── Universal product scorer / picker ────────────────────────────────────────
/**
 * Normalises field names across different pharmacy API shapes,
 * scores by query-word overlap, picks cheapest among top matches.
 */
function pickBest(products, query, source) {
  if (!products || !products.length) return null

  // Build word set from query (ignore dose numbers)
  const qClean = query.toLowerCase().replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '')
  const qWords = qClean.split(/[\s,+\/&]+/).map(w => w.trim()).filter(w => w.length > 2)

  const scored = products.map(p => {
    // ── Normalise field names ──────────────────────────────────────────────
    const name = (
      p.name || p.product_name || p.title || p.medicineName ||
      p.drugName || p.drug_name || p.productName || ''
    ).trim()

    const salt = (
      p.salt_composition || p.composition || p.generic_name ||
      p.saltComposition || p.salt || p.ingredients || ''
    ).toLowerCase()

    // Price: prefer mrp over selling price
    const mrp = parseFloat(
      p.mrp || p.price || p.selling_price || p.maxPrice ||
      p.max_price || p.price_mrp || p.sellingPrice || 0
    )

    const packSize = (
      p.pack_size_label || p.pack_size || p.packSize ||
      p.quantity || p.packageSize || p.pack || ''
    ).toString()

    if (!mrp || mrp <= 0 || !name) return null

    // ── Relevance scoring ─────────────────────────────────────────────────
    const nameLow = name.toLowerCase()
    const nameHits = qWords.filter(w => nameLow.includes(w)).length
    const saltHits = qWords.filter(w => salt.includes(w)).length
    // Exact first-word match (brand name) gets a big boost
    const brandBoost = nameLow.startsWith(qWords[0] || '') ? 2 : 0
    const relevance = nameHits * 1.0 + saltHits * 1.5 + brandBoost

    if (relevance === 0) return null

    // ── Per-unit price ─────────────────────────────────────────────────────
    const countMatch = packSize.match(/(\d+)/)
    const count = countMatch ? parseInt(countMatch[1]) : null
    const perUnit = count && count > 0 ? Math.round(mrp / count * 100) / 100 : null

    return { name, mrp, packSize, perUnit, relevance, priceSource: source, found: true }
  }).filter(Boolean)

  if (!scored.length) return null

  // Sort: highest relevance first, then cheapest
  scored.sort((a, b) => b.relevance - a.relevance || a.mrp - b.mrp)
  return scored[0]
}
