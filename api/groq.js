/**
 * api/groq.js — Vercel serverless proxy for all Groq API calls
 *
 * WHY: VITE_ env vars are baked into the client bundle at build time and are
 * fully visible in the browser's Network tab and JS bundle. This proxy keeps
 * all API keys server-side only (no VITE_ prefix = never sent to client).
 *
 * Route: POST /api/groq
 * Body:  { model, max_tokens, temperature, messages }  (standard Groq/OpenAI shape)
 * Returns: Groq API response as-is
 *
 * Key rotation: tries GROQ_KEY_1 through GROQ_KEY_5, then GROQ_KEY (legacy).
 * On 429 (rate limit) it automatically tries the next key.
 */

module.exports = async function handler(req, res) {
  // CORS — allow our Vercel domain + localhost dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Collect keys — server-side only, NO VITE_ prefix
  const API_KEYS = [
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
    process.env.GROQ_KEY, // legacy single key fallback
  ].filter(Boolean)

  if (!API_KEYS.length) {
    return res.status(500).json({ error: 'No API keys configured on server.' })
  }

  const { model, max_tokens, temperature, messages, tools } = req.body || {}

  if (!model || !messages) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' })
  }

  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

  // Try each key in order — rotate on 429
  let lastStatus = 500
  let lastBody = null

  for (const key of API_KEYS) {
    try {
      const payload = { model, max_tokens: max_tokens || 1000, temperature: temperature ?? 0.1, messages }
      if (tools) payload.tools = tools

      const upstream = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      })

      lastStatus = upstream.status

      if (upstream.status === 429) {
        // Rate limited — try next key
        lastBody = await upstream.json().catch(() => ({ error: 'rate_limited' }))
        continue
      }

      if (upstream.status === 401) {
        // Bad key — try next
        lastBody = { error: 'invalid_key' }
        continue
      }

      // Any other response (success or model error) — return as-is
      const data = await upstream.json()
      return res.status(upstream.status).json(data)

    } catch (err) {
      lastBody = { error: 'proxy_error', detail: err.message }
    }
  }

  // All keys exhausted
  return res.status(lastStatus || 500).json(lastBody || { error: 'All API keys exhausted or rate limited.' })
}
