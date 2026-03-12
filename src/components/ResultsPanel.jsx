import React, { useState } from 'react'

const JA_STORE_URL = 'https://janaushadhi.gov.in/LocateKendra.aspx'
const REPORT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSexample/viewform'

// ─── Translation helper for AI-generated text ────────────────────────────────
// Sends AI-generated strings through Groq for translation
async function translateTexts(texts, targetLang) {
  if (targetLang === 'en' || !texts || texts.length === 0) return texts
  const key = import.meta.env.VITE_GROQ_KEY
  if (!key) return texts
  const langNames = { hi: 'Hindi', bn: 'Bengali', te: 'Telugu', mr: 'Marathi', ta: 'Tamil', gu: 'Gujarati' }
  const langName = langNames[targetLang] || 'Hindi'
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        temperature: 0.1,
        messages: [{ role: 'user', content: `Translate each item in this JSON array to ${langName}. Keep medical/drug names and numbers in English. Return ONLY the JSON array, no markdown.\n\n${JSON.stringify(texts)}` }]
      })
    })
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content || ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : texts
  } catch { return texts }
}

export default function ResultsPanel({ results, preview, onReset, t, lang }) {
  const [card, setCard]         = useState(0)
  const [reported, setReported] = useState(false)
  const [translated, setTranslated] = useState(null)
  const [translating, setTranslating] = useState(false)

  // Auto-translate AI-generated fields when lang != en
  React.useEffect(() => {
    if (lang === 'en') { setTranslated(null); return }
    const info = results?.medicineInfo
    if (!info) return
    setTranslating(true)
    const toTranslate = [
      info.whatItDoes || '',
      info.howToTake || '',
      info.overdoseRisk || '',
      ...(info.commonUses || []),
      ...(info.sideEffects || []),
      ...(info.importantWarnings || []),
      info.doNotTakeWith || '',
      info.ayurvedicWarning || '',
      info.supplementWarning || '',
    ]
    translateTexts(toTranslate, lang).then(result => {
      let i = 0
      const uses = info.commonUses || []
      const side = info.sideEffects || []
      const warn = info.importantWarnings || []
      setTranslated({
        whatItDoes:        result[i++],
        howToTake:         result[i++],
        overdoseRisk:      result[i++],
        commonUses:        uses.map(() => result[i++]),
        sideEffects:       side.map(() => result[i++]),
        importantWarnings: warn.map(() => result[i++]),
        doNotTakeWith:     result[i++],
        ayurvedicWarning:  result[i++],
        supplementWarning: result[i++],
      })
      setTranslating(false)
    }).catch(() => setTranslating(false))
  }, [lang, results])

  const info = (translated || results?.medicineInfo || {})
  const alts = results?.alternatives || {}
  const auth = results?.authenticity || {}
  const jaAlts    = (alts.topAlternatives || []).filter(a => a.isJanAushadhi)
  const otherAlts = (alts.topAlternatives || []).filter(a => !a.isJanAushadhi)

  // Real savings % — computed from actual DB data, not hardcoded
  const brandedMrp    = results?.mrp ? parseFloat(results.mrp) : null
  const brandedUnitSz = results?.unitSize || null
  const brandedPerUnit = brandedMrp && brandedUnitSz
    ? (() => { const n = brandedUnitSz.match(/(\d+)/); return n ? Math.round(brandedMrp / parseInt(n[1]) * 100) / 100 : brandedMrp / 10 })()
    : brandedMrp ? brandedMrp / 10 : null

  const cheapestAlt = alts.topAlternatives?.[0]
  const savingsPct = (brandedPerUnit && cheapestAlt?.perUnit)
    ? Math.round((1 - cheapestAlt.perUnit / brandedPerUnit) * 100)
    : null
  const isCheapest = !alts.hasGenerics || (brandedPerUnit && cheapestAlt?.perUnit && cheapestAlt.perUnit >= brandedPerUnit)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px 24px', gap: 12, overflowY: 'auto' }}>

      {/* Top banner */}
      <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow)', animation: 'fadeUp 0.3s ease' }}>
        {preview
          ? <img src={preview} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
          : <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--greenlt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>💊</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{results.brandName || 'Medicine'}</div>
          <div style={{ fontSize: 11, color: 'var(--textlt)', marginTop: 1 }}>{results.saltComposition || results.productType}</div>
          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            {results.saltSource === 'QR_BARCODE' && <span style={badge('green')}>✓ QR VERIFIED</span>}
            {results.dataSource?.cdscoFound && <span style={badge('green')}>✓ CDSCO</span>}
            <span style={badge('blue')}>BPPI DB</span>
            {results.batchNumber && <span style={badge('gray')}>Batch: {results.batchNumber}</span>}
            {results.isExpired && <span style={badge('red')}>⚠ EXPIRED</span>}
            {translating && <span style={badge('amber')}>Translating...</span>}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', background: 'var(--greenlt)', padding: '3px 9px', borderRadius: 8, flexShrink: 0 }}>
          {results.confidence || 70}%
        </div>
      </div>

      {/* Low confidence warning */}
      {(results.confidence || 70) < 50 && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#92400E', lineHeight: 1.55 }}>
          ⚠ Low confidence scan — the image may be unclear or partially obscured. Results may be inaccurate. Try scanning in better light.
        </div>
      )}

      {/* Tab nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, animation: 'fadeUp 0.3s ease 0.1s both' }}>
        {[['🏛', 'Authentic.'], ['💡', 'Medicine'], ['💸', 'Save']].map(([icon, label], i) => (
          <button key={i} onClick={() => setCard(i)} style={{ padding: '9px 4px', borderRadius: 10, border: `1.5px solid ${card === i ? 'var(--green)' : 'var(--border)'}`, background: card === i ? 'var(--greenlt)' : '#fff', color: card === i ? 'var(--greendk)' : 'var(--textlt)', fontSize: 12, fontWeight: card === i ? 700 : 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'all 0.2s' }}>
            <span style={{ fontSize: 18 }}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {card === 0 && <AuthCard auth={auth} results={results} t={t} reported={reported} setReported={setReported} />}
      {card === 1 && <InfoCard info={info} results={results} translating={translating} />}
      {card === 2 && <AltCard alts={alts} jaAlts={jaAlts} otherAlts={otherAlts} savingsPct={savingsPct} isCheapest={isCheapest} />}

      {/* Scan again */}
      <button onClick={onReset} style={{ width: '100%', height: 48, background: 'var(--navy)', borderRadius: 13, color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 4 }}>
        📷 &nbsp;Scan Another Medicine
      </button>
    </div>
  )
}

// ─── CARD 1: AUTHENTICITY ────────────────────────────────────────────────────
function AuthCard({ auth, results, t, reported, setReported }) {
  const [expanded, setExpanded] = useState(false)
  const isGenuine = auth.status === 'LIKELY_GENUINE'
  const isFake    = auth.status === 'LIKELY_FAKE'

  const statusConfig = isGenuine ? {
    bg: '#F0FDF4', border: '#86EFAC', iconBg: '#16A34A', icon: '✓', iconColor: '#fff',
    titleColor: '#15803D', title: 'Registered medicine', sub: 'Found in CDSCO drug registry',
  } : isFake ? {
    bg: 'var(--redlt)', border: '#FECACA', iconBg: 'var(--red)', icon: '✕', iconColor: '#fff',
    titleColor: 'var(--red)', title: 'Possible fake', sub: 'Visual anomalies detected',
  } : {
    bg: '#FFFBEB', border: '#FCD34D', iconBg: 'var(--amber)', icon: '?', iconColor: '#fff',
    titleColor: '#92400E', title: 'Cannot determine', sub: 'Insufficient visual evidence',
  }

  return (
    <div style={{ background: statusConfig.bg, border: `1.5px solid ${statusConfig.border}`, borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.3s ease' }}>

      {/* Status row */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: statusConfig.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: statusConfig.iconColor, fontWeight: 700, flexShrink: 0, animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}>{statusConfig.icon}</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: statusConfig.titleColor }}>{statusConfig.title}</div>
          <div style={{ fontSize: 12, color: 'var(--textlt)' }}>{statusConfig.sub}</div>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.6)', padding: '12px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Genuine signals */}
        {auth.genuineSignalsFound?.length > 0 && (
          <div>
            <div style={sectionLabel('green')}>Genuine signals found</div>
            {auth.genuineSignalsFound.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#166534', marginBottom: 4, alignItems: 'flex-start' }}>
                <span style={{ color: '#16A34A', fontWeight: 700, flexShrink: 0 }}>✓</span>{s}
              </div>
            ))}
          </div>
        )}

        {/* Fake signals */}
        {auth.fakeSignalsFound?.length > 0 && (
          <div>
            <div style={sectionLabel('red')}>Suspicious signals</div>
            {auth.fakeSignalsFound.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#991B1B', marginBottom: 4, alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>⚠</span>{s}
              </div>
            ))}
          </div>
        )}

        {/* Fields table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Brand', results.brandName],
            ['Manufacturer', results.manufacturer],
            ['Type', results.productType],
            ['Schedule', results.medicineInfo?.prescriptionRequired ? 'Prescription (Rx)' : 'OTC — no prescription'],
            ['Expiry', results.expiryDate],
            ['Licence No.', results.licenceNumber],
          ].filter(([,v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'rgba(255,255,255,0.7)', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: 11, color: 'var(--textlt)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</span>
              <span style={{ fontSize: 12.5, color: 'var(--textmd)', fontWeight: 500, maxWidth: '60%', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* CDSCO fact — clean, no conflicting drug name */}
        {auth.cdscoBadge && (
          <div style={{ padding: '10px 13px', background: auth.cdscoFound ? '#F0FDF4' : 'var(--bgsoft)', border: `1px solid ${auth.cdscoFound ? '#86EFAC' : 'var(--border)'}`, borderRadius: 9 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: auth.cdscoFound ? '#15803D' : 'var(--textlt)', marginBottom: auth.cdscoIndication ? 4 : 0 }}>
              {auth.cdscoBadge}
            </div>
            {auth.cdscoIndication && (
              <div style={{ fontSize: 12, color: 'var(--textmd)', lineHeight: 1.5 }}>
                Approved use: {auth.cdscoIndication}
              </div>
            )}
            {auth.approvalDate && (
              <div style={{ fontSize: 11, color: 'var(--textlt)', marginTop: 3 }}>Since: {auth.approvalDate}</div>
            )}
          </div>
        )}

        {/* Expired */}
        {results.isExpired && (
          <div style={{ padding: '10px 12px', background: 'var(--redlt)', border: '1px solid #FECACA', borderRadius: 9, fontSize: 12.5, color: '#991B1B', lineHeight: 1.55 }}>
            ⚠ This medicine appears to be <strong>expired</strong>. Do not consume. Return to your chemist.
          </div>
        )}

        {/* Fake action */}
        {isFake && (
          <div style={{ padding: '10px 12px', background: 'var(--redlt)', border: '1px solid #FECACA', borderRadius: 9, fontSize: 12.5, color: '#991B1B', lineHeight: 1.55 }}>
            Do not consume. Return to chemist and ask for CDSCO licence proof.<br />Report to CDSCO: <strong>1800-180-3024</strong> (free)
          </div>
        )}
      </div>

      {/* Report button */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <button onClick={() => { window.open(REPORT_FORM_URL, '_blank'); setReported(true) }} style={{ width: '100%', padding: '10px', borderRadius: 10, background: reported ? 'var(--greenlt)' : 'var(--redlt)', border: `1.5px solid ${reported ? '#86EFAC' : '#FECACA'}`, fontSize: 12.5, fontWeight: 600, color: reported ? '#15803D' : 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {reported ? '✓ Report submitted. Thank you.' : '🚨 Report this as a fake'}
        </button>
      </div>
    </div>
  )
}

// ─── CARD 2: MEDICINE INFO ────────────────────────────────────────────────────
function InfoCard({ info, results, translating }) {
  const [showSide, setShowSide] = useState(false)
  const isAyurvedic   = results.productType === 'AYURVEDIC'
  const isSupplement  = results.productType === 'SUPPLEMENT'

  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.3s ease' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>💡 What is this?</div>
        {translating && <span style={badge('amber')}>Translating...</span>}
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <p style={{ fontSize: 13.5, color: 'var(--textmd)', lineHeight: 1.7, margin: 0 }}>{info.whatItDoes}</p>

        {info.howToTake && (
          <div style={{ padding: '10px 13px', background: 'var(--greenlt)', border: '1.5px solid #A7D9CA', borderRadius: 10 }}>
            <div style={sectionLabel('green')}>How to take</div>
            <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.6, margin: 0 }}>{info.howToTake}</p>
          </div>
        )}

        {info.commonUses?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {info.commonUses.map((u, i) => (
              <span key={i} style={{ fontSize: 11.5, background: '#F0F9FF', color: '#0369A1', borderRadius: 20, padding: '3px 11px', border: '1px solid #BAE6FD' }}>{u}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bgsoft)', borderRadius: 9, border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--textmd)' }}>Prescription required?</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: info.prescriptionRequired ? 'var(--redlt)' : 'var(--greenlt)', color: info.prescriptionRequired ? 'var(--red)' : 'var(--greendk)', letterSpacing: '0.04em' }}>
            {info.prescriptionRequired ? 'YES — Rx' : 'NO — OTC'}
          </span>
        </div>

        {info.importantWarnings?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {info.importantWarnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', background: '#FEF3C7', borderRadius: 10, borderLeft: '3px solid var(--amber)', alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <span style={{ fontSize: 12.5, color: '#78350F', lineHeight: 1.5 }}>{w}</span>
              </div>
            ))}
          </div>
        )}

        {info.sideEffects?.length > 0 && (
          <>
            <button onClick={() => setShowSide(s => !s)} style={{ fontSize: 12.5, color: 'var(--green)', fontWeight: 600, textAlign: 'left', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>{showSide ? '▲' : '▼'}</span> Side effects ({info.sideEffects.length})
            </button>
            {showSide && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {info.sideEffects.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 11px', background: 'var(--bgsoft)', borderRadius: 8, fontSize: 13, color: 'var(--textmd)', alignItems: 'center' }}>
                    <span style={{ color: 'var(--amber)', fontSize: 9 }}>●</span>{s}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {info.overdoseRisk && (
          <div style={{ padding: '9px 12px', background: 'var(--redlt)', borderRadius: 9, border: '1px solid #FECACA' }}>
            <div style={sectionLabel('red')}>⚠ Overdose risk</div>
            <p style={{ fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.55, margin: 0 }}>{info.overdoseRisk}</p>
          </div>
        )}

        {isAyurvedic && info.ayurvedicWarning && (
          <div style={{ padding: '10px 12px', background: 'var(--greenlt)', border: '1.5px solid #A7D9CA', borderRadius: 10, fontSize: 12.5, color: '#166534', lineHeight: 1.6 }}>
            🌿 {info.ayurvedicWarning}
          </div>
        )}

        {isSupplement && info.supplementWarning && (
          <div style={{ padding: '10px 12px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 10, fontSize: 12.5, color: '#78350F', lineHeight: 1.6 }}>
            💊 {info.supplementWarning}
          </div>
        )}

        {info.doNotTakeWith && (
          <div style={{ padding: '9px 12px', background: 'var(--redlt)', borderRadius: 9, fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.5 }}>
            <strong>🚫 Do not take with: </strong>{info.doNotTakeWith}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CARD 3: ALTERNATIVES ─────────────────────────────────────────────────────
function AltCard({ alts, jaAlts, otherAlts, savingsPct, isCheapest }) {
  const aiAlts = (alts.topAlternatives || []).filter(a => a.aiEstimated)

  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.3s ease' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>💸 Cheaper alternatives</div>
        <span style={badge('green')}>BPPI + AI</span>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Cheapest message OR savings hero */}
        {isCheapest ? (
          <div style={{ padding: '13px 15px', background: 'var(--greenlt)', border: '1.5px solid #A7D9CA', borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 30 }}>🏆</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--greendk)', marginBottom: 2 }}>This is already the cheapest available</div>
              <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.5 }}>No cheaper Jan Aushadhi generic found. You're already paying a fair price.</div>
            </div>
          </div>
        ) : savingsPct && savingsPct > 0 ? (
          <div style={{ padding: '13px 15px', background: 'var(--greenlt)', border: '1.5px solid #A7D9CA', borderRadius: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 38, color: 'var(--green)', lineHeight: 1, flexShrink: 0 }}>{savingsPct}%</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--greendk)', marginBottom: 3 }}>Savings available</div>
              <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.5 }}>{alts.savingsSummary}</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', background: 'var(--bgsoft)', borderRadius: 10, fontSize: 13, color: 'var(--textlt)' }}>
            {alts.savingsSummary || 'Cheaper alternatives listed below.'}
          </div>
        )}

        {/* Ask your chemist callout */}
        {alts.topAlternatives?.length > 0 && (
          <div style={{ padding: '10px 13px', background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 12.5, color: '#1E40AF', lineHeight: 1.6 }}>
            💬 <strong>At any chemist, say:</strong> "Do you have a cheaper version of {alts.topAlternatives[0]?.salt?.split(' ')[0] || 'this medicine'}?" — any brand with the same salt is legally equivalent.
          </div>
        )}

        {/* Jan Aushadhi */}
        {jaAlts.length > 0 && (
          <div>
            <div style={{ ...sectionLabel('green'), display: 'flex', alignItems: 'center', gap: 6 }}>
              🏛 Tier 1 — Jan Aushadhi <span style={badge('green')}>VERIFIED PRICE</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--textlt)', marginBottom: 8, marginTop: -4 }}>Govt stores · Cheapest option · ~14,000 locations</div>
            {jaAlts.map((med, i) => <AltRow key={i} med={med} highlight />)}
          </div>
        )}

        {/* Branded generics at any chemist */}
        {otherAlts.length > 0 && (
          <div>
            <div style={{ ...sectionLabel('blue'), display: 'flex', alignItems: 'center', gap: 6 }}>
              🏪 Tier 2 — Any chemist <span style={badge('blue')}>AI ESTIMATED</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--textlt)', marginBottom: 8, marginTop: -4 }}>Same molecule · Available everywhere · Prices approximate</div>
            {otherAlts.map((med, i) => <AltRow key={i} med={med} />)}
          </div>
        )}

        {/* Dose-mismatch alternatives — shown separately with explicit warning */}
        {alts.doseMismatchAlts?.length > 0 && (
          <div>
            <div style={{ padding: '9px 13px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>⚠ Different dose — ask your doctor first</div>
              <div style={{ fontSize: 11.5, color: '#78350F', lineHeight: 1.5 }}>These contain the same active salt but at a different strength. Do not substitute without a doctor's advice.</div>
            </div>
            {alts.doseMismatchAlts.map((med, i) => <AltRow key={i} med={med} dimmed />)}
          </div>
        )}

        {!alts.hasGenerics && !isCheapest && (
          <div style={{ padding: '10px 12px', background: 'var(--bgsoft)', borderRadius: 9, fontSize: 13, color: 'var(--textlt)', lineHeight: 1.5 }}>
            No cheaper alternatives found. Ask your doctor if a generic is available for this medicine.
          </div>
        )}

        {/* Find Jan Aushadhi store */}
        <a href={JA_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', background: 'var(--greenlt)', border: '1.5px solid #A7D9CA', borderRadius: 12, textDecoration: 'none' }}>
          <span style={{ fontSize: 20 }}>📍</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--greendk)' }}>Find Jan Aushadhi near me</div>
            <div style={{ fontSize: 11, color: '#166534' }}>janaushadhi.gov.in · 1800-180-8080 (free)</div>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: 16 }}>›</span>
        </a>

        {/* Live prices on pharmacy sites */}
        {alts.pharmacyLinks?.length > 0 && (
          <div>
            <div style={sectionLabel('gray')}>🔍 Check live prices</div>
            <div style={{ fontSize: 11.5, color: 'var(--textlt)', marginBottom: 8, marginTop: -4 }}>Opens pharmacy site with real-time prices for this salt</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {alts.pharmacyLinks.map(link => (
                <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, textDecoration: 'none', color: 'var(--navy)' }}>
                  <span style={{ fontSize: 16 }}>{link.logo}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{link.name}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--textlt)', fontSize: 12 }}>›</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ padding: '9px 12px', background: 'var(--bgsoft)', borderRadius: 9, fontSize: 11.5, color: 'var(--textlt)', lineHeight: 1.6, border: '1px solid var(--border)' }}>
          ⚠ Jan Aushadhi prices are from the official BPPI database. Branded generic prices are AI-estimated and may vary. Always verify at the chemist counter. Only buy from licensed pharmacies.
        </div>
      </div>
    </div>
  )
}

function AltRow({ med, highlight, dimmed }) {
  const displayMrp = med.mrp || med.estimatedMrp
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 12px', opacity: dimmed ? 0.7 : 1,
      background: highlight ? 'var(--greenlt)' : med.aiEstimated ? '#F0F9FF' : 'var(--bgsoft)',
      borderRadius: 10, marginBottom: 7,
      border: `1.5px solid ${highlight ? '#A7D9CA' : med.aiEstimated ? '#BFDBFE' : 'var(--border)'}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)' }}>{med.name}</span>
          {med.isJanAushadhi && <span style={badge('green')}>JAN AUSHADHI</span>}
          {med.aiEstimated   && <span style={badge('blue')}>AI EST.</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--textlt)', lineHeight: 1.5 }}>
          {med.brand && med.brand !== 'BPPI' && <span>{med.brand} · </span>}
          {med.unitSize || med.packSize || ''}
        </div>
        {med.availableAt && <div style={{ fontSize: 10.5, color: 'var(--green)', fontWeight: 600, marginTop: 2 }}>📍 {med.availableAt}</div>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
        {displayMrp && <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>₹{displayMrp}</div>}
        {med.perUnit && <div style={{ fontSize: 10.5, color: 'var(--textlt)' }}>₹{med.perUnit}/tablet</div>}
        {/* savings string already computed per-unit in dbService */}
        {med.savings && med.savings !== 'Jan Aushadhi price' && (
          <div style={{ fontSize: 11, color: med.savings.includes('pricier') ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>{med.savings}</div>
        )}
        {med.savingsNote && <div style={{ fontSize: 10.5, color: 'var(--textlt)', marginTop: 1 }}>{med.savingsNote}</div>}
      </div>
    </div>
  )
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function badge(color) {
  const configs = {
    green: { bg: '#DCFCE7', color: '#166534' },
    blue:  { bg: '#DBEAFE', color: '#1E40AF' },
    gray:  { bg: '#F3F4F6', color: '#6B7280' },
    red:   { bg: '#FEE2E2', color: '#991B1B' },
    amber: { bg: '#FEF3C7', color: '#92400E' },
  }
  const cfg = configs[color] || configs.gray
  return { fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.color, letterSpacing: '0.04em', display: 'inline-block' }
}

function sectionLabel(color) {
  const colors = { green: '#166534', red: '#991B1B', gray: '#6B7280', blue: '#1E40AF' }
  return { fontSize: 10.5, fontWeight: 700, color: colors[color] || '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7, display: 'block' }
}
