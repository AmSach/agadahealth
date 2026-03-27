/**
 * davaIndiaService.js — live price fetcher via /api/davaindia proxy
 *
 * Previous approach (direct 1mg browser fetch) was blocked — 1mg doesn't allow
 * cross-origin requests from browsers. We now call our own Vercel serverless
 * proxy at /api/davaindia which fetches server-side with no CORS issues.
 */

export async function fetchDavaIndiaPrice(saltComposition) {
  if (!saltComposition) return null
  try {
    const res = await fetch(`/api/davaindia?q=${encodeURIComponent(saltComposition)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.found) return null
    return {
      found:          true,
      name:           data.name,
      mrp:            data.mrp,
      packSize:       data.packSize  || null,
      perUnit:        data.perUnit   || null,
      priceSource:    'DavaIndia',
      highConfidence: true,
    }
  } catch {
    return null
  }
}

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
