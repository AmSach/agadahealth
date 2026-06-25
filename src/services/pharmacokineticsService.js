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
  },
  atorvastatin: {
    name: 'Atorvastatin',
    halfLifeElimination: 14.0,
    halfLifeAbsorption: 1.5,
    vd: 5.5,
    bioavailability: 0.12,
    minEffectiveConc: 0.02, // highly potent
    minToxicConc: 0.2,
    typicalDose: 10,
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
  },
  amoxicillin: {
    name: 'Amoxicillin',
    halfLifeElimination: 1.0,
    halfLifeAbsorption: 0.5,
    vd: 0.3,
    bioavailability: 0.85,
    minEffectiveConc: 2.0,
    minToxicConc: 15.0,
    typicalDose: 500,
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
    name: saltComposition.split(' ')[0],
    halfLifeElimination: 4.0,
    halfLifeAbsorption: 0.5,
    vd: 1.0,
    bioavailability: 0.7,
    minEffectiveConc: 2.0,
    minToxicConc: 15.0,
    typicalDose: 500,
  }
}

/**
 * Simulates plasma concentration over a timeline.
 * @param {Object} params - PK parameters from library
 * @param {number} doseMg - Scanned/input dose in mg
 * @param {Array<number>} doseTimesHours - Times at which doses are taken (e.g. [0, 8, 16])
 * @param {number} weightKg - Patient weight (defaults to 70kg)
 * @param {number} durationHours - Timeline simulation length (defaults to 24)
 * @returns {Array<{time: number, conc: number}>} Data points for charting
 */
export function simulatePharmacokinetics(params, doseMg, doseTimesHours, weightKg = 70, durationHours = 24) {
  if (!params) return []
  
  const F = params.bioavailability
  const Vd = params.vd * weightKg // Total volume of distribution in Liters
  
  // Rate constants
  const Ke = Math.log(2) / params.halfLifeElimination
  const Ka = Math.log(2) / params.halfLifeAbsorption
  
  // Bateman coefficients
  // C_single(t) = (F * Dose * Ka) / (Vd * (Ka - Ke)) * (e^(-Ke * t) - e^(-Ka * t))
  // Since Dose is in mg, Vd is in L, C(t) is in mg/L which equals mcg/mL
  const coefficient = (F * doseMg * Ka) / (Vd * (Ka - Ke))
  
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
