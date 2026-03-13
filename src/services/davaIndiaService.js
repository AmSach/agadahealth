/**
 * davaIndiaService.js — client-side helper for DavaIndia pricing
 *
 * Calls our own Vercel proxy (/api/davaindia) which handles CORS + parsing.
 * Always resolves (never throws) — returns null on any failure so the app
 * degrades gracefully if DavaIndia is down on demo day.
 */

/**
 * Fetch the best-matching DavaIndia price for a given salt composition.
 * @param {string} saltComposition  e.g. "Amoxycillin 500mg + Clavulanate 125mg"
 * @returns {Promise<{found:boolean, mrp:number, packSize:string, perUnit:number|null, name:string, priceSource:'DavaIndia', highConfidence:true}|null>}
 */
export async function fetchDavaIndiaPrice(saltComposition) {
  if (!saltComposition) return null
  try {
    const url = `/api/davaindia?q=${encodeURIComponent(saltComposition)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.found) return null
    return data  // shape: { found, name, mrp, packSize, perUnit, priceSource, highConfidence }
  } catch {
    return null  // timeout, network error, proxy down — degrade silently
  }
}

/**
 * Batch-fetch DavaIndia prices for multiple alternatives in parallel.
 * Returns a Map keyed by the alt's salt string.
 * @param {Array<{salt:string, name:string}>} alts
 * @returns {Promise<Map<string, object>>}
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
