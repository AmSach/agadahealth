/**
 * davaIndiaService.js — live price fetcher using 1mg's public search API
 *
 * 1mg is the only major Indian pharmacy with CORS-open JSON search responses
 * that work directly from the browser with no proxy needed.
 *
 * DavaIndia/PharmEasy/Netmeds all block browser requests (no CORS headers).
 * 1mg's search endpoint returns JSON with Access-Control-Allow-Origin: *
 *
 * Flow: search by salt -> pick best match by relevance -> return price
 * Always resolves (never throws) — returns null on any failure.
 */

const ONEMG_SEARCH = 'https://www.1mg.com/pharmacy_api_gateway/v4/drugs/search_by_name'

/**
 * Fetch the best-matching live price for a given salt composition from 1mg.
 * @param {string} saltComposition  e.g. "Flunarizine 10mg"
 * @returns {Promise<{found, name, mrp, packSize, perUnit, priceSource, highConfidence}|null>}
 */
export async function fetchDavaIndiaPrice(saltComposition) {
  if (!saltComposition) return null
  try {
    // Strip dose numbers for the search query
    // "Flunarizine 10mg" -> "Flunarizine"
    // "Amoxycillin 500mg + Clavulanate 125mg" -> "Amoxycillin Clavulanate"
    const searchQuery = saltComposition
      .replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '')
      .replace(/\band\b|\+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const url = `${ONEMG_SEARCH}?name=${encodeURIComponent(searchQuery)}&per_page=10&page=1`

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    const data = await res.json()
    // 1mg response: { data: { attributes: { records: [...] } } }
    const records = data?.data?.attributes?.records
      || data?.records
      || data?.data
      || []

    if (!Array.isArray(records) || !records.length) return null

    // Score each result by how well it matches the salt query
    const qWords = saltComposition
      .toLowerCase()
      .replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '')
      .split(/\s+|\band\b|\+/i)
      .map(w => w.trim())
      .filter(w => w.length > 3)

    const scored = records
      .map(r => {
        const nameLower  = (r.name || '').toLowerCase()
        const saltLower  = (r.salt_aliases || r.composition || r.salt || '').toLowerCase()
        const mrp        = parseFloat(r.mrp || r.price) || 0
        const packSize   = r.pack_size_label || r.pack_size || r.form || ''
        const countMatch = packSize.match(/(\d+)/)
        const count      = countMatch ? parseInt(countMatch[1]) : null
        const perUnit    = (count && count > 0 && mrp > 0)
          ? Math.round(mrp / count * 100) / 100
          : null

        const nameHits = qWords.filter(w => nameLower.includes(w)).length
        const saltHits = qWords.filter(w => saltLower.includes(w)).length
        const relevance = nameHits + saltHits * 1.5

        return {
          name:     r.name,
          mrp,
          packSize,
          perUnit,
          relevance,
          url: r.slug ? `https://www.1mg.com/drugs/${r.slug}` : null,
        }
      })
      .filter(r => r.mrp > 0 && r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance || a.mrp - b.mrp)

    if (!scored.length) return null

    const best = scored[0]
    return {
      found:          true,
      name:           best.name,
      mrp:            best.mrp,
      packSize:       best.packSize || null,
      perUnit:        best.perUnit  || null,
      productUrl:     best.url      || null,
      priceSource:    '1mg',
      highConfidence: true,
    }

  } catch {
    return null
  }
}

/**
 * Batch-fetch prices for multiple alternatives in parallel.
 * Returns a Map keyed by the alt's salt string.
 */
export async function batchFetchDavaIndiaPrices(alts) {
  const map = new Map()
  if (!alts?.length) return map

  const results = await Promise.allSettled(
    alts.map(alt => fetchDavaIndiaPrice(alt.salt || alt.name))
  )

  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value?.found) {
      const key = alts[i].salt || alts[i].name
      map.set(key, result.value)
    }
  })

  return map
}
