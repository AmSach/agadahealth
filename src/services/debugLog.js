/**
 * debugLog.js — Agada AI Response Logger
 *
 * Stores every raw AI JSON response in localStorage keyed by timestamp.
 * Access at any time via: window.__agadaLogs()
 * Or open the in-app debug panel at /?debug=1
 *
 * Storage: localStorage['agada_logs'] — survives page refresh, cleared manually.
 * Limit: keeps last 100 entries (auto-trims oldest).
 */

const STORAGE_KEY = 'agada_logs'
const MAX_ENTRIES = 100

export function logAIResponse({ phase, prompt, rawResponse, parsed, salt, brand, durationMs }) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const entry = {
      id:          Date.now(),
      ts:          new Date().toISOString(),
      phase,           // 'vision' | 'description' | 'generics'
      salt:        salt || null,
      brand:       brand || null,
      durationMs:  durationMs || null,
      prompt:      prompt || null,
      rawResponse: rawResponse || null,
      parsed:      parsed || null,
      ok:          !!parsed,
    }
    existing.push(entry)
    // Trim to MAX_ENTRIES
    const trimmed = existing.slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.warn('[Agada] Log write failed:', e)
  }
}

export function getLogs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function clearLogs() {
  localStorage.removeItem(STORAGE_KEY)
  console.log('[Agada] Logs cleared.')
}

export function exportLogsJSON() {
  const logs = getLogs()
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `agada_logs_${new Date().toISOString().slice(0,10)}.json`
  a.click(); URL.revokeObjectURL(url)
}

// Global helpers accessible from browser console
if (typeof window !== 'undefined') {
  window.__agadaLogs   = getLogs
  window.__agadaClear  = clearLogs
  window.__agadaExport = exportLogsJSON
}
