/**
 * barcodeService.js — Agada Barcode / QR Reader
 *
 * Uses @zxing/library (loaded from CDN via dynamic import)
 * Reads QR codes and barcodes from medicine packaging
 * Indian medicine QR codes follow GS1 standard:
 *   01 = GTIN/product code
 *   10 = Batch number
 *   17 = Expiry date (YYMMDD)
 *   21 = Serial number
 */

let ZXing = null

async function getZXing() {
  if (ZXing) return ZXing
  // Dynamically import from CDN — only loaded when needed
  const module = await import('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm')
  ZXing = module
  return ZXing
}

/**
 * Attempt to read a barcode or QR code from an image file.
 * Returns null if nothing found — gracefully degrades, never throws to caller.
 *
 * @param {File} file - image file
 * @returns {Promise<BarcodeResult|null>}
 */
export async function readBarcode(file) {
  try {
    const { BrowserMultiFormatReader } = await getZXing()
    const reader = new BrowserMultiFormatReader()

    const imageUrl = URL.createObjectURL(file)
    try {
      const result = await reader.decodeFromImageUrl(imageUrl)
      URL.revokeObjectURL(imageUrl)

      if (!result?.text) return null

      const raw = result.text
      const parsed = parseGS1(raw) || parseQRText(raw)

      return {
        raw,
        format: result.getBarcodeFormat?.() || 'UNKNOWN',
        ...parsed,
      }
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  } catch {
    // Barcode not found or library failed — silent, not an error
    return null
  }
}

/**
 * Parse GS1 application identifiers from a QR/barcode string
 * GS1 format: (01)12345678901234(10)BATCH(17)260312(21)SERIAL
 * or without parens: 0112345678901234 10BATCH 17260312
 */
function parseGS1(raw) {
  if (!raw) return null

  const result = {}

  // Try parenthesized GS1 format: (01)...(10)...(17)...
  const parenFormat = raw.match(/\((\d{2})\)([^(]+)/g)
  if (parenFormat) {
    for (const chunk of parenFormat) {
      const m = chunk.match(/\((\d{2})\)(.+)/)
      if (!m) continue
      const [, ai, val] = m
      applyAI(result, ai, val.trim())
    }
    if (Object.keys(result).length > 0) return result
  }

  // Try raw GS1 numeric format
  const raw01 = raw.match(/^01(\d{14})/)
  if (raw01) {
    result.gtin = raw01[1]
    const rest = raw.slice(16)
    const batch = rest.match(/10([A-Z0-9]{1,20})/)
    if (batch) result.batchNumber = batch[1]
    const expiry = rest.match(/17(\d{6})/)
    if (expiry) result.expiryDate = formatExpiry(expiry[1])
    return result
  }

  return null
}

function applyAI(result, ai, val) {
  switch (ai) {
    case '01': result.gtin = val; break
    case '10': result.batchNumber = val; break
    case '17': result.expiryDate = formatExpiry(val); break
    case '21': result.serialNumber = val; break
    case '11': result.manufacturingDate = formatExpiry(val); break
    case '310': case '311': case '312': result.netWeight = val; break
  }
}

function formatExpiry(yymmdd) {
  if (!yymmdd || yymmdd.length < 6) return yymmdd
  const yy = yymmdd.slice(0, 2)
  const mm = yymmdd.slice(2, 4)
  const dd = yymmdd.slice(4, 6)
  const year = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`
  return `${dd}/${mm}/${year}`
}

/**
 * Fallback: try to extract useful info from plain text QR codes
 * Some Indian medicine QR codes are plain text with key:value pairs
 */
function parseQRText(raw) {
  if (!raw) return null
  const result = {}

  // Try key:value format
  const kvPairs = raw.split(/[;\n|,]/)
  for (const pair of kvPairs) {
    const [k, v] = pair.split(':').map(s => s.trim())
    if (!k || !v) continue
    const kl = k.toLowerCase()
    if (kl.includes('batch') || kl.includes('lot'))  result.batchNumber = v
    if (kl.includes('expir') || kl.includes('exp'))  result.expiryDate  = v
    if (kl.includes('mfg') || kl.includes('manuf'))  result.manufacturer = v
    if (kl.includes('drug') || kl.includes('brand') || kl.includes('product')) result.brandFromQR = v
    if (kl.includes('mrp') || kl.includes('price'))  result.mrpFromQR   = parseFloat(v)
    if (kl.includes('serial') || kl.includes('sr'))  result.serialNumber = v
  }

  // Check if expiry has passed
  if (result.expiryDate) {
    result.isExpired = isExpired(result.expiryDate)
  }

  return Object.keys(result).length > 0 ? result : null
}

function isExpired(dateStr) {
  try {
    // Handle DD/MM/YYYY or MM/YYYY
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      return d < new Date()
    }
    if (parts.length === 2) {
      const d = new Date(`${parts[1]}-${parts[0]}-01`)
      return d < new Date()
    }
  } catch { }
  return false
}
