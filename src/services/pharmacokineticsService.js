/**
 * pharmacokineticsService.js
 *
 * Pharmacokinetic (PK) Simulation Engine for active drug salts.
 * Implements a 1-compartment open model with first-order absorption and elimination.
 * Computes plasma concentration profiles C(t) using the Bateman equation:
 *   C(t) = (F * Dose * Ka) / (Vd * (Ka - Ke)) * (e^(-Ke * t) - e^(-Ka * t))
 *
 * For multiple doses, applies the superposition principle (summing shifted single-dose responses).
 */

// PK parameters library for common active salts
// PK parameters library for common active salts
const PK_LIBRARY = {
  paracetamol: {
    name: 'Paracetamol',
    halfLifeElimination: 2.5, // hours (Ke = ln(2)/2.5 = 0.277)
    halfLifeAbsorption: 0.3,  // hours (Ka = ln(2)/0.3 = 2.31)
    vd: 0.9,                  // L/kg (Volume of distribution)
    bioavailability: 0.8,     // F
    minEffectiveConc: 5.0,    // mcg/mL
    minToxicConc: 20.0,       // mcg/mL
    typicalDose: 500,         // mg
    partition: 'hydrophilic',
    maxDailyDoseMg: 4000,
  },
  ibuprofen: {
    name: 'Ibuprofen',
    halfLifeElimination: 2.0,
    halfLifeAbsorption: 0.4,
    vd: 0.15,
    bioavailability: 0.9,
    minEffectiveConc: 10.0,
    minToxicConc: 50.0,
    typicalDose: 400,
    partition: 'lipophilic',
    maxDailyDoseMg: 2400,
  },
  atorvastatin: {
    name: 'Atorvastatin',
    halfLifeElimination: 14.0,
    halfLifeAbsorption: 1.5,
    vd: 5.5,
    bioavailability: 0.12,
    minEffectiveConc: 0.002, // clinically realistic minimum effective plasma concentration
    minToxicConc: 0.05,       // adjusted based on standard therapeutic index scale
    typicalDose: 10,
    partition: 'lipophilic',
    maxDailyDoseMg: 80,
  },
  metformin: {
    name: 'Metformin',
    halfLifeElimination: 6.2,
    halfLifeAbsorption: 2.0,
    vd: 4.0,
    bioavailability: 0.55,
    minEffectiveConc: 1.0,
    minToxicConc: 5.0,
    typicalDose: 500,
    partition: 'hydrophilic',
    maxDailyDoseMg: 2550,
  },
  pantoprazole: {
    name: 'Pantoprazole',
    halfLifeElimination: 1.0,
    halfLifeAbsorption: 1.5,
    vd: 0.15,
    bioavailability: 0.77,
    minEffectiveConc: 0.5,
    minToxicConc: 4.0,
    typicalDose: 40,
    partition: 'hydrophilic',
    maxDailyDoseMg: 240,
  },
  amoxicillin: {
    name: 'Amoxicillin',
    halfLifeElimination: 1.0,
    halfLifeAbsorption: 0.5,
    vd: 0.3,
    bioavailability: 0.85,
    minEffectiveConc: 2.0,
    minToxicConc: 40.0,      // amoxicillin has a very high therapeutic index; adjusted to prevent false toxicity warning
    typicalDose: 500,
    partition: 'hydrophilic',
    maxDailyDoseMg: 3000,
  }
}

/**
 * Finds the closest matching PK parameters for a given salt string
 */
export function getPKParameters(saltComposition) {
  if (!saltComposition) return null
  const normalized = saltComposition.toLowerCase()
  for (const key in PK_LIBRARY) {
    if (normalized.includes(key)) {
      return PK_LIBRARY[key]
    }
  }
  // Generic default parameters if salt is not in library
  return {
    name: saltComposition.split(' ')[0] || 'Drug',
    halfLifeElimination: 4.0,
    halfLifeAbsorption: 0.5,
    vd: 1.0,
    bioavailability: 0.7,
    minEffectiveConc: 2.0,
    minToxicConc: 15.0,
    typicalDose: 500,
    partition: 'hydrophilic',
    maxDailyDoseMg: 2000,
  }
}

/**
 * Calculates physiological indices: BMI, BSA, LBM
 */
export function calculatePhysiologicalIndices(weightKg, heightCm, ageYears, gender) {
  const w = parseFloat(weightKg) || 70
  const h = parseFloat(heightCm) || 170
  const age = parseFloat(ageYears) || 30
  const g = (gender || 'male').toLowerCase()

  const bmi = w / ((h / 100) ** 2)
  const bsa = Math.sqrt((w * h) / 3600)

  // James Formula for Lean Body Weight (LBM)
  let lbm = w
  if (g === 'female') {
    lbm = 1.07 * w - 148 * ((w / h) ** 2)
  } else {
    lbm = 1.10 * w - 128 * ((w / h) ** 2)
  }
  if (lbm <= 0 || lbm > w) {
    lbm = w * 0.75 // safe fallback
  }

  return {
    bmi: Math.round(bmi * 10) / 10,
    bsa: Math.round(bsa * 100) / 100,
    lbm: Math.round(lbm * 10) / 10
  }
}

/**
 * Simulates plasma concentration over a timeline adaptive to user body metrics.
 * @param {Object} params - PK parameters from library
 * @param {number} doseMg - Scanned/input dose in mg
 * @param {Array<number>} doseTimesHours - Times at which doses are taken (e.g. [0, 8, 16])
 * @param {number} weightKg - Patient weight
 * @param {number} heightCm - Patient height
 * @param {number} ageYears - Patient age
 * @param {string} gender - 'male' | 'female'
 * @param {number} durationHours - Timeline simulation length (defaults to 24)
 * @returns {Array<{time: number, conc: number}>} Data points for charting
 */
export function simulatePharmacokinetics(params, doseMg, doseTimesHours, weightKg = 70, heightCm = 170, ageYears = 30, gender = 'male', durationHours = 24) {
  if (!params) return []
  
  const indices = calculatePhysiologicalIndices(weightKg, heightCm, ageYears, gender)
  const F = params.bioavailability
  
  // Scale Volume of Distribution (Vd) by body weight/composition
  let Vd = 0
  if (params.partition === 'hydrophilic') {
    // Hydrophilic drugs distribute primarily in lean body mass
    Vd = params.vd * indices.lbm
  } else {
    // Lipophilic drugs distribute in total body fat/weight
    Vd = params.vd * weightKg
  }
  if (Vd <= 0) Vd = 50 // fallback to avoid division by zero
  
  // Scale elimination rate (Ke) by renal factor (simulated renal clearance decline with age)
  let renalFactor = 1.0
  if (ageYears > 50) {
    renalFactor = Math.max(0.4, 1.0 - 0.008 * (ageYears - 50))
  }
  if (gender === 'female') {
    renalFactor *= 0.85 // clearance is typically lower in women
  }
  
  const Ke = (Math.log(2) / params.halfLifeElimination) * renalFactor
  const Ka = Math.log(2) / params.halfLifeAbsorption
  
  // Bateman coefficients
  // C_single(t) = (F * Dose * Ka) / (Vd * (Ka - Ke)) * (e^(-Ke * t) - e^(-Ka * t))
  // Since Dose is in mg, Vd is in L, C(t) is in mg/L which equals mcg/mL
  const diff = Ka - Ke
  const divisor = Math.abs(diff) < 1e-4 ? 1e-4 : diff
  const coefficient = (F * doseMg * Ka) / (Vd * divisor)
  
  const dataPoints = []
  const step = 0.25 // calculate every 15 minutes
  
  for (let t = 0; t <= durationHours; t += step) {
    let totalConc = 0
    
    // Sum concentrations of all prior doses (superposition principle)
    for (const doseTime of doseTimesHours) {
      if (t >= doseTime) {
        const dt = t - doseTime
        const conc = coefficient * (Math.exp(-Ke * dt) - Math.exp(-Ka * dt))
        totalConc += Math.max(0, conc)
      }
    }
    
    dataPoints.push({
      time: Math.round(t * 100) / 100,
      conc: Math.round(totalConc * 100) / 100
    })
  }
  
  return dataPoints
}

/**
 * Checks if the scheduled daily dose is safe based on the drug library, patient age, weight, and gender.
 * @returns {{safe: boolean, maxSafeMg: number, scheduledMg: number, reason: string}}
 */
export function checkDosageSafety(saltComposition, doseStrengthMg, dailyFrequency, weightKg = 70, heightCm = 170, ageYears = 30, gender = 'male') {
  const params = getPKParameters(saltComposition);
  const standardMaxMg = params ? params.maxDailyDoseMg : 2000;
  
  const w = parseFloat(weightKg) || 70;
  const age = parseFloat(ageYears) || 30;
  const g = (gender || 'male').toLowerCase();
  
  // Physiological scaling factors
  let weightScale = 1.0;
  if (age < 18 || w < 55) {
    weightScale = Math.max(0.1, w / 70);
  }
  
  let renalFactor = 1.0;
  if (params && params.partition === 'hydrophilic') {
    if (age > 50) {
      renalFactor = Math.max(0.4, 1.0 - 0.008 * (age - 50));
    }
    if (g === 'female') {
      renalFactor *= 0.9; // scale down slightly for females for renal-cleared drugs
    }
  }
  
  const maxSafeMg = Math.min(standardMaxMg, standardMaxMg * weightScale * renalFactor);
  const scheduledMg = (parseFloat(doseStrengthMg) || 0) * (parseInt(dailyFrequency) || 1);
  
  let safe = scheduledMg <= maxSafeMg;
  let reason = '';
  
  if (!safe) {
    if (age < 18) {
      reason = `Daily intake of ${scheduledMg}mg exceeds pediatric safety limit of ${Math.round(maxSafeMg)}mg for a child of ${w}kg.`;
    } else if (age > 50 && renalFactor < 0.9) {
      reason = `Daily intake of ${scheduledMg}mg exceeds age-adjusted safety limit of ${Math.round(maxSafeMg)}mg due to age-related renal clearance decline.`;
    } else {
      reason = `Daily intake of ${scheduledMg}mg exceeds weight-adjusted safety limit of ${Math.round(maxSafeMg)}mg for a patient of ${w}kg.`;
    }
  } else {
    reason = `Dose of ${scheduledMg}mg/day is safe for patient weight (${w}kg) and age (${age}).`;
  }
  
  return {
    safe,
    maxSafeMg: Math.round(maxSafeMg),
    scheduledMg,
    reason
  };
}

