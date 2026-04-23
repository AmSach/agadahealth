/**
 * supabaseService.js
 * 
 * All database interactions for Agada.
 * Uses Supabase (PostgreSQL) when configured, falls back to local data when not.
 * 
 * Three data sources:
 *   1. CDSCO approved drug registry (authenticity)
 *   2. Jan Aushadhi scheme medicines (alternatives + pricing)
 *   3. NPPA price ceiling data (savings calculation)
 */

import { createClient } from '@supabase/supabase-js'
import { lookupJanAushadhiLocal, calculateSavings as calcSavings } from './janAushadhiData.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

if (!supabaseConfigured) {
  console.warn('[Agada] Supabase not configured. Using local fallback data.')
}

export const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null

// ─────────────────────────────────────────────
// 1. CDSCO AUTHENTICITY CHECK
// ─────────────────────────────────────────────

export async function checkCDSCOAuthenticity(brandName, saltComposition) {
  if (!supabase) {
    return {
      status: 'NOT_CONFIGURED',
      confidence: 'LOW',
      source: 'CDSCO (Database not available)',
      data: null,
      message: 'CDSCO database not configured. Cannot verify authenticity.'
    }
  }

  if (!brandName && !saltComposition) {
    return { status: 'ERROR', message: 'No medicine name provided', data: null }
  }

  try {
    let { data, error } = await supabase
      .from('cdsco_drugs')
      .select('brand_name, salt_composition, manufacturer, license_number, schedule, is_active, license_expiry_date, category')
      .ilike('brand_name', `%${brandName}%`)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
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

    const brandNameBase = brandName?.split(' ')[0]
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
          message: 'Verified in CDSCO registry (partial name match).',
        }
      }
    }

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
        message: 'Found in CDSCO registry but licence is INACTIVE/EXPIRED. Exercise caution.',
      }
    }

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

export async function findJanAushadhiAlternatives(saltComposition, brandedMrp = null) {
  if (!saltComposition) {
    return { success: false, data: [], message: 'No salt composition provided' }
  }

  const saltName = saltComposition.split(' ')[0].replace(/[^a-zA-Z]/g, '')

  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('jan_aushadhi_generics')
        .select('product_name, salt_composition, mrp, pack_size, unit, product_code, therapeutic_class')
        .ilike('salt_composition', `%${saltName}%`)
        .order('mrp', { ascending: true })
        .limit(6)

      if (!error && data && data.length > 0) {
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
      }
    } catch (error) {
      console.error('[Agada] Jan Aushadhi Supabase query failed:', error)
    }
  }

  // Fallback to local data
  console.log('[Agada] Using local Jan Aushadhi fallback data')
  const localData = lookupJanAushadhiLocal(saltName)

  if (localData.length === 0) {
    return {
      success: true,
      data: [],
      message: `No Jan Aushadhi generic found for ${saltName}. This medicine may not yet be in the Jan Aushadhi scheme.`,
    }
  }

  const enrichedData = localData.map((medicine) => {
    const savings = brandedMrp && medicine.mrp
      ? calcSavings(brandedMrp, medicine.mrp)
      : null

    return {
      ...medicine,
      savings,
    }
  })

  return {
    success: true,
    data: enrichedData,
    totalAlternatives: localData.length,
    source: 'Jan Aushadhi (Local Fallback)',
  }
}

// ─────────────────────────────────────────────
// 3. NPPA PRICE CEILING LOOKUP
// ─────────────────────────────────────────────

export async function getNPPAPriceCeiling(saltComposition) {
  if (!supabase) {
    return {
      success: false,
      data: null,
      message: 'NPPA database not configured.'
    }
  }

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

function calculateSavings(brandedMrp, genericMrp, genericPackSize) {
  if (!brandedMrp || !genericMrp) return null

  const savings = brandedMrp - genericMrp
  const savingsPercent = Math.round((savings / brandedMrp) * 100)

  return {
    brandedMrp,
    genericMrp,
    absoluteSavings: Math.max(0, savings).toFixed(2),
    percentageSaved: Math.max(0, savingsPercent),
    isSignificant: savingsPercent >= 30,
    isMajor: savingsPercent >= 70,
  }
}

// ─────────────────────────────────────────────
// COMBINED: runAllChecks
// ─────────────────────────────────────────────

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
