/**
 * api/groq.js — Vercel serverless proxy for all Groq API calls
 * Keys live in server env vars (GROQ_KEY_1..5) — never sent to browser.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Parse body — Vercel doesn't always auto-parse JSON ───────────────────
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Invalid JSON body' }) }
  }
  if (!body || typeof body !== 'object') {
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = ''
        req.on('data', chunk => data += chunk)
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })
      body = JSON.parse(raw)
    } catch {
      return res.status(400).json({ error: 'Could not parse request body' })
    }
  }

  // ── Keys ─────────────────────────────────────────────────────────────────
  const API_KEYS = [
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
    process.env.GROQ_KEY,
  ].filter(Boolean)

  if (!API_KEYS.length) {
    return res.status(500).json({ error: 'No API keys configured. Add GROQ_KEY_1 (or GROQ_KEY) to Vercel environment variables.' })
  }

  const { model, max_tokens, temperature, messages, tools } = body

  if (!model || !messages) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' })
  }

  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

  let lastStatus = 500
  let lastBody = { error: 'All keys exhausted' }

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
        lastBody = await upstream.json().catch(() => ({ error: 'rate_limited' }))
        continue
      }

      if (upstream.status === 401) {
        lastBody = { error: 'invalid_key' }
        continue
      }

      const data = await upstream.json()
      return res.status(upstream.status).json(data)

    } catch (err) {
      lastBody = { error: 'proxy_fetch_error', detail: err.message }
    }
  }

  return res.status(lastStatus || 500).json(lastBody)
}
