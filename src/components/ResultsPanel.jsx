import React, { useState } from 'react'

const C = {
  green: '#0F7A5A', greenDark: '#0A5740', greenLight: '#E8F5F0',
  navy: '#1A2B4A', cream: '#F8F5F0', saffron: '#E87722',
  white: '#FFFFFF', gray100: '#F3F4F6', gray300: '#D1D5DB',
  gray500: '#6B7280', gray700: '#374151',
  red: '#DC2626', redLight: '#FEF2F2',
  orange: '#EA580C', orangeLight: '#FFF7ED',
  blue: '#1D4ED8', blueLight: '#EFF6FF',
  yellow: '#D97706', yellowLight: '#FFFBEB',
}

export default function ResultsPanel({ results, preview, onReset }) {
  return (
    <div className="slide-up">
      {/* Medicine header */}
      <div style={{ background: C.white, borderRadius: 16, padding: 14, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
        {preview && (
          <img src={preview} alt="Scanned" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', border: `1px solid ${C.gray100}`, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: C.navy, lineHeight: 1.2, marginBottom: 2 }}>
            {results.brandName || 'Medicine'}
          </div>
          <div style={{ fontSize: 12, color: C.gray500, marginBottom: 2 }}>{results.saltComposition}</div>
          {results.manufacturer && <div style={{ fontSize: 11, color: C.gray300 }}>{results.manufacturer}</div>}
        </div>
        {results.confidence && (
          <div style={{ background: results.confidence >= 75 ? C.greenLight : C.yellowLight, color: results.confidence >= 75 ? C.green : C.yellow, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {results.confidence}% read
          </div>
        )}
      </div>

      {/* Beta notice on results too */}
      <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
        ⚠️ <strong>Beta:</strong> This is AI-estimated. We're still building full CDSCO database integration. Verify important decisions with a pharmacist.
      </div>

      {/* Card 1: Authenticity */}
      <AuthenticityCard auth={results.authenticity} />

      {/* Card 2: Medicine Info */}
      <MedicineInfoCard info={results.medicineInfo} />

      {/* Card 3: Alternatives */}
      <AlternativesCard alt={results.alternatives} brandedMrp={results.mrp} />

      {/* Disclaimer */}
      <p style={{ fontSize: 11, color: C.gray500, textAlign: 'center', lineHeight: 1.6, margin: '16px 0 12px' }}>
        This information is for awareness only and does not replace advice from a doctor or pharmacist. Always consult a healthcare professional before changing medication.
      </p>

      {/* Scan again */}
      <button
        onClick={onReset}
        style={{ width: '100%', background: C.green, color: '#fff', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 700, boxShadow: '0 4px 14px rgba(15,122,90,0.3)' }}
      >
        📷 Scan Another Medicine
      </button>
    </div>
  )
}

// ─── Card 1: Authenticity ─────────────────────────────────────────
function AuthenticityCard({ auth }) {
  const [expanded, setExpanded] = useState(false)
  if (!auth) return null

  const configs = {
    LIKELY_GENUINE: { bg: '#F0FDF4', border: '#86EFAC', icon: '✅', color: '#166534', headline: 'Looks Genuine' },
    LIKELY_FAKE:    { bg: C.redLight, border: '#FCA5A5', icon: '🚨', color: C.red, headline: 'Possible Fake — Be Careful' },
    CANNOT_DETERMINE: { bg: C.yellowLight, border: '#FCD34D', icon: '🔍', color: C.yellow, headline: 'Cannot Determine' },
  }
  const cfg = configs[auth.status] || configs.CANNOT_DETERMINE

  return (
    <div style={{ background: cfg.bg, border: `2px solid ${cfg.border}`, borderRadius: 18, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
          REAL OR FAKE?
          <span style={{ marginLeft: 8, background: '#1A2B4A', color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 10 }}>AI Estimated</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>{cfg.icon}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: cfg.color, marginBottom: 4 }}>{cfg.headline}</div>
            <div style={{ fontSize: 13, color: cfg.color, lineHeight: 1.5 }}>{auth.reason}</div>
          </div>
        </div>
      </div>

      {auth.warning && (
        <div style={{ margin: '0 12px 12px', background: C.redLight, border: `1px solid #FCA5A5`, borderRadius: 10, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 12, color: C.red, fontWeight: 600 }}>⚠️ {auth.warning}</p>
        </div>
      )}

      {auth.status === 'LIKELY_FAKE' && (
        <div style={{ margin: '0 12px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: C.red }}>What to do:</p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#7F1D1D', lineHeight: 1.8 }}>
            <li>Do not consume this medicine</li>
            <li>Return it to the chemist and ask for CDSCO registration proof</li>
            <li>Report it: CDSCO helpline <strong>1800-180-3024</strong> (free)</li>
          </ul>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', background: 'transparent', color: C.gray500, fontSize: 12, padding: '8px 14px', textAlign: 'left', borderTop: `1px solid ${cfg.border}` }}
      >
        {expanded ? '▲ Hide details' : '▼ How was this determined?'}
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px', fontSize: 12, color: C.gray700, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 6px' }}>{auth.cdscoBadge}</p>
          <p style={{ margin: 0, color: C.gray500, fontStyle: 'italic' }}>
            Note: Agada uses AI to assess legitimacy from visual cues. It cannot do a live CDSCO database query in this beta version. Full integration is coming. Always verify with a licensed pharmacist for certainty.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Card 2: Medicine Info ────────────────────────────────────────
function MedicineInfoCard({ info }) {
  const [expanded, setExpanded] = useState(false)
  if (!info) return null

  return (
    <div style={{ background: C.blueLight, border: '2px solid #BFDBFE', borderRadius: 18, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
          WHAT IS THIS?
          <span style={{ marginLeft: 8, background: '#7C3AED', color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 10 }}>AI Estimated</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>💊</span>
          <p style={{ margin: 0, fontSize: 14, color: '#1E3A5F', lineHeight: 1.6 }}>{info.whatItDoes}</p>
        </div>
      </div>

      {info.commonUses?.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {info.commonUses.map((use, i) => (
            <span key={i} style={{ background: '#DBEAFE', color: C.blue, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>{use}</span>
          ))}
        </div>
      )}

      <div style={{ padding: '0 14px 12px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
          background: info.prescriptionRequired ? '#FEE2E2' : '#DCFCE7',
          color: info.prescriptionRequired ? C.red : C.green,
          padding: '5px 12px', borderRadius: 20,
        }}>
          {info.prescriptionRequired ? '🩺 Prescription Required (Schedule H)' : '✅ Available Over the Counter'}
        </span>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', background: 'transparent', color: C.gray500, fontSize: 12, padding: '8px 14px', textAlign: 'left', borderTop: '1px solid #BFDBFE' }}
      >
        {expanded ? '▲ Hide warnings & storage' : '▼ Show warnings & storage'}
      </button>

      {expanded && (
        <div style={{ padding: '12px 14px', borderTop: `1px solid #BFDBFE` }}>
          {info.importantWarnings?.length > 0 && (
            <div style={{ background: C.yellowLight, border: '1px solid #FCD34D', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 12, color: '#92400E' }}>⚠️ Important warnings</p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#78350F', lineHeight: 1.8 }}>
                {info.importantWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {info.doNotTakeWith && (
            <div style={{ background: C.redLight, border: '1px solid #FCA5A5', borderRadius: 10, padding: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#7F1D1D' }}><strong>🚫 Interactions:</strong> {info.doNotTakeWith}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Card 3: Alternatives ─────────────────────────────────────────
function AlternativesCard({ alt, brandedMrp }) {
  if (!alt) return null

  return (
    <div style={{ background: C.orangeLight, border: '2px solid #FED7AA', borderRadius: 18, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
          ARE YOU OVERPAYING?
          <span style={{ marginLeft: 8, background: '#0F7A5A', color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 10 }}>Jan Aushadhi</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>💰</span>
          <p style={{ margin: 0, fontSize: 14, color: '#7C2D12', lineHeight: 1.5, fontWeight: 600 }}>{alt.savingsSummary}</p>
        </div>
      </div>

      {alt.topAlternatives?.length > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          {/* Price comparison table */}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #FED7AA' }}>
            <div style={{ background: C.navy, color: '#fff', display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '8px 12px', fontSize: 11, fontWeight: 700, gap: 8 }}>
              <span>Medicine</span>
              <span style={{ textAlign: 'center' }}>Price</span>
              <span style={{ textAlign: 'right' }}>Savings</span>
            </div>

            {brandedMrp && (
              <div style={{ background: '#FEF2F2', display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '8px 12px', gap: 8, alignItems: 'center', borderBottom: '1px solid #FED7AA' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.gray700 }}>Branded (what you paid)</div>
                  <div style={{ fontSize: 11, color: C.gray500 }}>Current</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.red, textAlign: 'center' }}>₹{brandedMrp}</span>
                <span style={{ fontSize: 11, color: C.gray500, textAlign: 'right' }}>—</span>
              </div>
            )}

            {alt.topAlternatives.map((med, i) => (
              <div key={i} style={{ background: i === 0 ? '#F0FDF4' : C.white, display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '8px 12px', gap: 8, alignItems: 'center', borderBottom: i < alt.topAlternatives.length - 1 ? '1px solid #FED7AA' : 'none' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? C.green : C.gray700 }}>
                    {i === 0 && <span style={{ background: C.green, color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 10, marginRight: 5 }}>★ Best</span>}
                    {med.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray500 }}>Jan Aushadhi · {med.salt}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.green, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  ~₹{med.estimatedMrp}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, background: '#DCFCE7', color: C.green, borderRadius: 8, padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {med.savingsVsBranded}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!alt.hasGenerics && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ background: C.white, borderRadius: 10, padding: 10, fontSize: 13, color: C.gray700 }}>
            No Jan Aushadhi generic found for this medicine. Ask your doctor if a generic alternative is available.
          </div>
        </div>
      )}

      {/* Why generics work */}
      <div style={{ margin: '0 14px 14px', background: C.white, borderRadius: 10, padding: 10, border: '1px solid #FED7AA' }}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 12, color: C.gray700 }}>❓ Are generics as good?</p>
        <p style={{ margin: 0, fontSize: 12, color: C.gray500, lineHeight: 1.6 }}>
          Yes. CDSCO requires all generics to be <strong>bioequivalent</strong> — same active ingredient, same therapeutic effect. The price difference is marketing and packaging, not medicine quality.
        </p>
      </div>

      {/* Where to find */}
      <div style={{ margin: '0 14px 14px', background: C.white, borderRadius: 10, padding: 10, border: '1px solid #FED7AA' }}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 12, color: C.gray700 }}>📍 Where to buy</p>
        <p style={{ margin: 0, fontSize: 12, color: C.gray500, lineHeight: 1.6 }}>
          {alt.whereToFind || 'Over 14,000 Jan Aushadhi Kendras across India. Search at janaushadhi.gov.in or call 1800-180-8080 (free).'}
        </p>
      </div>
    </div>
  )
}
