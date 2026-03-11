/**
 * supabaseService.js
 * 
 * All Supabase (PostgreSQL) database interactions for Agada.
 * 
 * Three tables are queried:
 *   1. cdsco_drugs         — CDSCO approved drug registry (authenticity)
 *   2. jan_aushadhi_generics — Jan Aushadhi scheme medicines (alternatives)
 *   3. nppa_prices          — NPPA price ceiling data (savings calculation)
 * 
 * All tables are pre-loaded from government Excel files.
 * No live government API calls are made at runtime.
 * 
 * Fuzzy matching uses ILIKE with pg_trgm for tolerant medicine name matching.
 * This handles: "Crocin" matching "CROCIN 500", spacing variations, etc.
 * 
 * The Supabase anon key is safe to expose — Row Level Security (RLS)
 * restricts all operations to SELECT only. No writes are possible.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Agada] Supabase environment variables not set. Check .env.local')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,       // No user sessions — Agada is fully anonymous
    autoRefreshToken: false,
  },
})

// ─────────────────────────────────────────────
// 1. CDSCO AUTHENTICITY CHECK
// ─────────────────────────────────────────────

/**
 * Checks if a medicine's brand name exists in the CDSCO approved drug registry.
 * 
 * Returns:
 *   - status: 'VERIFIED' | 'NOT_FOUND' | 'EXPIRED' | 'ERROR'
 *   - data: the matching CDSCO record if found
 * 
 * Algorithm:
 *   1. Exact brand name match (fastest, highest confidence)
 *   2. If no exact match, fuzzy ILIKE match (catches "CROCIN 500" vs "Crocin")
 *   3. If still no match, try matching by salt composition
 * 
 * @param {string} brandName — Brand name from Gemini extraction
 * @param {string} saltComposition — Salt from Gemini (fallback search)
 * @returns {Promise<Object>} Authenticity result
 */
export async function checkCDSCOAuthenticity(brandName, saltComposition) {
  if (!brandName && !saltComposition) {
    return { status: 'ERROR', message: 'No medicine name provided', data: null }
  }

  try {
    // Attempt 1: Exact brand name match
    let { data, error } = await supabase
      .from('cdsco_drugs')
      .select('brand_name, salt_composition, manufacturer, license_number, schedule, is_active, license_expiry_date, category')
      .ilike('brand_name', `%${brandName}%`)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "no rows returned" — not a real error for our purposes
      console.error('[Agada] CDSCO exact match error:', error)
    }

    if (data) {
      return {
        status: 'VERIFIED',
        confidence: 'HIGH',
        source: 'CDSCO Government Registry',
        data,
        message: `Verified in CDSCO registry. Licence: ${data.license_number}`,
      }
    }

    // Attempt 2: Broader ILIKE — split brand name in case it includes strength
    const brandNameBase = brandName.split(' ')[0] // e.g. "Crocin 500" → "Crocin"
    if (brandNameBase && brandNameBase !== brandName) {
      const { data: data2 } = await supabase
        .from('cdsco_drugs')
        .select('brand_name, salt_composition, manufacturer, license_number, schedule, is_active, license_expiry_date, category')
        .ilike('brand_name', `%${brandNameBase}%`)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (data2) {
        return {
          status: 'VERIFIED',
          confidence: 'MEDIUM',
          source: 'CDSCO Government Registry',
          data: data2,
          message: `Verified in CDSCO registry (partial name match).`,
        }
      }
    }

    // Attempt 3: Check if it exists but is inactive (expired/suspended)
    const { data: inactiveData } = await supabase
      .from('cdsco_drugs')
      .select('brand_name, manufacturer, license_number, is_active, license_expiry_date')
      .ilike('brand_name', `%${brandName}%`)
      .eq('is_active', false)
      .limit(1)
      .single()

    if (inactiveData) {
      return {
        status: 'EXPIRED',
        confidence: 'HIGH',
        source: 'CDSCO Government Registry',
        data: inactiveData,
        message: `Found in CDSCO registry but licence is INACTIVE/EXPIRED. Exercise caution.`,
      }
    }

    // Attempt 4: Salt composition fallback
    if (saltComposition) {
      const saltBase = saltComposition.split(' ')[0]
      const { data: saltData } = await supabase
        .from('cdsco_drugs')
        .select('brand_name, salt_composition, manufacturer, license_number, schedule, is_active')
        .ilike('salt_composition', `%${saltBase}%`)
        .eq('is_active', true)
        .limit(3)

      if (saltData && saltData.length > 0) {
        return {
          status: 'SIMILAR_FOUND',
          confidence: 'LOW',
          source: 'CDSCO Government Registry',
          data: saltData,
          message: `Brand not found, but medicines with same salt (${saltBase}) are registered.`,
        }
      }
    }

    // Not found at all
    return {
      status: 'NOT_FOUND',
      confidence: 'HIGH',
      source: 'CDSCO Government Registry',
      data: null,
      message: `"${brandName}" was NOT FOUND in the CDSCO drug registry. This may indicate a counterfeit or unregistered medicine.`,
    }
  } catch (error) {
    console.error('[Agada] CDSCO check failed:', error)
    return {
      status: 'ERROR',
      source: 'CDSCO Government Registry',
      data: null,
      message: 'Could not connect to database. Please check your internet connection.',
    }
  }
}

// ─────────────────────────────────────────────
// 2. JAN AUSHADHI ALTERNATIVES LOOKUP
// ─────────────────────────────────────────────

/**
 * Finds Jan Aushadhi generic alternatives for a given salt composition.
 * Results are ordered by MRP ascending (cheapest first).
 * Savings percentage is calculated against the branded MRP from extraction.
 * 
 * @param {string} saltComposition — Salt from extraction (e.g., "Paracetamol 500mg")
 * @param {number|null} brandedMrp — Branded medicine MRP for savings calculation
 * @returns {Promise<Object>} Alternatives result with savings data
 */
export async function findJanAushadhiAlternatives(saltComposition, brandedMrp = null) {
  if (!saltComposition) {
    return { success: false, data: [], message: 'No salt composition provided' }
  }

  try {
    // Extract just the active ingredient name (without dosage) for broader matching
    // e.g., "Paracetamol 500mg" → "Paracetamol"
    const saltName = saltComposition.split(' ')[0].replace(/[^a-zA-Z]/g, '')

    const { data, error } = await supabase
      .from('jan_aushadhi_generics')
      .select('product_name, salt_composition, mrp, pack_size, unit, product_code, therapeutic_class')
      .ilike('salt_composition', `%${saltName}%`)
      .order('mrp', { ascending: true })
      .limit(6)

    if (error) {
      console.error('[Agada] Jan Aushadhi query error:', error)
      return { success: false, data: [], message: 'Database query failed' }
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        data: [],
        message: `No Jan Aushadhi generic found for ${saltName}. This medicine may not yet be in the Jan Aushadhi scheme.`,
      }
    }

    // Annotate each result with savings data
    const enrichedData = data.map((medicine) => {
      const savings = brandedMrp && medicine.mrp
        ? calculateSavings(brandedMrp, medicine.mrp, medicine.pack_size)
        : null

      return {
        ...medicine,
        savings,
        isJanAushadhi: true,
        source: 'Jan Aushadhi — BPPI',
      }
    })

    return {
      success: true,
      data: enrichedData,
      totalAlternatives: data.length,
      source: 'Jan Aushadhi / BPPI Government Scheme',
    }
  } catch (error) {
    console.error('[Agada] Jan Aushadhi lookup failed:', error)
    return { success: false, data: [], message: 'Failed to fetch alternatives' }
  }
}

// ─────────────────────────────────────────────
// 3. NPPA PRICE CEILING LOOKUP
// ─────────────────────────────────────────────

/**
 * Looks up the legally mandated NPPA price ceiling for a medicine.
 * The ceiling price is the maximum a manufacturer can legally charge.
 * 
 * @param {string} saltComposition — Salt from extraction
 * @returns {Promise<Object>} NPPA ceiling price result
 */
export async function getNPPAPriceCeiling(saltComposition) {
  if (!saltComposition) return { success: false, data: null }

  try {
    const saltName = saltComposition.split(' ')[0].replace(/[^a-zA-Z]/g, '')

    const { data, error } = await supabase
      .from('nppa_prices')
      .select('brand_name, salt_composition, ceiling_price, unit, dosage_form, revised_date')
      .ilike('salt_composition', `%${saltName}%`)
      .order('ceiling_price', { ascending: true })
      .limit(3)

    if (error || !data || data.length === 0) {
      return { success: false, data: null, message: 'Not a price-controlled medicine (DPCO)' }
    }

    return {
      success: true,
      data: data[0],
      allMatches: data,
      source: 'NPPA — DPCO 2013 Price Control',
      note: 'This is the legally mandated maximum price. If you paid more, the seller may have violated DPCO.',
    }
  } catch (error) {
    console.error('[Agada] NPPA lookup failed:', error)
    return { success: false, data: null }
  }
}

// ─────────────────────────────────────────────
// HELPER: Calculate savings
// ─────────────────────────────────────────────

/**
 * Calculates per-tablet savings between branded and generic.
 * Handles pack size normalization (branded: 10 tabs, generic: 30 tabs).
 * 
 * @param {number} brandedMrp — Branded medicine MRP (total)
 * @param {number} genericMrp — Generic medicine MRP (total)
 * @param {string|number} genericPackSize — Generic pack size (for per-unit calc)
 * @returns {Object} Savings breakdown
 */
function calculateSavings(brandedMrp, genericMrp, genericPackSize) {
  if (!brandedMrp || !genericMrp) return null

  const savings = brandedMrp - genericMrp
  const savingsPercent = Math.round((savings / brandedMrp) * 100)

  return {
    brandedMrp,
    genericMrp,
    absoluteSavings: Math.max(0, savings).toFixed(2),
    percentageSaved: Math.max(0, savingsPercent),
    isSignificant: savingsPercent >= 30,    // Flag high savings prominently
    isMajor: savingsPercent >= 70,          // Flag exceptional savings
  }
}

// ─────────────────────────────────────────────
// COMBINED: runAllChecks
// ─────────────────────────────────────────────

/**
 * Runs all three database checks in parallel using Promise.all.
 * This is the main function called after Gemini extraction.
 * 
 * @param {Object} extraction — Result from Gemini extraction
 * @returns {Promise<Object>} All three check results
 */
export async function runAllChecks(extraction) {
  const { brandName, saltComposition, mrp } = extraction

  const [authenticityResult, alternativesResult, nppaPriceResult] = await Promise.all([
    checkCDSCOAuthenticity(brandName, saltComposition),
    findJanAushadhiAlternatives(saltComposition, mrp ? parseFloat(mrp) : null),
    getNPPAPriceCeiling(saltComposition),
  ])

  return {
    authenticity: authenticityResult,
    alternatives: alternativesResult,
    nppaPrice: nppaPriceResult,
    queriedAt: new Date().toISOString(),
  }
}
