/**
 * debugLog.js — Server-side AI response logger
 *
 * POSTs every AI response to /api/log (Vercel serverless function).
 * Logs appear in: Vercel dashboard → your project → Functions → Logs
 * Users never see this. Nothing stored in browser.
 *
 * Fire-and-forget — never blocks the scan flow.
 */

export function logAIResponse({ phase, prompt, rawResponse, parsed, salt, brand, durationMs }) {
  // Fire and forget — do not await, do not let errors affect scan
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phase,
      salt:        salt        || null,
      brand:       brand       || null,
      durationMs:  durationMs  || null,
      rawResponse: rawResponse || null,
      parsed:      parsed      || null,
      ok:          !!parsed,
    }),
  }).catch(() => {}) // swallow all errors silently
}
