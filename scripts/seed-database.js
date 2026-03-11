/**
 * scripts/seed-database.js
 * 
 * Seeds the Supabase database with sample/test data.
 * Use this to verify the schema and queries work before
 * importing the full government Excel files.
 * 
 * Usage:
 *   node scripts/seed-database.js
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in environment
 * (service key, not anon key — needed for INSERT)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // SERVICE KEY required for seeding
)

// ─── Sample CDSCO data ────────────────────────────────
const cdscoDrugs = [
  {
    brand_name: 'Crocin',
    salt_composition: 'Paracetamol 500mg',
    dosage_form: 'Tablet',
    strength: '500mg',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    manufacturer_state: 'West Bengal',
    license_number: 'MFG/WB/KOL-06/09/28B/2004',
    schedule: null,
    category: 'Analgesic / Antipyretic',
    is_active: true,
  },
  {
    brand_name: 'Dolo 650',
    salt_composition: 'Paracetamol 650mg',
    dosage_form: 'Tablet',
    strength: '650mg',
    manufacturer: 'Micro Labs Limited',
    manufacturer_state: 'Karnataka',
    license_number: 'KA/KARNATAKA/2016/000156',
    schedule: null,
    category: 'Analgesic / Antipyretic',
    is_active: true,
  },
  {
    brand_name: 'Augmentin',
    salt_composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
    dosage_form: 'Tablet',
    strength: '625mg',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    manufacturer_state: 'West Bengal',
    license_number: 'MFG/WB/KOL-06/09/28B/2008',
    schedule: 'H',
    category: 'Antibiotic',
    is_active: true,
  },
  {
    brand_name: 'Metformin 500',
    salt_composition: 'Metformin Hydrochloride 500mg',
    dosage_form: 'Tablet',
    strength: '500mg',
    manufacturer: 'USV Private Limited',
    manufacturer_state: 'Maharashtra',
    license_number: 'MH/THANE/2015/000089',
    schedule: 'H',
    category: 'Antidiabetic',
    is_active: true,
  },
  {
    brand_name: 'Azithromycin 500',
    salt_composition: 'Azithromycin 500mg',
    dosage_form: 'Tablet',
    strength: '500mg',
    manufacturer: 'Cipla Limited',
    manufacturer_state: 'Maharashtra',
    license_number: 'MH/MUM/2017/000241',
    schedule: 'H',
    category: 'Antibiotic',
    is_active: true,
  },
  {
    brand_name: 'FakeVitamin Z',
    salt_composition: 'Thiamine 100mg',
    dosage_form: 'Tablet',
    strength: '100mg',
    manufacturer: 'Unknown Pharma',
    manufacturer_state: 'Unknown',
    license_number: 'EXPIRED-2019-001',
    schedule: null,
    category: 'Vitamin',
    is_active: false,   // This simulates an expired/fake medicine
    license_expiry_date: '2019-01-01',
  },
]

// ─── Sample Jan Aushadhi data ─────────────────────────
const janAushadhiGenerics = [
  {
    product_code: 'JA-PAR-500',
    product_name: 'Paracetamol 500mg Tablets',
    salt_composition: 'Paracetamol 500mg',
    strength: '500mg',
    dosage_form: 'Tablet',
    pack_size: '30 Tablets',
    mrp: 2.50,
    unit: 'per strip of 10',
    therapeutic_class: 'Analgesic / Antipyretic',
    is_available: true,
  },
  {
    product_code: 'JA-PAR-650',
    product_name: 'Paracetamol 650mg Tablets',
    salt_composition: 'Paracetamol 650mg',
    strength: '650mg',
    dosage_form: 'Tablet',
    pack_size: '30 Tablets',
    mrp: 4.90,
    unit: 'per strip of 10',
    therapeutic_class: 'Analgesic / Antipyretic',
    is_available: true,
  },
  {
    product_code: 'JA-AMOX-500',
    product_name: 'Amoxicillin 500mg Capsules',
    salt_composition: 'Amoxicillin 500mg',
    strength: '500mg',
    dosage_form: 'Capsule',
    pack_size: '10 Capsules',
    mrp: 18.50,
    unit: 'per strip of 10',
    therapeutic_class: 'Antibiotic',
    is_available: true,
  },
  {
    product_code: 'JA-MET-500',
    product_name: 'Metformin 500mg Tablets',
    salt_composition: 'Metformin Hydrochloride 500mg',
    strength: '500mg',
    dosage_form: 'Tablet',
    pack_size: '100 Tablets',
    mrp: 28.00,
    unit: 'per 100 tablets',
    therapeutic_class: 'Antidiabetic',
    is_available: true,
  },
  {
    product_code: 'JA-AZITH-500',
    product_name: 'Azithromycin 500mg Tablets',
    salt_composition: 'Azithromycin 500mg',
    strength: '500mg',
    dosage_form: 'Tablet',
    pack_size: '3 Tablets',
    mrp: 21.00,
    unit: 'per strip of 3',
    therapeutic_class: 'Antibiotic',
    is_available: true,
  },
]

// ─── Sample NPPA price ceilings ──────────────────────
const nppaPrices = [
  {
    brand_name: 'Paracetamol',
    salt_composition: 'Paracetamol 500mg',
    strength: '500mg',
    dosage_form: 'Tablet',
    ceiling_price: 0.83,
    unit: 'per tablet',
    revised_date: '2023-04-01',
  },
  {
    brand_name: 'Paracetamol',
    salt_composition: 'Paracetamol 650mg',
    strength: '650mg',
    dosage_form: 'Tablet',
    ceiling_price: 1.12,
    unit: 'per tablet',
    revised_date: '2023-04-01',
  },
  {
    brand_name: 'Metformin',
    salt_composition: 'Metformin Hydrochloride 500mg',
    strength: '500mg',
    dosage_form: 'Tablet',
    ceiling_price: 1.43,
    unit: 'per tablet',
    revised_date: '2023-04-01',
  },
]

// ─── Seed function ────────────────────────────────────
async function seed() {
  console.log('🌱 Seeding Agada database with sample data...\n')

  // Seed CDSCO
  console.log('📋 Inserting CDSCO drug records...')
  const { error: cdscError } = await supabase
    .from('cdsco_drugs')
    .upsert(cdscoDrugs, { onConflict: 'license_number' })
  
  if (cdscError) console.error('❌ CDSCO seed error:', cdscError.message)
  else console.log(`✅ Inserted ${cdscoDrugs.length} CDSCO records`)

  // Seed Jan Aushadhi
  console.log('💊 Inserting Jan Aushadhi product records...')
  const { error: janError } = await supabase
    .from('jan_aushadhi_generics')
    .upsert(janAushadhiGenerics, { onConflict: 'product_code' })
  
  if (janError) console.error('❌ Jan Aushadhi seed error:', janError.message)
  else console.log(`✅ Inserted ${janAushadhiGenerics.length} Jan Aushadhi records`)

  // Seed NPPA
  console.log('💰 Inserting NPPA price ceiling records...')
  const { error: nppaError } = await supabase
    .from('nppa_prices')
    .insert(nppaPrices)
  
  if (nppaError) console.error('❌ NPPA seed error:', nppaError.message)
  else console.log(`✅ Inserted ${nppaPrices.length} NPPA price records`)

  console.log('\n✅ Seeding complete!')
  console.log('Test with: scan a Crocin or Dolo-650 medicine strip.')
}

seed().catch(console.error)
