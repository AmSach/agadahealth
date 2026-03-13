/**
 * api/log.js — Vercel Serverless Function (CommonJS)
 * POST /api/log
 * Logs appear in: Vercel dashboard → project → Functions → Logs
 * Users never see this.
 */
module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { phase, salt, brand, durationMs, rawResponse, parsed, ok } = req.body || {}
    console.log(JSON.stringify({
      t:      new Date().toISOString(),
      phase:  phase  || null,
      salt:   salt   || null,
      brand:  brand  || null,
      ms:     durationMs || null,
      ok:     !!ok,
      raw:    rawResponse ? String(rawResponse).slice(0, 2000) : null,
      parsed: parsed ? JSON.stringify(parsed).slice(0, 1000) : null,
    }))
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Log error:', e.message)
    res.status(500).json({ ok: false })
  }
}
