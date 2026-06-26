/**
 * davaIndiaService.js - live price fetcher using 1mg's public search API
 *
 * 1mg is the only major Indian pharmacy with CORS-open JSON search responses
 * that work directly from the browser with no proxy needed.
 *
 * DavaIndia/PharmEasy/Netmeds all block browser requests (no CORS headers).
 * 1mg's search endpoint returns JSON with Access-Control-Allow-Origin: *
 *
 * Flow: search by salt -> pick best match by relevance -> return price
 * Always resolves (never throws) - returns null on any failure.
 */

export async function fetchDavaIndiaPrice(saltComposition) {
  if (!saltComposition) return null
  try {
    const searchQuery = saltComposition
      .replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '')
      .replace(/\band\b|\+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (searchQuery.length < 2) return null

    const url = `/api/prices?q=${encodeURIComponent(searchQuery)}`

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!data || !data.found) return null

    return {
      found:          true,
      name:           data.name,
      mrp:            data.mrp,
      packSize:       data.packSize || null,
      perUnit:        data.perUnit  || null,
      productUrl:     data.url      || null,
      priceSource:    data.priceSource || 'Live Store',
      highConfidence: true,
    }
  } catch (err) {
    console.error("fetchDavaIndiaPrice failed:", err)
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
