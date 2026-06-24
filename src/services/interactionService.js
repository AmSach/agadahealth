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

// Map of common salts to their therapeutic chemical classifications
const THERAPEUTIC_CLASS_REGISTRY = {
  'aspirin': 'NSAID (Pain Reliever)',
  'ibuprofen': 'NSAID (Pain Reliever)',
  'diclofenac': 'NSAID (Pain Reliever)',
  'aceclofenac': 'NSAID (Pain Reliever)',
  'nimesulide': 'NSAID (Pain Reliever)',
  'paracetamol': 'Analgesic (Antipyretic)',
  'acetaminophen': 'Analgesic (Antipyretic)',
  'atorvastatin': 'Statin (Cholesterol Lowering)',
  'simvastatin': 'Statin (Cholesterol Lowering)',
  'rosuvastatin': 'Statin (Cholesterol Lowering)',
  'lisinopril': 'ACE Inhibitor (Blood Pressure)',
  'enalapril': 'ACE Inhibitor (Blood Pressure)',
  'ramipril': 'ACE Inhibitor (Blood Pressure)',
  'losartan': 'ARB (Blood Pressure)',
  'telmisartan': 'ARB (Blood Pressure)',
  'omeprazole': 'PPI (Acid Reducer)',
  'pantoprazole': 'PPI (Acid Reducer)',
  'rabeprazole': 'PPI (Acid Reducer)',
  'metformin': 'Anti-Diabetic',
  'glimepiride': 'Anti-Diabetic',
};

/**
 * Checks a list of active ingredients for therapeutic duplication (taking multiple drugs of the same class).
 * @param {Array<string>} activeSalts - List of active ingredients in the cabinet.
 * @returns {Array<object>} - Detected duplications with warnings.
 */
export function checkTherapeuticDuplication(activeSalts) {
  if (!Array.isArray(activeSalts) || activeSalts.length < 2) return [];

  const normalized = activeSalts.map(s => ({
    original: s,
    clean: normalizeSaltName(s)
  })).filter(s => s.clean.length > 0);

  const classMap = new Map();
  const duplicates = [];

  for (const s of normalized) {
    // Find matching therapeutic class
    const key = Object.keys(THERAPEUTIC_CLASS_REGISTRY).find(k => s.clean.includes(k));
    if (key) {
      const clsName = THERAPEUTIC_CLASS_REGISTRY[key];
      if (!classMap.has(clsName)) {
        classMap.set(clsName, []);
      }
      classMap.get(clsName).push(s.original);
    }
  }

  for (const [className, medicines] of classMap.entries()) {
    if (medicines.length >= 2) {
      duplicates.push({
        severity: 'ALERT',
        title: 'Therapeutic Class Overlap',
        className,
        medicines,
        explanation: `You are taking multiple ingredients classified as ${className} (${medicines.join(' + ')}). Taking overlapping classes can increase side effects or lead to accidental toxic overdose. Consult a pharmacist.`
      });
    }
  }

  return duplicates;
}

// Map of common salts to their ideal take-time, food guidelines, and clinical rationales
export const CHRONOTHERAPY_METADATA = {
  'omeprazole': { idealTime: 'Morning', foodRelation: 'Empty Stomach (30m before breakfast)', rationale: 'PPIs require active proton pumps to bind; taking before first meal maximizes acid suppression.' },
  'pantoprazole': { idealTime: 'Morning', foodRelation: 'Empty Stomach (30m before breakfast)', rationale: 'PPIs require active proton pumps to bind; taking before first meal maximizes acid suppression.' },
  'rabeprazole': { idealTime: 'Morning', foodRelation: 'Empty Stomach (30m before breakfast)', rationale: 'PPIs require active proton pumps to bind; taking before first meal maximizes acid suppression.' },
  'simvastatin': { idealTime: 'Bedtime', foodRelation: 'With or without food', rationale: 'Cholesterol synthesis peaks during early morning hours; short-acting statins work best at bedtime.' },
  'atorvastatin': { idealTime: 'Bedtime', foodRelation: 'With or without food', rationale: 'Bedtime dosing aligns with peak hepatic cholesterol synthesis.' },
  'rosuvastatin': { idealTime: 'Bedtime', foodRelation: 'With or without food', rationale: 'Bedtime dosing aligns with peak hepatic cholesterol synthesis.' },
  'aspirin': { idealTime: 'Morning', foodRelation: 'After Food', rationale: 'Taking after food reduces mucosal stomach lining irritation.' },
  'ibuprofen': { idealTime: 'Evening', foodRelation: 'After Food', rationale: 'NSAIDs should be taken with food. Spaced to avoid blocking Aspirin’s antiplatelet effects.' },
  'diclofenac': { idealTime: 'Evening', foodRelation: 'After Food', rationale: 'NSAIDs should be taken with food to prevent gastric upset.' },
  'aceclofenac': { idealTime: 'Evening', foodRelation: 'After Food', rationale: 'NSAIDs should be taken with food to prevent gastric upset.' },
  'paracetamol': { idealTime: 'Afternoon', foodRelation: 'With or without food', rationale: 'Commonly taken for mid-day relief; ensure 4-6 hours spacing between doses.' },
  'metformin': { idealTime: 'Evening', foodRelation: 'With Food', rationale: 'Metformin is taken with dinner to minimize gastrointestinal side effects.' },
  'lisinopril': { idealTime: 'Morning', foodRelation: 'With or without food', rationale: 'Dosing blood pressure medication in the morning prevents daytime hypertension spikes.' },
  'losartan': { idealTime: 'Morning', foodRelation: 'With or without food', rationale: 'Dosing blood pressure medication in the morning prevents daytime hypertension spikes.' },
  'telmisartan': { idealTime: 'Morning', foodRelation: 'With or without food', rationale: 'Long half-life allows morning dosing for stable 24h pressure control.' }
};

/**
 * Dynamically orchestrates medication schedules based on active cabinet ingredients.
 * Applies chronotherapeutic guidelines and spacing for moderate drug-drug interactions.
 * @param {Array<object>} cabinetItems - Items in the cabinet.
 * @returns {object} - { schedule: { Morning: [], Afternoon: [], Evening: [], Bedtime: [] }, notes: [] }
 */
export function orchestrateMedicationSchedule(cabinetItems) {
  const schedule = {
    'Morning': [],
    'Afternoon': [],
    'Evening': [],
    'Bedtime': []
  };
  const notes = [];

  if (!Array.isArray(cabinetItems) || cabinetItems.length === 0) {
    return { schedule, notes };
  }

  // Normalize cabinet items
  const processed = cabinetItems.map(item => {
    const clean = normalizeSaltName(item.saltComposition);
    const metaKey = Object.keys(CHRONOTHERAPY_METADATA).find(k => clean.includes(k));
    const meta = metaKey ? { ...CHRONOTHERAPY_METADATA[metaKey] } : {
      idealTime: 'Morning',
      foodRelation: 'With or without food',
      rationale: 'Standard maintenance dosing.'
    };
    return {
      brandName: item.brandName,
      saltComposition: item.saltComposition,
      clean,
      meta
    };
  });

  // Check if we need to space out Aspirin and Ibuprofen
  const hasAspirin = processed.some(item => item.clean.includes('aspirin'));
  const hasIbuprofen = processed.some(item => item.clean.includes('ibuprofen'));

  if (hasAspirin && hasIbuprofen) {
    notes.push({
      type: 'spacing',
      message: '⏰ Spaced-Dosing Alert: Aspirin and Ibuprofen are in your cabinet. Ibuprofen has been automatically scheduled to Bedtime to prevent it from blocking Aspirin’s cardiovascular antiplatelet effects.'
    });

    processed.forEach(item => {
      if (item.clean.includes('aspirin')) {
        item.meta.idealTime = 'Morning';
      }
      if (item.clean.includes('ibuprofen')) {
        item.meta.idealTime = 'Bedtime';
      }
    });
  }

  // Assign to slots
  processed.forEach(item => {
    const slot = item.meta.idealTime || 'Morning';
    if (schedule[slot]) {
      schedule[slot].push({
        brandName: item.brandName,
        saltComposition: item.saltComposition,
        foodRelation: item.meta.foodRelation,
        rationale: item.meta.rationale
      });
    }
  });

  return { schedule, notes };
}


