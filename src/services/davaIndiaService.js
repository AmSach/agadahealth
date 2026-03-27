/**
 * davaIndiaService.js — client calls /api/prices (multi-source live price proxy)
 *
 * /api/prices tries DavaIndia → PharmEasy → NetMeds → Apollo → 1mg → MedPlus
 * in PARALLEL and returns the best-matched, cheapest result with source attribution.
 *
 * Rate-limit strategy:
 *   - batchFetch: max 4 parallel requests, rest queued
 *   - 10s timeout per call
 *   - 1 retry on network error
 */

const MAX_PARALLEL = 4   // keep well under Vercel/pharmacy rate limits

// ─── Single-item fetch ────────────────────────────────────────────────────────
export async function fetchLivePrice(saltOrName, attempt = 0) {
  if (!saltOrName) return null
  try {
    const url = `/api/prices?q=${encodeURIComponent(saltOrName)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data?.found) return null
    return {
      found:          true,
      name:           data.name,
      mrp:            data.mrp,
      packSize:       data.packSize  || null,
      perUnit:        data.perUnit   || null,
      priceSource:    data.priceSource || 'Live',
      highConfidence: true,
      allSources:     data.allSources || [],
    }
  } catch (err) {
    // One retry on transient error
    if (attempt === 0) {
      await new Promise(r => setTimeout(r, 400))
      return fetchLivePrice(saltOrName, 1)
    }
    return null
  }
}

// Keep the old export name so existing code doesn't break
export const fetchDavaIndiaPrice = fetchLivePrice

// ─── Batch fetch with concurrency cap ────────────────────────────────────────
export async function batchFetchDavaIndiaPrices(alts) {
  const map = new Map()
  if (!alts?.length) return map

  // Deduplicate queries by salt/name
  const unique = []
  const seen = new Set()
  for (const alt of alts) {
    const key = alt.salt || alt.name
    if (key && !seen.has(key)) { seen.add(key); unique.push({ key, alt }) }
  }

  // Process in chunks of MAX_PARALLEL
  for (let i = 0; i < unique.length; i += MAX_PARALLEL) {
    const chunk = unique.slice(i, i + MAX_PARALLEL)
    const results = await Promise.allSettled(
      chunk.map(({ key }) => fetchLivePrice(key))
    )
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value?.found) {
        map.set(chunk[idx].key, result.value)
      }
    })
    // Small gap between chunks to be polite to upstream APIs
    if (i + MAX_PARALLEL < unique.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return map
}
