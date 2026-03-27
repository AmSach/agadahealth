/**
 * davaIndiaService.js — calls /api/prices (multi-source real-price engine)
 * Sources: SerpAPI Google Shopping India, DavaIndia, PharmEasy, 1mg, Apollo, NetMeds
 * Falls back to Groq with strict no-hallucination prompt.
 * Never returns aiEstimated prices in highConfidence mode.
 */

export async function fetchRealPrice(saltCompositionOrBrand) {
  if (!saltCompositionOrBrand) return null
  try {
    const res = await fetch(`/api/prices?q=${encodeURIComponent(saltCompositionOrBrand)}`, {
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.found || !data.mrp) return null
    return {
      found:          true,
      name:           data.name,
      mrp:            data.mrp,
      packSize:       data.packSize  || null,
      perUnit:        data.perUnit   || null,
      priceSource:    data.priceSource || 'Live',
      highConfidence: data.highConfidence ?? false,
      aiEstimated:    data.aiEstimated ?? false,
      allSources:     data.allSources || [],
    }
  } catch {
    return null
  }
}

// Legacy name — proxies to fetchRealPrice for backwards compat
export async function fetchDavaIndiaPrice(saltComposition) {
  return fetchRealPrice(saltComposition)
}

export async function batchFetchDavaIndiaPrices(alts) {
  const map = new Map()
  if (!alts?.length) return map

  // Run in parallel, max 4 at a time to avoid flooding
  const BATCH = 4
  for (let i = 0; i < alts.length; i += BATCH) {
    const chunk = alts.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      chunk.map(alt => fetchRealPrice(alt.salt || alt.name))
    )
    results.forEach((result, j) => {
      if (result.status === 'fulfilled' && result.value?.found) {
        const key = chunk[j].salt || chunk[j].name
        map.set(key, result.value)
      }
    })
  }
  return map
}
