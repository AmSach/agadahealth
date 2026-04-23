/**
 * janAushadhiData.js — Embedded Jan Aushadhi price database
 * 
 * This is a fallback/local database of Jan Aushadhi medicines with MRP.
 * Data sourced from BPPI (Bureau of Pharma Public Sector Undertakings of India).
 * 
 * When Supabase is not configured, this provides baseline pricing data.
 */

// Common medicines with their Jan Aushadhi prices
// Format: { salt: "name", products: [{name, mrp, packSize}] }
export const JAN_AUSHADHI_DB = [
  // Pain & Fever
  { salt: "paracetamol", products: [
    { name: "Paracetamol 500mg", mrp: 2.5, packSize: "10 tablets" },
    { name: "Paracetamol 650mg", mrp: 3.5, packSize: "10 tablets" },
  ]},
  { salt: "ibuprofen", products: [
    { name: "Ibuprofen 400mg", mrp: 5, packSize: "10 tablets" },
    { name: "Ibuprofen 600mg", mrp: 7, packSize: "10 tablets" },
  ]},
  { salt: "diclofenac", products: [
    { name: "Diclofenac 50mg", mrp: 4, packSize: "10 tablets" },
    { name: "Diclofenac Sodium 50mg", mrp: 5, packSize: "10 tablets" },
  ]},
  
  // Antibiotics
  { salt: "amoxycillin", products: [
    { name: "Amoxycillin 250mg", mrp: 9, packSize: "10 capsules" },
    { name: "Amoxycillin 500mg", mrp: 17, packSize: "10 capsules" },
    { name: "Amoxycillin + Clavulanate 625mg", mrp: 45, packSize: "10 tablets" },
  ]},
  { salt: "azithromycin", products: [
    { name: "Azithromycin 250mg", mrp: 15, packSize: "6 tablets" },
    { name: "Azithromycin 500mg", mrp: 25, packSize: "3 tablets" },
  ]},
  { salt: "ciprofloxacin", products: [
    { name: "Ciprofloxacin 250mg", mrp: 8, packSize: "10 tablets" },
    { name: "Ciprofloxacin 500mg", mrp: 15, packSize: "10 tablets" },
  ]},
  { salt: "doxycycline", products: [
    { name: "Doxycycline 100mg", mrp: 10, packSize: "10 capsules" },
  ]},
  
  // Diabetes
  { salt: "metformin", products: [
    { name: "Metformin 250mg", mrp: 4, packSize: "10 tablets" },
    { name: "Metformin 500mg", mrp: 7, packSize: "10 tablets" },
    { name: "Metformin SR 500mg", mrp: 10, packSize: "10 tablets" },
  ]},
  { salt: "glimepiride", products: [
    { name: "Glimepiride 1mg", mrp: 4, packSize: "10 tablets" },
    { name: "Glimepiride 2mg", mrp: 7, packSize: "10 tablets" },
  ]},
  
  // Blood Pressure / Heart
  { salt: "amlodipine", products: [
    { name: "Amlodipine 2.5mg", mrp: 3, packSize: "10 tablets" },
    { name: "Amlodipine 5mg", mrp: 5, packSize: "10 tablets" },
    { name: "Amlodipine 10mg", mrp: 9, packSize: "10 tablets" },
  ]},
  { salt: "atenolol", products: [
    { name: "Atenolol 25mg", mrp: 3, packSize: "10 tablets" },
    { name: "Atenolol 50mg", mrp: 5, packSize: "10 tablets" },
  ]},
  { salt: "losartan", products: [
    { name: "Losartan 25mg", mrp: 6, packSize: "10 tablets" },
    { name: "Losartan 50mg", mrp: 10, packSize: "10 tablets" },
  ]},
  { salt: "telmisartan", products: [
    { name: "Telmisartan 20mg", mrp: 8, packSize: "10 tablets" },
    { name: "Telmisartan 40mg", mrp: 12, packSize: "10 tablets" },
  ]},
  
  // Cholesterol
  { salt: "atorvastatin", products: [
    { name: "Atorvastatin 10mg", mrp: 12, packSize: "10 tablets" },
    { name: "Atorvastatin 20mg", mrp: 18, packSize: "10 tablets" },
  ]},
  
  // Thyroid
  { salt: "levothyroxine", products: [
    { name: "Levothyroxine 25mcg", mrp: 6, packSize: "10 tablets" },
    { name: "Levothyroxine 50mcg", mrp: 10, packSize: "10 tablets" },
    { name: "Levothyroxine 100mcg", mrp: 15, packSize: "10 tablets" },
  ]},
  
  // Antacids / Gastric
  { salt: "omeprazole", products: [
    { name: "Omeprazole 20mg", mrp: 8, packSize: "10 capsules" },
    { name: "Omeprazole 40mg", mrp: 15, packSize: "10 capsules" },
  ]},
  { salt: "pantoprazole", products: [
    { name: "Pantoprazole 20mg", mrp: 10, packSize: "10 tablets" },
    { name: "Pantoprazole 40mg", mrp: 18, packSize: "10 tablets" },
  ]},
  { salt: "ranitidine", products: [
    { name: "Ranitidine 150mg", mrp: 3, packSize: "10 tablets" },
    { name: "Ranitidine 300mg", mrp: 6, packSize: "10 tablets" },
  ]},
  
  // Allergy / Cold
  { salt: "cetirizine", products: [
    { name: "Cetirizine 10mg", mrp: 2, packSize: "10 tablets" },
  ]},
  { salt: "levocetirizine", products: [
    { name: "Levocetirizine 5mg", mrp: 4, packSize: "10 tablets" },
  ]},
  { salt: "fexofenadine", products: [
    { name: "Fexofenadine 120mg", mrp: 10, packSize: "10 tablets" },
    { name: "Fexofenadine 180mg", mrp: 15, packSize: "10 tablets" },
  ]},
  { salt: "loratadine", products: [
    { name: "Loratadine 10mg", mrp: 3, packSize: "10 tablets" },
  ]},
  
  // Cough
  { salt: "ambroxol", products: [
    { name: "Ambroxol 30mg", mrp: 5, packSize: "10 tablets" },
    { name: "Ambroxol Syrup", mrp: 18, packSize: "100ml" },
  ]},
  
  // Vitamins & Supplements
  { salt: "vitamin d", products: [
    { name: "Vitamin D3 60000 IU", mrp: 12, packSize: "1 tablet" },
    { name: "Calcium + Vitamin D3", mrp: 25, packSize: "30 tablets" },
  ]},
  { salt: "vitamin b12", products: [
    { name: "Vitamin B12 1500mcg", mrp: 8, packSize: "10 tablets" },
  ]},
  { salt: "folic acid", products: [
    { name: "Folic Acid 5mg", mrp: 2, packSize: "10 tablets" },
  ]},
  { salt: "iron", products: [
    { name: "Iron + Folic Acid", mrp: 15, packSize: "30 tablets" },
    { name: "Ferrous Ascorbate 100mg", mrp: 20, packSize: "10 tablets" },
  ]},
  { salt: "calcium", products: [
    { name: "Calcium 500mg", mrp: 15, packSize: "10 tablets" },
  ]},
  
  // Antifungal
  { salt: "fluconazole", products: [
    { name: "Fluconazole 50mg", mrp: 8, packSize: "4 tablets" },
    { name: "Fluconazole 150mg", mrp: 9, packSize: "1 tablet" },
  ]},
  { salt: "clotrimazole", products: [
    { name: "Clotrimazole 1% Cream", mrp: 15, packSize: "15g" },
  ]},
  
  // Antimalarial
  { salt: "artemether", products: [
    { name: "Artemether + Lumefantrine", mrp: 25, packSize: "6 tablets" },
  ]},
  
  // Anxiety / Sleep
  { salt: "alprazolam", products: [
    { name: "Alprazolam 0.25mg", mrp: 5, packSize: "10 tablets" },
    { name: "Alprazolam 0.5mg", mrp: 7, packSize: "10 tablets" },
  ]},
  { salt: "clonazepam", products: [
    { name: "Clonazepam 0.5mg", mrp: 6, packSize: "10 tablets" },
  ]},
  
  // Epilepsy
  { salt: "phenytoin", products: [
    { name: "Phenytoin 100mg", mrp: 8, packSize: "10 tablets" },
  ]},
  { salt: "carbamazepine", products: [
    { name: "Carbamazepine 100mg", mrp: 5, packSize: "10 tablets" },
    { name: "Carbamazepine 200mg", mrp: 9, packSize: "10 tablets" },
  ]},
  { salt: "sodium valproate", products: [
    { name: "Sodium Valproate 200mg", mrp: 12, packSize: "10 tablets" },
  ]},
  
  // Gout
  { salt: "allopurinol", products: [
    { name: "Allopurinol 100mg", mrp: 6, packSize: "10 tablets" },
    { name: "Allopurinol 300mg", mrp: 15, packSize: "10 tablets" },
  ]},
  
  // Diuretics
  { salt: "furosemide", products: [
    { name: "Furosemide 20mg", mrp: 3, packSize: "10 tablets" },
    { name: "Furosemide 40mg", mrp: 5, packSize: "10 tablets" },
  ]},
  { salt: "spironolactone", products: [
    { name: "Spironolactone 25mg", mrp: 6, packSize: "10 tablets" },
  ]},
  
  // Eye
  { salt: "timolol", products: [
    { name: "Timolol 0.25% Eye Drops", mrp: 15, packSize: "5ml" },
    { name: "Timolol 0.5% Eye Drops", mrp: 20, packSize: "5ml" },
  ]},
  { salt: "ciprofloxacin eye", products: [
    { name: "Ciprofloxacin Eye Drops", mrp: 18, packSize: "5ml" },
  ]},
  
  // Steroids
  { salt: "prednisolone", products: [
    { name: "Prednisolone 5mg", mrp: 6, packSize: "10 tablets" },
    { name: "Prednisolone 10mg", mrp: 10, packSize: "10 tablets" },
  ]},
  { salt: "dexamethasone", products: [
    { name: "Dexamethasone 0.5mg", mrp: 4, packSize: "10 tablets" },
  ]},
  
  // Antidiarrheal
  { salt: "ofloxacin", products: [
    { name: "Ofloxacin 200mg", mrp: 12, packSize: "10 tablets" },
  ]},
  { salt: "metronidazole", products: [
    { name: "Metronidazole 200mg", mrp: 5, packSize: "10 tablets" },
    { name: "Metronidazole 400mg", mrp: 10, packSize: "10 tablets" },
  ]},
  
  // Worms
  { salt: "albendazole", products: [
    { name: "Albendazole 400mg", mrp: 2, packSize: "1 tablet" },
  ]},
  { salt: "mebendazole", products: [
    { name: "Mebendazole 100mg", mrp: 3, packSize: "1 tablet" },
  ]},
]

/**
 * Lookup Jan Aushadhi alternatives by salt name
 * @param {string} saltName - Salt name to search (e.g., "paracetamol")
 * @returns {Array} Array of matching products with MRPs
 */
export function lookupJanAushadhiLocal(saltName) {
  if (!saltName) return []
  
  const searchName = saltName.toLowerCase().split(' ')[0].replace(/[^a-z]/g, '')
  
  const matches = []
  for (const entry of JAN_AUSHADHI_DB) {
    if (entry.salt.includes(searchName) || searchName.includes(entry.salt)) {
      matches.push(...entry.products.map(p => ({
        ...p,
        isJanAushadhi: true,
        source: 'Jan Aushadhi (Local DB)',
        therapeutic_class: 'Generic',
      })))
    }
  }
  
  return matches
}

/**
 * Calculate savings between branded and Jan Aushadhi generic
 * @param {number} brandedMrp - Branded medicine MRP
 * @param {number} genericMrp - Generic medicine MRP
 * @returns {Object} Savings breakdown
 */
export function calculateSavings(brandedMrp, genericMrp) {
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
