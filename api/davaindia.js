/**
 * api/davaindia.js — Vercel serverless price proxy
 *
 * Fetches ALL pharmacy sources IN PARALLEL, then picks the best match
 * across all results (highest relevance → cheapest).
 *
 * Sources: 1mg · DavaIndia · PharmEasy · NetMeds · Apollo
 *
 * KEY CHANGE vs old version: we no longer return on first hit.
 * All sources are queried simultaneously and the best real match wins.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (!q || q.length < 3) return res.status(400).json({ found: false, error: 'Query too short' })

  // Salt-only variant (strips dose) for broader search fallback
  const saltOnly = q.replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '').replace(/\s+/g, ' ').trim()

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en;q=0.9',
  }

  // ── Fetch all sources in parallel ────────────────────────────────────────
  const [mg1Results, davaResults, pharmEasyResults, netmedsResults, apolloResults] =
    await Promise.allSettled([

      // ── 1. 1mg (most comprehensive catalogue) ─────────────────────────────
      (async () => {
        // Try full query first, then salt-only
        for (const query of [q, saltOnly]) {
          try {
            const r = await fetch(
              `https://www.1mg.com/pharmacy_api_gateway/v4/drug_skus/search_by_name?name=${encodeURIComponent(query)}&page=1&per_page=15`,
              { headers: { ...HEADERS, 'Referer': 'https://www.1mg.com/' }, signal: AbortSignal.timeout(6000) }
            )
            if (!r.ok) continue
            const data = await r.json()
            // 1mg v4 structure
            const products = data?.data?.skus || data?.data?.products || data?.results || data?.skus || []
            const result = pickBest(normalize1mg(Array.isArray(products) ? products : []), q, '1mg')
            if (result) return result
          } catch {}
        }
        return null
      })(),

      // ── 2. DavaIndia ──────────────────────────────────────────────────────
      (async () => {
        for (const query of [q, saltOnly]) {
          try {
            const r = await fetch(
              `https://www.davaindia.com/api/v1/products/search?query=${encodeURIComponent(query)}&limit=15`,
              { headers: { ...HEADERS, 'Referer': 'https://www.davaindia.com/' }, signal: AbortSignal.timeout(6000) }
            )
            if (!r.ok) continue
            const data = await r.json()
            const products = data?.products || data?.data?.products || data?.results || data?.data || []
            const result = pickBest(Array.isArray(products) ? products : [], q, 'DavaIndia')
            if (result) return result
          } catch {}
        }
        return null
      })(),

      // ── 3. PharmEasy ──────────────────────────────────────────────────────
      (async () => {
        for (const query of [q, saltOnly]) {
          try {
            const r = await fetch(
              `https://pharmeasy.in/api/offer/search?name=${encodeURIComponent(query)}&page=1`,
              { headers: { ...HEADERS, 'Referer': 'https://pharmeasy.in/' }, signal: AbortSignal.timeout(6000) }
            )
            if (!r.ok) continue
            const data = await r.json()
            const products = data?.data?.productList || data?.products || []
            const result = pickBest(Array.isArray(products) ? products : [], q, 'PharmEasy')
            if (result) return result
          } catch {}
        }
        return null
      })(),

      // ── 4. NetMeds ────────────────────────────────────────────────────────
      (async () => {
        for (const query of [q, saltOnly]) {
          try {
            const r = await fetch(
              `https://www.netmeds.com/api/public/v1/catalog/search?q=${encodeURIComponent(query)}&page_size=15`,
              { headers: { ...HEADERS, 'Referer': 'https://www.netmeds.com/' }, signal: AbortSignal.timeout(6000) }
            )
            if (!r.ok) continue
            const data = await r.json()
            const products = data?.data?.product_suggestions || data?.products || []
            const result = pickBest(Array.isArray(products) ? products : [], q, 'NetMeds')
            if (result) return result
          } catch {}
        }
        return null
      })(),

      // ── 5. Apollo Pharmacy ────────────────────────────────────────────────
      (async () => {
        for (const query of [q, saltOnly]) {
          try {
            const r = await fetch(
              `https://www.apollopharmacy.in/api/Medicines/searchProducts?searchKey=${encodeURIComponent(query)}&pageNo=0&pageSize=15`,
              { headers: { ...HEADERS, 'Referer': 'https://www.apollopharmacy.in/' }, signal: AbortSignal.timeout(6000) }
            )
            if (!r.ok) continue
            const data = await r.json()
            const products = data?.data?.products || data?.products || []
            const result = pickBest(Array.isArray(products) ? products : [], q, 'Apollo')
            if (result) return result
          } catch {}
        }
        return null
      })(),
    ])

  // Collect all successful results with their relevance scores
  const allResults = [mg1Results, davaResults, pharmEasyResults, netmedsResults, apolloResults]
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)

  if (!allResults.length) {
    return res.status(200).json({ found: false, reason: 'no_results_from_any_source' })
  }

  // Pick the result with highest relevance across all sources.
  // If tied, prefer 1mg > DavaIndia > PharmEasy > NetMeds > Apollo (reliability order).
  const sourcePriority = { '1mg': 5, 'DavaIndia': 4, 'PharmEasy': 3, 'NetMeds': 2, 'Apollo': 1 }
  allResults.sort((a, b) =>
    (b._relevance || 0) - (a._relevance || 0) ||
    (sourcePriority[b.priceSource] || 0) - (sourcePriority[a.priceSource] || 0)
  )

  const best = allResults[0]
  // Clean up internal _relevance field before returning
  delete best._relevance

  return res.status(200).json(best)
}

/**
 * Normalize 1mg product fields to the common shape.
 * 1mg uses different field names from other pharmacies.
 */
function normalize1mg(products) {
  return products.map(p => ({
    name:             p.name || p.slug || '',
    salt_composition: p.salt_composition || p.composition || '',
    mrp:              p.price || p.mrp || p.max_price || 0,
    pack_size_label:  p.pack_size_label || p.pack_size || p.quantity || '',
  }))
}

/**
 * Pick the best matching product from a list.
 * Scores by how many query words appear in name/salt/composition.
 * Returns the top match WITH its relevance score attached (_relevance).
 * Returns null if nothing is relevant.
 */
function pickBest(products, query, source) {
  if (!products.length) return null

  // Build word list from full query (keep dose numbers too for precision matching)
  const qFull = query.toLowerCase()
  const qWords = qFull
    .split(/[\s,+\/]+/)
    .map(w => w.trim())
    .filter(w => w.length > 2)

  // Also build a dose-aware check: does the product name contain the same dose?
  const doseMatch = query.match(/(\d+\.?\d*)\s*(mg|mcg|g|iu|ml|%)/i)
  const doseStr = doseMatch ? doseMatch[0].toLowerCase().replace(/\s+/, '') : null

  const scored = products.map(p => {
    const name     = (p.name || p.product_name || p.title || p.medicineName || '').toLowerCase()
    const salt     = (p.salt_composition || p.composition || p.generic_name || p.saltComposition || p.salt || '').toLowerCase()
    const mrp      = parseFloat(p.mrp || p.price || p.selling_price || p.maxPrice || 0)
    const packSize = p.pack_size_label || p.pack_size || p.packSize || p.quantity || p.packageSize || ''

    if (!mrp || mrp <= 0) return null

    const nameHits = qWords.filter(w => name.includes(w)).length
    const saltHits = qWords.filter(w => salt.includes(w)).length

    // Bonus: exact dose appears in the product name (e.g. "500mg" in query AND "500mg" in product)
    const doseBonus = doseStr && name.replace(/\s+/g, '').includes(doseStr) ? 2 : 0

    const relevance = nameHits + saltHits * 1.5 + doseBonus
    if (relevance === 0) return null

    const countMatch = packSize.match(/(\d+)/)
    const count  = countMatch ? parseInt(countMatch[1]) : null
    const perUnit = count && count > 0 ? Math.round(mrp / count * 100) / 100 : null

    return {
      name:     p.name || p.product_name || p.title || p.medicineName || '',
      mrp,
      packSize,
      perUnit,
      relevance,
    }
  }).filter(Boolean)

  if (!scored.length) return null

  // Sort: highest relevance first, then cheapest
  scored.sort((a, b) => b.relevance - a.relevance || a.mrp - b.mrp)
  const best = scored[0]

  return {
    found:          true,
    name:           best.name,
    mrp:            best.mrp,
    packSize:       best.packSize || null,
    perUnit:        best.perUnit || null,
    priceSource:    source,
    highConfidence: true,
    _relevance:     best.relevance,   // internal — stripped before response
  }
}
