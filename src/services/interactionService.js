// src/services/interactionService.js
// Client-side drug-drug interaction analyzer for the Cabinet drawer

const INTERACTION_REGISTRY = [
  {
    salts: ['aspirin', 'warfarin'],
    severity: 'CRITICAL',
    title: 'Severe Bleeding Risk',
    explanation: 'Aspirin and Warfarin both thin the blood. Combining them significantly increases the risk of serious internal and gastrointestinal bleeding.'
  },
  {
    salts: ['sildenafil', 'nitroglycerin'],
    severity: 'CRITICAL',
    title: 'Fatal Blood Pressure Drop',
    explanation: 'Nitroglycerin and Sildenafil (Viagra) both cause blood vessels to dilate. Taking them together can cause a severe, life-threatening drop in blood pressure.'
  },
  {
    salts: ['ibuprofen', 'aspirin'],
    severity: 'MODERATE',
    title: 'Reduced Cardioprotective Benefit',
    explanation: 'Ibuprofen can block the beneficial anti-clogging effects of low-dose Aspirin. Space the doses out if both are required.'
  },
  {
    salts: ['lisinopril', 'spironolactone'],
    severity: 'CRITICAL',
    title: 'Hyperkalemia Risk (High Potassium)',
    explanation: 'Both medicines increase potassium levels in the body. Combining them can lead to hyperkalemia, which may cause fatal cardiac arrhythmias.'
  },
  {
    salts: ['simvastatin', 'amlodipine'],
    severity: 'MODERATE',
    title: 'Increased Statin Toxicity',
    explanation: 'Amlodipine increases Simvastatin concentrations in the blood, raising the risk of muscle pain, damage, and toxicity (rhabdomyolysis).'
  },
  {
    salts: ['warfarin', 'ibuprofen'],
    severity: 'CRITICAL',
    title: 'Gastrointestinal Hemorrhage Risk',
    explanation: 'Ibuprofen damages the stomach lining while Warfarin prevents clotting. Taking them together greatly increases the risk of severe stomach ulcers and bleeding.'
  }
];

/**
 * Normalizes a salt string by cleaning doses, salt forms, and whitespace.
 * @param {string} salt - e.g. "Aspirin 75mg" or "Sildenafil Citrate"
 * @returns {string} - e.g. "aspirin" or "sildenafil"
 */
function normalizeSaltName(salt) {
  return (salt || '').toLowerCase()
    .replace(/\b\d+(\s*(mg|mcg|g|ml))?\b/g, '') // remove dosages
    .replace(/\b(sodium|potassium|citrate|maleate|succinate|hydrochloride|hcl|phosphate|sulfate)\b/g, '') // remove common salt forms
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks a list of active ingredients for mutual drug-drug interactions.
 * @param {Array<string>} activeSalts - List of active ingredients in the cabinet.
 * @returns {Array<object>} - Detected interactions with descriptions.
 */
export function checkInteractions(activeSalts) {
  if (!Array.isArray(activeSalts) || activeSalts.length < 2) return [];

  const normalized = activeSalts.map(s => ({
    original: s,
    clean: normalizeSaltName(s)
  })).filter(s => s.clean.length > 0);

  const collisions = [];

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const s1 = normalized[i];
      const s2 = normalized[j];

      // Check if any registry pair matches the clean names
      const match = INTERACTION_REGISTRY.find(reg => {
        const [a, b] = reg.salts;
        return (s1.clean.includes(a) && s2.clean.includes(b)) ||
               (s1.clean.includes(b) && s2.clean.includes(a));
      });

      if (match) {
        collisions.push({
          severity: match.severity,
          title: match.title,
          saltA: s1.original,
          saltB: s2.original,
          explanation: match.explanation
        });
      }
    }
  }

  return collisions;
}
