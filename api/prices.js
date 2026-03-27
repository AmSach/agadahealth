/**
 * api/prices.js — Agada Real Price Engine v3
 *
 * Strategy (in priority order, run in parallel):
 *   1. SerpAPI Google Shopping India — most reliable, real prices
 *   2. DavaIndia public API
 *   3. PharmEasy public API
 *   4. 1mg prefix API
 *   5. Apollo Pharmacy API
 *   6. Groq AI with strict search grounding (last resort, no hallucination)
 *
 * Returns the BEST matched real price. Never returns AI-hallucinated prices.
 */

const SERP_KEY = process.env.SERPAPI_KEY   // set in Vercel env
const GROQ_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
  process.env.GROQ_KEY,
].filter(Boolean)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
}

const T = 8000  // 8s timeout per source

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (!q || q.length < 2) return res.status(400).json({ found: false, error: 'Query too short' })

  // Build query variants
  const saltOnly = q.replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '').replace(/\s+/g, ' ').trim()
  const brandOnly = q.split(/\s+/)[0]
  const saltDose = q  // full query with dose

  // ── Run all scrapers in parallel ──────────────────────────────────────────
  const [serp, davaindia, pharmeasy, onemg, apollo, netmeds] = await Promise.allSettled([
    SERP_KEY ? scrapeSerpAPI(q, saltOnly, brandOnly) : Promise.resolve(null),
    scrapeDavaIndia(q, saltOnly),
    scrapePharmEasy(q, saltOnly),
    scrape1mg(q, saltOnly, brandOnly),
    scrapeApollo(q, saltOnly),
    scrapeNetMeds(q, saltOnly),
  ])

  const allResults = [serp, davaindia, pharmeasy, onemg, apollo, netmeds]
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .flat()
    .filter(r => r?.found && r.mrp > 0)

  if (allResults.length > 0) {
    // Sort by confidence then price
    allResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || a.mrp - b.mrp)
    const best = allResults[0]
    return res.status(200).json({
      found: true,
      name: best.name,
      mrp: best.mrp,
      packSize: best.packSize || null,
      perUnit: best.perUnit || null,
      priceSource: best.priceSource,
      highConfidence: (best.confidence || 0) >= 70,
      aiEstimated: false,
      allSources: allResults.slice(0, 6).map(r => ({
        source: r.priceSource,
        name: r.name,
        mrp: r.mrp,
        packSize: r.packSize,
        perUnit: r.perUnit,
        confidence: r.confidence,
      })),
      query: q,
    })
  }

  // ── All scrapers failed — try Groq with STRICT no-hallucination prompt ────
  if (GROQ_KEYS.length) {
    const groqResult = await askGroqForRealPrice(q, saltOnly, brandOnly)
    if (groqResult?.found) {
      return res.status(200).json({ ...groqResult, query: q })
    }
  }

  return res.status(200).json({ found: false, reason: 'no_results_from_any_source', query: q })
}


// ─── SerpAPI Google Shopping India ─────────────────────────────────────────
async function scrapeSerpAPI(q, saltOnly, brandOnly) {
  // Try 3 query variants to maximise hit rate
  const queries = [
    `${q} price India pharmacy`,
    `${saltOnly} tablet price`,
    `${brandOnly} medicine price`,
  ]
  const results = []
  for (const query of queries) {
    try {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&location=India&hl=en&gl=in&google_domain=google.co.in&tbm=shop&api_key=${SERP_KEY}`
      const r = await fetch(url, { signal: AbortSignal.timeout(T) })
      if (!r.ok) continue
      const data = await r.json()

      // Shopping results
      const items = data?.shopping_results || data?.organic_results || []
      for (const item of items.slice(0, 5)) {
        const price = parsePrice(item.price || item.extracted_price)
        if (!price) continue
        const name = item.title || item.name || ''
        const relevance = scoreRelevance(name, q, saltOnly)
        if (relevance < 1) continue
        const packSize = extractPackSize(name + ' ' + (item.snippet || ''))
        const count = extractCount(packSize)
        results.push({
          found: true,
          name,
          mrp: price,
          packSize,
          perUnit: count ? Math.round(price / count * 100) / 100 : null,
          priceSource: 'Google Shopping',
          confidence: Math.min(95, 60 + relevance * 10),
        })
      }

      // Also parse knowledge panel / answer box if present
      const panel = data?.knowledge_graph || data?.answer_box
      if (panel?.price) {
        const price = parsePrice(panel.price)
        if (price) {
          results.push({
            found: true,
            name: panel.title || q,
            mrp: price,
            packSize: null,
            perUnit: null,
            priceSource: 'Google',
            confidence: 90,
          })
        }
      }

      if (results.length >= 3) break  // enough data, save quota
    } catch (e) {
      // continue
    }
  }
  return results
}


// ─── DavaIndia ───────────────────────────────────────────────────────────────
async function scrapeDavaIndia(q, saltOnly) {
  for (const query of [saltOnly, q]) {
    try {
      const r = await fetch(
        `https://www.davaindia.com/api/v1/products/search?query=${encodeURIComponent(query)}&limit=10`,
        { headers: { ...HEADERS, Referer: 'https://www.davaindia.com/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.products || data?.data?.products || data?.results || data?.data || []
      const hits = pickAll(Array.isArray(products) ? products : [], q, 'DavaIndia')
      if (hits.length) return hits
    } catch { /* try next */ }
  }
  return []
}


// ─── PharmEasy ───────────────────────────────────────────────────────────────
async function scrapePharmEasy(q, saltOnly) {
  for (const query of [saltOnly, q]) {
    try {
      const r = await fetch(
        `https://pharmeasy.in/api/offer/search?name=${encodeURIComponent(query)}&page=1&pageSize=10`,
        { headers: { ...HEADERS, Referer: 'https://pharmeasy.in/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.data?.productList || data?.products || []
      const hits = pickAll(Array.isArray(products) ? products : [], q, 'PharmEasy')
      if (hits.length) return hits
    } catch { /* try next */ }
  }
  return []
}


// ─── 1mg ─────────────────────────────────────────────────────────────────────
async function scrape1mg(q, saltOnly, brandOnly) {
  // Method 1: prefix API
  for (const query of [q, saltOnly, brandOnly]) {
    try {
      const r = await fetch(
        `https://www.1mg.com/pharmacy_api_gateway/v4/drug_skus/by_prefix?prefix=${encodeURIComponent(query)}&limit=10`,
        { headers: { ...HEADERS, Referer: 'https://www.1mg.com/', 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const suggestions = data?.suggestions || data?.data || []
      const mapped = suggestions.slice(0, 8).map(s => ({
        name: s.name || s.drug_name || '',
        mrp: parseFloat(s.price || s.mrp || s.selling_price || 0),
        pack_size_label: s.pack_size_label || s.pack_size || s.quantity || '',
        salt_composition: s.salt_composition || s.composition || '',
      }))
      const hits = pickAll(mapped, q, '1mg')
      if (hits.length) return hits
    } catch { /* try next */ }
  }

  // Method 2: parse __INITIAL_STATE__ from search page
  try {
    const r = await fetch(
      `https://www.1mg.com/search/all?name=${encodeURIComponent(saltOnly)}&page=1`,
      { headers: { ...HEADERS, Referer: 'https://www.1mg.com/' }, signal: AbortSignal.timeout(T) }
    )
    if (r.ok) {
      const html = await r.text()
      const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});\s*<\/script>/s)
      if (match) {
        const state = JSON.parse(match[1])
        const products = state?.search?.products || state?.listing?.products || []
        const hits = pickAll(products, q, '1mg')
        if (hits.length) return hits
      }
    }
  } catch { /* ignore */ }

  return []
}


// ─── Apollo Pharmacy ─────────────────────────────────────────────────────────
async function scrapeApollo(q, saltOnly) {
  for (const query of [saltOnly, q]) {
    try {
      // Apollo has a GraphQL + REST hybrid; try public search endpoint
      const r = await fetch(
        `https://www.apollopharmacy.in/api/Medicines/searchProducts?searchKey=${encodeURIComponent(query)}&pageNo=0&pageSize=10`,
        { headers: { ...HEADERS, Referer: 'https://www.apollopharmacy.in/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.data?.products || data?.products || []
      const hits = pickAll(Array.isArray(products) ? products : [], q, 'Apollo')
      if (hits.length) return hits
    } catch { /* try next */ }
  }
  return []
}


// ─── NetMeds ─────────────────────────────────────────────────────────────────
async function scrapeNetMeds(q, saltOnly) {
  for (const query of [saltOnly, q]) {
    try {
      const r = await fetch(
        `https://www.netmeds.com/api/public/v1/catalog/search?q=${encodeURIComponent(query)}&page_size=10&page_id=0`,
        { headers: { ...HEADERS, Referer: 'https://www.netmeds.com/' }, signal: AbortSignal.timeout(T) }
      )
      if (!r.ok) continue
      const data = await r.json()
      const products = data?.data?.product_suggestions || data?.data?.allopathy_list || data?.data?.products || data?.products || []
      const hits = pickAll(Array.isArray(products) ? products : [], q, 'NetMeds')
      if (hits.length) return hits
    } catch { /* try next */ }
  }
  return []
}


// ─── Groq last-resort (no hallucination mode) ─────────────────────────────
async function askGroqForRealPrice(q, saltOnly, brandOnly) {
  const prompt = `You are a medicine price lookup assistant for India.
Drug query: "${q}"
Salt: "${saltOnly}"
Brand (if given): "${brandOnly}"

Your task: Return the REAL Indian market price (MRP) for this medicine.
Rules:
- Only return a price if you are HIGHLY CONFIDENT it is accurate (±20% of actual MRP).
- Use your knowledge of Indian pharmacy prices from Netmeds, 1mg, Apollo, DavaIndia.
- Common Indian pharma manufacturers: Sun Pharma, Cipla, Dr Reddy's, Lupin, Mankind, Alkem.
- If you are NOT confident, return {"found":false}.
- Do NOT hallucinate. If unsure, say not found.
- Return ONLY JSON, no markdown.

Format: {"found":true,"name":"Brand Name Dose","mrp":50,"packSize":"10 tablets","perUnit":5,"priceSource":"AI (Groq)","confidence":70,"aiEstimated":true}
OR: {"found":false}`

  for (const key of GROQ_KEYS) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          temperature: 0.0,  // zero temperature = least hallucination
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (r.status === 429) continue
      if (!r.ok) continue
      const data = await r.json()
      const raw = data?.choices?.[0]?.message?.content || ''
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(cleaned)
      if (parsed?.found && parsed.mrp > 0 && (parsed.confidence || 0) >= 60) {
        return { ...parsed, highConfidence: false, aiEstimated: true }
      }
      return { found: false }
    } catch { continue }
  }
  return { found: false }
}


// ─── Universal helpers ────────────────────────────────────────────────────────

function parsePrice(val) {
  if (!val) return null
  const n = parseFloat(String(val).replace(/[₹,\s]/g, ''))
  return n > 0 ? n : null
}

function extractPackSize(text) {
  if (!text) return ''
  const m = text.match(/\b(\d+\s*(tablet|capsule|cap|tab|ml|strip|piece|vial|injection|inj|sachet|patch)s?\b)/i)
  return m ? m[0].trim() : ''
}

function extractCount(packSizeStr) {
  if (!packSizeStr) return null
  const m = packSizeStr.match(/(\d+)/)
  return m ? parseInt(m[1]) : null
}

function scoreRelevance(name, q, saltOnly) {
  const nameLow = (name || '').toLowerCase()
  const qClean = q.toLowerCase().replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '')
  const saltClean = saltOnly.toLowerCase()
  const qWords = qClean.split(/[\s,+\/&]+/).map(w => w.trim()).filter(w => w.length > 2)
  const sWords = saltClean.split(/[\s,+\/&]+/).map(w => w.trim()).filter(w => w.length > 2)
  let score = 0
  for (const w of [...new Set([...qWords, ...sWords])]) {
    if (nameLow.includes(w)) score++
  }
  return score
}

function pickAll(products, query, source) {
  if (!products?.length) return []
  const saltOnly = query.replace(/\d+\.?\d*\s*(mg|mcg|g|iu|ml|%)/gi, '').replace(/\s+/g, ' ').trim()
  const results = products.map(p => {
    const name = (p.name || p.product_name || p.title || p.medicineName || p.drugName || p.drug_name || p.productName || '').trim()
    const salt = (p.salt_composition || p.composition || p.generic_name || p.saltComposition || p.salt || '').toLowerCase()
    const mrp = parsePrice(p.mrp || p.price || p.selling_price || p.maxPrice || p.max_price || p.price_mrp || p.sellingPrice)
    const packSize = (p.pack_size_label || p.pack_size || p.packSize || p.quantity || p.packageSize || p.pack || '').toString()

    if (!mrp || !name) return null
    const relevance = scoreRelevance(name + ' ' + salt, query, saltOnly)
    if (relevance < 1) return null

    const count = extractCount(packSize)
    const perUnit = count ? Math.round(mrp / count * 100) / 100 : null

    return {
      found: true,
      name,
      mrp,
      packSize,
      perUnit,
      priceSource: source,
      confidence: Math.min(90, 50 + relevance * 10),
    }
  }).filter(Boolean)

  results.sort((a, b) => b.confidence - a.confidence || a.mrp - b.mrp)
  return results.slice(0, 3)
}
