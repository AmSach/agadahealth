/**
 * api/log.js — Vercel Serverless Function
 * POST /api/log
 *
 * Receives AI response logs from the frontend and writes them to
 * Vercel's server-side console (visible in Vercel → Functions → Logs).
 * Never stored client-side. User never sees this.
 *
 * To view: Vercel dashboard → your project → Functions tab → click any function → Logs
 */
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { phase, salt, brand, durationMs, rawResponse, parsed, ok } = req.body || {}

    // Structured log — shows in Vercel Functions logs
    console.log(JSON.stringify({
      t:      new Date().toISOString(),
      phase,
      salt:   salt  || null,
      brand:  brand || null,
      ms:     durationMs || null,
      ok:     !!ok,
      raw:    rawResponse ? rawResponse.slice(0, 2000) : null,
      parsed: parsed ? JSON.stringify(parsed).slice(0, 1000) : null,
    }))

    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Log handler error:', e)
    res.status(500).json({ ok: false })
  }
}
