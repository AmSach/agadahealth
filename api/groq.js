/**
 * api/groq.js — Vercel serverless proxy for Groq API
 *
 * Keeps GROQ API keys server-side only. The Android app and web client
 * call /api/groq instead of api.groq.com directly.
 *
 * Route: POST /api/groq
 * Body: standard Groq chat completion request JSON
 * Returns: standard Groq response JSON
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Collect API keys from env — supports up to 5
  const API_KEYS = [
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
    process.env.GROQ_KEY, // legacy single key
  ].filter(Boolean)

  if (!API_KEYS.length) {
    return res.status(500).json({ error: 'No Groq API keys configured on server.' })
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  // Key rotation — try each key until one works
  let lastError = 'unknown'
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i]
    try {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      })

      const data = await upstream.json()

      if (upstream.status === 429) {
        lastError = 'rate_limited'
        continue // try next key
      }

      if (upstream.status === 401) {
        lastError = 'invalid_key'
        continue // try next key
      }

      // Forward the response as-is
      return res.status(upstream.status).json(data)

    } catch (err) {
      lastError = err.message
      continue
    }
  }

  return res.status(429).json({
    error: 'All Groq API keys exhausted or rate-limited. Please retry.',
    detail: lastError,
  })
}
