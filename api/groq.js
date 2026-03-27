/**
 * api/groq.js — Vercel serverless proxy for all Groq API calls
 * Keys live in server env vars (GROQ_KEY_1..5) — never sent to browser.
 */

module.exports = async function handler(req, res) {
  try {
    await _handler(req, res)
  } catch (e) {
    console.error('groq proxy crashed:', e)
    res.status(500).json({ error: 'Internal server error', detail: e.message })
  }
}

async function _handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Parse body ────────────────────────────────────────────────────────────
  // Vercel may or may not auto-parse JSON depending on runtime version.
  // We handle all cases: already-parsed object, raw string, or stream.
  let body = req.body

  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { return res.status(400).json({ error: 'Invalid JSON body' }) }
  }

  if (!body || typeof body !== 'object') {
    // Read raw stream
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

  // ── Keys ──────────────────────────────────────────────────────────────────
  const API_KEYS = [
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
    process.env.GROQ_KEY,
  ].filter(Boolean)

  if (!API_KEYS.length) {
    return res.status(500).json({
      error: 'No API keys configured.',
      fix: 'Add GROQ_KEY_1 to Vercel Environment Variables (Settings → Environment Variables). Do NOT use VITE_ prefix.'
    })
  }

  const { model, max_tokens, temperature, messages, tools } = body
  if (!model || !messages) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' })
  }

  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
  let lastStatus = 500
  let lastBody = { error: 'All keys exhausted or rate-limited' }

  for (const key of API_KEYS) {
    try {
      const payload = {
        model,
        max_tokens: max_tokens || 1000,
        temperature: temperature ?? 0.1,
        messages,
      }
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
        continue // try next key
      }
      if (upstream.status === 401) {
        lastBody = { error: 'Invalid API key — check GROQ_KEY_1 value in Vercel' }
        continue
      }

      const data = await upstream.json()
      return res.status(upstream.status).json(data)

    } catch (err) {
      lastStatus = 500
      lastBody = { error: 'proxy_fetch_error', detail: err.message }
      // Don't continue on network errors — likely a timeout
      break
    }
  }

  return res.status(lastStatus).json(lastBody)
}