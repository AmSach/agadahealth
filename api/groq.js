/**
 * api/groq.js — Vercel serverless proxy for Groq API calls
 * Keys from env vars: GROQ_KEY_1, GROQ_KEY_2, GROQ_KEY_3, etc.
 */

const API_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
  process.env.GROQ_KEY,
].filter(Boolean)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  if (!API_KEYS.length) {
    res.status(500).json({ error: 'No GROQ_KEY_* configured in Vercel env vars' }); return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { res.status(400).json({ error: 'Invalid JSON' }); return }
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
    } catch { res.status(400).json({ error: 'Could not parse body' }); return }
  }

  const { model, max_tokens, temperature, messages } = body
  if (!model || !messages) {
    res.status(400).json({ error: 'Missing model or messages' }); return
  }

  const payload = { model, max_tokens: max_tokens || 1000, temperature: temperature ?? 0.1, messages }

  let lastError = 'Unknown error'
  
  for (const key of API_KEYS) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      
      const upstream = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      if (upstream.status === 429) { 
        lastError = 'Rate limited'
        continue 
      }
      if (upstream.status === 401) { 
        lastError = 'Invalid API key'
        continue 
      }

      const data = await upstream.json()
      res.status(upstream.status).json(data); return
    } catch (err) {
      lastError = err.message
      // Continue to next key on timeout/abort
      if (err.name === 'AbortError') continue
    }
  }

  res.status(500).json({ error: 'All keys failed', detail: lastError })
}
