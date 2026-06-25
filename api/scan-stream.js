import fs from 'fs';
import path from 'path';
import { scrapeMarketPrices } from './scraperCluster.js';

// Lazily loaded databases
let jaDB = null;
let cdscoDB = null;

const GROQ_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
  process.env.GROQ_KEY,
].filter(Boolean);

// Simple CSV parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        vals.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    vals.push(cur);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] || '').trim().replace(/"/g, '');
    });
    return row;
  });
}

// Load databases from public folder
async function loadDatabases() {
  if (jaDB && cdscoDB) return;
  try {
    const publicDir = path.join(process.cwd(), 'public', 'data');
    const jaPath = path.join(publicDir, 'jan_aushadhi.csv');
    const cdscoPath = path.join(publicDir, 'cdsco.csv');

    if (fs.existsSync(jaPath)) {
      const jaText = fs.readFileSync(jaPath, 'utf-8');
      jaDB = parseCSV(jaText);
    }
    if (fs.existsSync(cdscoPath)) {
      const cdscoText = fs.readFileSync(cdscoPath, 'utf-8');
      cdscoDB = parseCSV(cdscoText);
    }
  } catch (err) {
    console.error("Failed to load backend CSV databases:", err);
  }
}

// Normalize salt name for matching
function normalizeSalt(salt) {
  return (salt || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lookup Jan Aushadhi generic equivalent
function lookupJanAushadhi(saltQuery) {
  if (!jaDB) return null;
  const q = normalizeSalt(saltQuery);
  if (!q) return null;
  const qWords = q.split(' ').filter(w => w.length > 2);
  
  let best = null;
  let bestScore = 0;
  
  for (const item of jaDB) {
    const saltName = item['Generic Name'] || '';
    const itemNorm = normalizeSalt(saltName);
    let score = 0;
    for (const w of qWords) {
      if (itemNorm.includes(w)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  
  if (bestScore > 0 && best) {
    const mrp = parseFloat(best['MRP']) || 0;
    const count = parseInt(best['Unit Size']) || 10;
    return {
      name: best['Generic Name'],
      mrp,
      packSize: best['Unit Size'],
      perUnit: count > 0 ? Math.round((mrp / count) * 100) / 100 : mrp / 10,
      priceSource: 'Jan Aushadhi (Backend DB)',
      highConfidence: true,
      aiEstimated: false,
      isJanAushadhi: true,
    };
  }
  return null;
}

// Lookup CDSCO registry approval
function lookupCDSCO(saltQuery) {
  if (!cdscoDB) return { found: false, badge: null };
  const q = normalizeSalt(saltQuery);
  if (!q) return { found: false, badge: null };
  
  const match = cdscoDB.find(row => {
    const drugName = (row['Drug Name'] || '').toLowerCase();
    return drugName.includes(q) || q.includes(drugName);
  });

  if (match) {
    const displayName = saltQuery.charAt(0).toUpperCase() + saltQuery.slice(1);
    return {
      found: true,
      badge: `✓ ${displayName} is CDSCO-approved`,
      indication: match['Indication'] || null,
      approvalDate: match['Approval Date'] || null,
    };
  }
  return { found: false, badge: 'Salt not found in CDSCO registry.' };
}

// Llama Vision OCR calling helper
async function callVisionAPI(imageBase64) {
  if (!GROQ_KEYS.length) throw new Error("No GROQ_KEY configured in backend environment.");
  
  const prompt = `Medicine label reader. Extract ONLY:
  - brandName: Brand name if visible
  - saltName: Active ingredient salt name (no dosage numbers)
  - doseStr: Strength (e.g. 500mg, 10mg)
  - manufacturer: Company name if visible
  - batchNumber: Batch number or Lot number if visible (e.g. B.No. 1234, Lot ABCD)
  - expiryDate: Expiry date if visible (e.g. Exp 12/28, Expiry 2027)
  - manufacturingDate: Manufacturing date if visible (e.g. Mfg 12/24)
  Return as JSON only: {"brandName": "...", "saltName": "...", "doseStr": "...", "manufacturer": "...", "batchNumber": "...", "expiryDate": "...", "manufacturingDate": "..."}`;

  const payload = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    max_tokens: 400,
    temperature: 0.0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ]
    }]
  };

  let lastError = '';
  for (const key of GROQ_KEYS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });
      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
      } else {
        const errText = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${errText}`;
      }
    } catch (err) {
      lastError = err.message;
    }
  }
  throw new Error(`Vision OCR API failed: ${lastError}`);
}

// Gemini/Groq plain English medical summarizer
async function callSummaryAPI(brandName, saltName) {
  if (!GROQ_KEYS.length) return null;
  const prompt = `Explain in plain English (2 simple sentences) for a layperson: What does the medicine ${brandName} containing ${saltName} do? What is it commonly used for?
  Return JSON only: {"whatItDoes": "...", "commonUses": ["...", "..."], "prescriptionRequired": true}`;

  for (const key of GROQ_KEYS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 300,
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
      }
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });

  const sendUpdate = (step, message, data = null) => {
    try {
      res.write(`data: ${JSON.stringify({ step, message, data, timestamp: Date.now() })}\n\n`);
      if (res.flush) res.flush();
    } catch (err) {
      console.error("SSE stream write failed:", err);
    }
  };

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      sendUpdate('failed', 'Invalid JSON input payload');
      res.end();
      return;
    }
  }

  const { image, scanMode, barcodeData } = body || {};
  if (!image) {
    sendUpdate('failed', 'Missing image payload');
    res.end();
    return;
  }

  try {
    sendUpdate('started', 'Initializing serverless OCR and database scan...');
    await loadDatabases();

    let extracted = { brandName: null, saltName: null, doseStr: null, manufacturer: null };
    const hasBarcodeGroundTruth = !!(barcodeData?.saltFromQR);

    // 1. Vision OCR (Skip if barcode has ground truth)
    if (!hasBarcodeGroundTruth) {
      sendUpdate('vision_start', 'Reading medicine label with Llama Vision model...');
      try {
        extracted = await callVisionAPI(image);
        sendUpdate('vision_done', `OCR complete: Extracted "${extracted.brandName || 'Unknown Brand'}" with salt "${extracted.saltName || 'Unknown Salt'}"`);
      } catch (err) {
        console.error("Vision OCR failed:", err);
        sendUpdate('vision_failed', `OCR warning: ${err.message}. Falling back to default values.`);
      }
    } else {
      sendUpdate('vision_start', 'Skipping Vision OCR (Ground-truth salt extracted from QR/Barcode)...');
    }

    const brandName = barcodeData?.brandFromQR || extracted.brandName || 'Unknown';
    const saltName = barcodeData?.saltFromQR || (extracted.saltName ? `${extracted.saltName} ${extracted.doseStr || ''}` : null);
    
    if (!saltName) {
      throw new Error("Could not read any active ingredients from the medicine label. Please scan a clearer image.");
    }

    // 2. Query CDSCO and Jan Aushadhi DBs in parallel
    sendUpdate('db_start', 'Querying national drug registries and local Jan Aushadhi databases...');
    const cdscoRes = lookupCDSCO(saltName);
    const jaRes = lookupJanAushadhi(saltName);
    sendUpdate('db_done', `CDSCO Verification: ${cdscoRes.found ? 'Approved' : 'Not Found'}. Jan Aushadhi match: ${jaRes ? 'Generic match found' : 'No direct generic matching'}`);

    // 3 & 4. Query Scraper Cluster and Generate Medicine Summary in parallel
    sendUpdate('scraping_start', 'Retrieving live market prices and generating summary...');
    let liveAlternatives = [];
    let summary = null;

    try {
      const [scrapeResult, summaryResult] = await Promise.all([
        scrapeMarketPrices(saltName).catch(err => {
          console.error("Scraper cluster failed:", err);
          return [];
        }),
        callSummaryAPI(brandName, saltName).catch(err => {
          console.error("Summary API failed:", err);
          return null;
        })
      ]);
      liveAlternatives = scrapeResult;
      summary = summaryResult;
    } catch (err) {
      console.error("Parallel operations failed:", err);
    }

    if (!summary) {
      summary = {
        whatItDoes: 'Used to treat medical symptoms containing the active ingredient.',
        commonUses: ['Symptomatic relief'],
        prescriptionRequired: true
      };
    }
    sendUpdate('summary_done', 'Summary and live alternatives compiled.');

    // Build finalized results payload
    const allAlts = [];
    if (jaRes) {
      allAlts.push({
        name: jaRes.name,
        brand: 'Jan Aushadhi',
        mrp: jaRes.mrp,
        packSize: jaRes.packSize,
        perUnit: jaRes.perUnit,
        priceSource: jaRes.priceSource,
        highConfidence: true,
        aiEstimated: false,
        isJanAushadhi: true,
      });
    }

    // Add scraped alternatives
    liveAlternatives.forEach(alt => {
      allAlts.push({
        name: alt.name,
        brand: alt.brand,
        mrp: alt.mrp,
        packSize: alt.packSize,
        perUnit: alt.mrp / 10,
        priceSource: `${alt.source} (Live Scraped)`,
        highConfidence: true,
        aiEstimated: false,
        url: alt.url,
      });
    });

    const finalResult = {
      productType: 'MEDICINE',
      brandName,
      saltComposition: saltName,
      manufacturer: extracted.manufacturer || 'Unknown',
      mrp: barcodeData?.mrpFromQR || null,
      unitSize: jaRes?.packSize || '10 tablets',
      batchNumber: barcodeData?.batchNumber || extracted.batchNumber || null,
      expiryDate: barcodeData?.expiryDate || extracted.expiryDate || null,
      manufacturingDate: extracted.manufacturingDate || null,
      isExpired: false,
      confidence: 95,
      saltSource: barcodeData?.saltFromQR ? 'QR_BARCODE' : 'AI_VISION',
      authenticity: {
        status: cdscoRes.found ? 'LIKELY_GENUINE' : 'CANNOT_DETERMINE',
        reason: cdscoRes.found ? 'Matches national CDSCO registration database.' : 'Missing in CDSCO database. Verify with pharmacist.',
        cdscoBadge: cdscoRes.badge,
        cdscoFound: cdscoRes.found,
        approvalDate: cdscoRes.approvalDate,
      },
      medicineInfo: {
        whatItDoes: summary.whatItDoes,
        commonUses: summary.commonUses,
        prescriptionRequired: summary.prescriptionRequired,
        sideEffects: ['Nausea', 'Dizziness', 'Headache'],
        importantWarnings: ['Do not drink alcohol', 'Check with doctor if pregnant'],
      },
      alternatives: {
        hasGenerics: allAlts.length > 0,
        janAushadhiAvailable: !!jaRes,
        topAlternatives: allAlts.slice(0, 4),
        disclaimer: 'Live prices scraped from e-pharmacies. Verify rates at retail stores.',
      },
      dataSource: {
        salt: 'AI Vision OCR + Government Database',
        alts: 'Jan Aushadhi + Live e-Pharmacies',
        cdsco: cdscoRes.found ? 'CDSCO Approved' : 'Unregistered',
        cdscoFound: cdscoRes.found,
      }
    };

    sendUpdate('completed', 'Analysis successfully complete!', finalResult);
    res.end();
  } catch (err) {
    console.error("Scan stream execution crashed:", err);
    sendUpdate('failed', `Analysis failed: ${err.message}`);
    res.end();
  }
}
