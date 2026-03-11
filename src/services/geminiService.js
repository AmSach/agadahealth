/**
 * geminiService.js
 *
 * One API call. Does everything:
 *   - Reads the medicine strip photo
 *   - Checks if it looks legitimate (brand, manufacturer, registration cues)
 *   - Explains what the medicine does in plain language
 *   - Suggests cheaper Jan Aushadhi generics with estimated prices
 *
 * We use the Gemini REST API directly (no SDK) so there are zero npm
 * dependencies beyond React itself. This is why the build can't fail
 * due to a missing package.
 *
 * API key: stored in Vercel environment variables as VITE_GEMINI_API_KEY.
 * It is never committed to the repo. It lives only in Vercel's servers.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

const PROMPT = `You are Agada, an Indian medicine information assistant. 
A user has photographed a medicine strip. Analyse the image carefully.

Return ONLY a valid JSON object — no markdown, no backticks, no explanation before or after. Just the raw JSON.

{
  "brandName": "exact brand name as printed on the strip",
  "saltComposition": "active ingredient(s) and dosage exactly as printed, e.g. Paracetamol 500mg",
  "manufacturer": "manufacturer name as printed, or null if not visible",
  "dosage": "strength as printed, e.g. 500mg",
  "mrp": "MRP in rupees as a number if visible, else null",
  
  "authenticity": {
    "status": "LIKELY_GENUINE or LIKELY_FAKE or CANNOT_DETERMINE",
    "reason": "One sentence explanation. For LIKELY_GENUINE: what legitimate cues you see (manufacturer name, professional labelling, registered-looking batch format). For LIKELY_FAKE: specific red flags. For CANNOT_DETERMINE: what is unclear.",
    "cdscoBadge": "Mention that this medicine's salt/brand appears in publicly known CDSCO approved drug categories if true, or flag if the combination seems unusual",
    "warning": "A practical one-sentence warning the user should act on, or null if not needed"
  },

  "medicineInfo": {
    "whatItDoes": "1-2 sentences in very plain language. Example: This medicine reduces fever and relieves mild pain like headaches or body aches.",
    "commonUses": ["up to 4 common conditions it treats, as short phrases"],
    "isOTC": true or false,
    "prescriptionRequired": true or false,
    "importantWarnings": ["up to 3 key warnings in plain language, short phrases"],
    "doNotTakeWith": "brief note on key interactions or contraindications, or null"
  },

  "alternatives": {
    "hasGenerics": true or false,
    "janAushadhiAvailable": true or false,
    "topAlternatives": [
      {
        "name": "Jan Aushadhi generic product name",
        "salt": "same active ingredient",
        "estimatedMrp": "estimated price in rupees as a number, based on known Jan Aushadhi pricing",
        "savingsVsBranded": "estimated % savings vs branded if MRP was visible, else approximate savings description"
      }
    ],
    "savingsSummary": "One punchy sentence about the savings available, e.g. The same paracetamol is available at Jan Aushadhi for around Rs.2.50 vs Rs.30 branded.",
    "whereToFind": "Jan Aushadhi Kendras. Search at janaushadhi.gov.in or call 1800-180-8080 (free)."
  },

  "confidence": 85,
  "cannotRead": false,
  "cannotReadReason": null
}

Rules:
- If the image is too blurry or dark to read, set cannotRead: true and explain in cannotReadReason.
- Never fabricate a brand name. If you can read some text but not all, say what you can.
- For authenticity, look at: professional labelling quality, recognisable manufacturer names, standard Indian pharma formatting, batch/expiry format. You cannot do a live CDSCO query — be honest about this.
- For alternatives, base Jan Aushadhi prices on what is publicly known: paracetamol ~Rs.2-3 per tablet, metformin ~Rs.0.30/tablet, azithromycin ~Rs.7/tablet, amoxicillin ~Rs.1.80/capsule, etc.
- Keep all language simple. The user may be elderly or have low health literacy.`

export async function scanMedicine(imageBase64, mimeType = 'image/jpeg') {
  if (!API_KEY) {
    throw new Error('API key not configured. Please add VITE_GEMINI_API_KEY to your Vercel environment variables.')
  }

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1500,
    },
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = err?.error?.message || `API error ${response.status}`
    if (response.status === 400) throw new Error('Could not process the image. Please try a clearer photo.')
    if (response.status === 403) throw new Error('API key invalid. Check Vercel environment variables.')
    if (response.status === 429) throw new Error('Too many requests. Please wait a moment and try again.')
    throw new Error(msg)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) throw new Error('No response from AI. Please try again.')

  // Strip markdown fences if Gemini added them despite instructions
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('AI returned an unreadable response. Please try again.')
  }
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
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
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
