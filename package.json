/**
 * aiService.js (named geminiService.js for drop-in compatibility)
 *
 * Calls OpenRouter — NOT Google directly.
 * OpenRouter bypasses Indian-region Gemini quota blocks.
 *
 * Env var needed in Vercel: VITE_OPENROUTER_KEY_1
 * Get free key at: openrouter.ai → Sign up → Keys → Create Key
 */

const API_KEYS = [
  import.meta.env.VITE_OPENROUTER_KEY_1,
  import.meta.env.VITE_OPENROUTER_KEY_2,
  import.meta.env.VITE_OPENROUTER_KEY_3,
].filter(Boolean)

let keyIndex = 0
const nextKey = () => { const k = API_KEYS[keyIndex]; keyIndex = (keyIndex + 1) % API_KEYS.length; return k }

const PROMPT = `You are Agada, an Indian medicine information assistant.
A user has photographed a medicine strip. Analyse the image carefully.

Return ONLY a valid JSON object. No markdown, no backticks, no text before or after. Raw JSON only.

{
  "brandName": "exact brand name as printed",
  "saltComposition": "active ingredient and dosage e.g. Paracetamol 500mg",
  "manufacturer": "manufacturer name or null",
  "dosage": "strength e.g. 500mg",
  "mrp": null,

  "authenticity": {
    "status": "LIKELY_GENUINE or LIKELY_FAKE or CANNOT_DETERMINE",
    "reason": "one sentence — what visual cues led to this conclusion",
    "cdscoBadge": "one sentence — whether this salt/brand is consistent with known CDSCO-approved categories",
    "warning": "one sentence practical warning or null"
  },

  "medicineInfo": {
    "whatItDoes": "1-2 plain English sentences a Class 8 student can understand",
    "commonUses": ["condition 1", "condition 2", "condition 3"],
    "isOTC": true,
    "prescriptionRequired": false,
    "importantWarnings": ["warning 1", "warning 2", "warning 3"],
    "doNotTakeWith": "key interactions or null"
  },

  "alternatives": {
    "hasGenerics": true,
    "janAushadhiAvailable": true,
    "topAlternatives": [
      {
        "name": "Jan Aushadhi product name",
        "salt": "active ingredient",
        "estimatedMrp": 3,
        "savingsVsBranded": "91% cheaper"
      }
    ],
    "savingsSummary": "one punchy sentence e.g. Same medicine available at Jan Aushadhi for Rs.2.50 vs Rs.30 branded.",
    "whereToFind": "Jan Aushadhi Kendras — janaushadhi.gov.in or call 1800-180-8080 (free)"
  },

  "confidence": 85,
  "cannotRead": false,
  "cannotReadReason": null
}

Rules:
- cannotRead: true if image is too blurry, dark, or unreadable
- Never invent a brand name
- Jan Aushadhi reference prices: paracetamol ~Rs.2-3/tablet, metformin ~Rs.0.30/tablet, azithromycin ~Rs.7/tablet, amoxicillin ~Rs.1.80/capsule, atorvastatin ~Rs.1/tablet
- Plain language always. No jargon.`

export async function scanMedicine(imageBase64, mimeType = 'image/jpeg') {
  if (API_KEYS.length === 0) {
    throw new Error('API key not configured. Add VITE_OPENROUTER_KEY_1 in Vercel → Settings → Environment Variables.')
  }

  const body = {
    model: 'google/gemini-2.0-flash-exp:free',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
      ]
    }],
    max_tokens: 1500,
    temperature: 0.1,
  }

  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    const key = nextKey()

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://agada.vercel.app',
        'X-Title': 'Agada',
      },
      body: JSON.stringify(body),
    })

    if (res.status === 429) continue

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (res.status === 401) throw new Error('OpenRouter key invalid. Check VITE_OPENROUTER_KEY_1 in Vercel.')
      if (res.status === 400) throw new Error('Could not process image. Try a clearer photo.')
      throw new Error(err?.error?.message || `Error ${res.status}`)
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (!text) throw new Error('No response. Please try again.')

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      return JSON.parse(cleaned)
    } catch {
      throw new Error('Could not parse AI response. Please try again.')
    }
  }

  throw new Error('Service busy. Please try again in a moment.')
}

export async function compressAndEncode(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const MAX = 1024
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height / width * MAX); width = MAX }
        else { width = Math.round(width / height * MAX); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.82)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}
