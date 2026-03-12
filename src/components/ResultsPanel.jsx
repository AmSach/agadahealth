import React, { useState } from 'react'

const REPORT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSexample/viewform'
const JA_STORE_URL = 'https://janaushadhi.gov.in/LocateKendra.aspx'

export default function ResultsPanel({ results, preview, onReset, t, lang }) {
  const [card, setCard] = useState(0)
  const [reported, setReported] = useState(false)
  const CARDS = 3

  const goNext = () => setCard(c => Math.min(c + 1, CARDS - 1))
  const goPrev = () => setCard(c => Math.max(c - 1, 0))

  const productIcon = results.productType === 'AYURVEDIC' ? '🌿'
    : results.productType === 'SUPPLEMENT' ? '💊'
    : results.productType === 'DROPS' ? '💧' : '💊'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Scanned pill banner */}
      <div style={{ padding: '14px 20px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--rim)', borderRadius: 12, padding: '10px 14px' }}>
          {preview
            ? <img src={preview} alt="" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--forest)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{productIcon}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: 'var(--cream)', display: 'block', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {results.brandName || 'Medicine'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--stone)', fontFamily: "'JetBrains Mono', monospace" }}>
              {results.saltComposition || results.productType}
              {results.manufacturer ? ` · ${results.manufacturer.slice(0, 20)}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            {results.confidence && (
              <div style={{ background: results.confidence >= 70 ? 'rgba(26,77,46,0.3)' : results.confidence >= 50 ? 'rgba(200,136,32,0.2)' : 'rgba(160,64,48,0.25)', color: results.confidence >= 70 ? 'var(--forestgl)' : results.confidence >= 50 ? 'var(--amberlt)' : 'var(--terralt)', borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700 }}>
                {results.confidence}%
              </div>
            )}
            {results.productType && results.productType !== 'MEDICINE' && (
              <div style={{ background: 'rgba(26,77,46,0.2)', color: 'var(--forestgl)', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em' }}>
                {results.productType}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Low confidence banner */}
      {results.confidence < 50 && (
        <div style={{ margin: '0 20px 8px', background: 'rgba(200,136,32,0.1)', border: '1px solid var(--amber)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--amberlt)', lineHeight: 1.5 }}>
          ⚠ {t.confidenceLow} — {t.confidenceLowDesc}
        </div>
      )}

      {/* Progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 20px', flexShrink: 0 }}>
        {[0, 1, 2].map(i => (
          <div key={i} onClick={() => setCard(i)} style={{ height: 4, borderRadius: 2, cursor: 'pointer', transition: 'all 0.4s ease', width: i === card ? 44 : 28, background: i < card ? 'var(--forestmd)' : i === card ? 'var(--forestlt)' : 'var(--rim)' }} />
        ))}
      </div>

      {/* Card stage */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '0 16px' }}>
        <CardAuth visible={card === 0} results={results} t={t} reported={reported} setReported={setReported} />
        <CardInfo visible={card === 1} results={results} t={t} />
        <CardAlt  visible={card === 2} results={results} t={t} />
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 16px', flexShrink: 0 }}>
        <button onClick={goPrev} disabled={card === 0} style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--rim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--mist)', opacity: card === 0 ? 0.2 : 1 }}>←</button>
        <span style={{ fontSize: 12, color: 'var(--stone)' }}><strong style={{ color: 'var(--cream)', fontSize: 13 }}>{card + 1}</strong> of 3</span>
        {card < 2
          ? <button onClick={goNext} style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--forest)', border: '1px solid var(--forestmd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--cream)' }}>→</button>
          : <button onClick={onReset} style={{ height: 44, padding: '0 16px', borderRadius: 12, background: 'var(--forest)', border: '1px solid var(--forestmd)', fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>📷 New</button>
        }
      </div>
    </div>
  )
}

/* ── CARD 1: AUTHENTICITY ── */
function CardAuth({ visible, results, t, reported, setReported }) {
  const [expanded, setExpanded] = useState(false)
  const auth = results?.authenticity || {}

  const isGenuine = auth.status === 'LIKELY_GENUINE'
  const isFake    = auth.status === 'LIKELY_FAKE'

  const cfg = isGenuine ? {
    bg: 'var(--vbg)', border: 'rgba(42,120,72,0.3)',
    icon: '✓', iconBg: 'var(--verified)', statusColor: '#5DC882',
    title: t.genuine, sub: t.genuineSub,
    badgeText: t.badgeVerified, badgeBg: 'rgba(42,120,72,0.2)',
  } : isFake ? {
    bg: 'rgba(160,64,48,0.06)', border: 'rgba(160,64,48,0.4)',
    icon: '✕', iconBg: 'var(--terra)', statusColor: 'var(--terralt)',
    title: t.likelyFake, sub: t.likelyFakeSub,
    badgeText: 'SUSPICIOUS ⚠', badgeBg: 'rgba(160,64,48,0.25)',
  } : {
    bg: 'var(--panel)', border: 'rgba(200,136,32,0.3)',
    icon: '?', iconBg: 'rgba(200,136,32,0.6)', statusColor: 'var(--amberlt)',
    title: t.cannotDetermine, sub: t.cannotDetermineSub,
    badgeText: t.badgeAI, badgeBg: 'rgba(200,136,32,0.15)',
  }

  const genuineSignals = auth.genuineSignalsFound || []
  const fakeSignals    = auth.fakeSignalsFound    || []

  return (
    <BigCard visible={visible}>
      <div style={{ flex: 1, borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: cfg.bg, border: `1px solid ${cfg.border}` }}>

        <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(42,120,72,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏛</div>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--cream)' }}>{t.cardAuth}</span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', padding: '4px 9px', borderRadius: 6, textTransform: 'uppercase', background: cfg.badgeBg, color: cfg.statusColor }}>{cfg.badgeText}</span>
        </div>

        <div style={{ padding: '16px 18px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: cfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both', boxShadow: isGenuine ? '0 0 28px rgba(42,120,72,0.5)' : 'none' }}>
              {cfg.icon}
            </div>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: cfg.statusColor, marginBottom: 2 }}>{cfg.title}</div>
              <div style={{ fontSize: 12, color: 'var(--stone)' }}>{cfg.sub}</div>
            </div>
          </div>

          {/* Genuine signals found */}
          {genuineSignals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--stone)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em', textTransform: 'uppercase' }}>GENUINE SIGNALS</span>
              {genuineSignals.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5DC882' }}>
                  <span style={{ color: 'var(--verified)', fontWeight: 700 }}>✓</span> {s}
                </div>
              ))}
            </div>
          )}

          {/* Fake signals found */}
          {fakeSignals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--stone)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em', textTransform: 'uppercase' }}>SUSPICIOUS SIGNALS</span>
              {fakeSignals.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--terralt)' }}>
                  <span style={{ fontWeight: 700 }}>✕</span> {s}
                </div>
              ))}
            </div>
          )}

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              [t.fieldBrand,       results.brandName || '—'],
              [t.fieldMfr,         results.manufacturer || '—'],
              [t.fieldProductType, results.productType || 'MEDICINE'],
              [t.fieldSchedule,    results.medicineInfo?.prescriptionRequired ? t.rxLabel : t.otcLabel],
              [t.fieldStatus,      isGenuine ? t.activeLabel : (auth.warning || '—'), isGenuine],
            ].map(([k, v, isLive]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 9 }}>
                <span style={{ fontSize: 10, color: 'var(--stone)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em', flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 12, color: isLive ? '#5DC882' : 'var(--mist)', fontWeight: 500, maxWidth: '58%', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Expandable: CDSCO reasoning */}
          {auth.cdscoBadge && (
            <>
              <button onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--stone)', padding: '4px 0' }}>
                <span>{expanded ? '▲' : '▼'}</span> How was this determined?
              </button>
              {expanded && (
                <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 9, fontSize: 11.5, color: 'var(--stone)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--mist)', display: 'block', marginBottom: 4 }}>CDSCO Registry:</strong>
                  {auth.cdscoBadge}
                  <br /><br />
                  <strong style={{ color: 'var(--mist)', display: 'block', marginBottom: 4 }}>Visual evidence:</strong>
                  {auth.reason}
                  <br /><br />
                  <em style={{ color: 'var(--ash)', fontSize: 10.5 }}>Note: Agada uses AI visual analysis only in this beta version. Full live CDSCO database integration coming in v2.</em>
                </div>
              )}
            </>
          )}

          {/* Fake action */}
          {isFake && (
            <div style={{ padding: '10px 12px', background: 'rgba(160,64,48,0.15)', border: '1px solid var(--terra)', borderRadius: 10, fontSize: 12, color: 'var(--terralt)', lineHeight: 1.6 }}>
              {t.fakeWarning}
            </div>
          )}
        </div>

        {/* Report fake */}
        <div style={{ padding: '10px 18px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => { window.open(REPORT_FORM_URL, '_blank'); setReported(true) }} style={{ width: '100%', padding: '10px', borderRadius: 10, background: reported ? 'rgba(42,120,72,0.2)' : 'rgba(160,64,48,0.12)', border: `1px solid ${reported ? 'var(--forestmd)' : 'var(--terra)'}`, fontSize: 12, fontWeight: 600, color: reported ? 'var(--forestgl)' : 'var(--terralt)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {reported ? t.reportSent : <><span>{t.reportFake}</span><span style={{ fontSize: 10, fontWeight: 400, color: 'var(--stone)' }}>— {t.reportFakeSubtitle}</span></>}
          </button>
        </div>
      </div>
    </BigCard>
  )
}

/* ── CARD 2: MEDICINE INFO ── */
function CardInfo({ visible, results, t }) {
  const [showSide, setShowSide] = useState(false)
  const info = results?.medicineInfo || {}
  const isAyurvedic  = results.productType === 'AYURVEDIC'
  const isSupplement = results.productType === 'SUPPLEMENT'

  return (
    <BigCard visible={visible}>
      <div style={{ flex: 1, borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid rgba(200,136,32,0.22)' }}>

        <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(200,136,32,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💡</div>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--cream)' }}>{t.cardInfo}</span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', padding: '4px 9px', borderRadius: 6, textTransform: 'uppercase', background: 'rgba(200,136,32,0.15)', color: 'var(--amberlt)' }}>{t.badgeAI}</span>
        </div>

        <div style={{ padding: '14px 18px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>

          {/* What it does */}
          <p style={{ fontSize: 13.5, color: 'var(--mist)', lineHeight: 1.7, margin: 0 }}>{info.whatItDoes}</p>

          {/* How to take */}
          {info.howToTake && (
            <div style={{ padding: '9px 12px', background: 'rgba(26,77,46,0.1)', border: '1px solid rgba(26,77,46,0.2)', borderRadius: 10, fontSize: 12.5, color: 'var(--mist)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--forestgl)', fontSize: 11, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>How to take</strong>
              {info.howToTake}
            </div>
          )}

          {/* Uses */}
          {info.commonUses?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {info.commonUses.map((u, i) => (
                <span key={i} style={{ fontSize: 11, background: 'rgba(200,136,32,0.1)', color: 'var(--amberlt)', borderRadius: 20, padding: '3px 10px', border: '1px solid rgba(200,136,32,0.15)' }}>{u}</span>
              ))}
            </div>
          )}

          {/* Rx */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: 'rgba(255,255,255,0.025)', borderRadius: 9 }}>
            <span style={{ fontSize: 12, color: 'var(--stone)', flex: 1 }}>{t.rxLabel}?</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: info.prescriptionRequired ? 'rgba(160,64,48,0.2)' : 'rgba(26,77,46,0.2)', color: info.prescriptionRequired ? 'var(--terralt)' : 'var(--forestgl)', letterSpacing: '0.04em' }}>
              {info.prescriptionRequired ? t.rxYes : t.rxNo}
            </span>
          </div>

          {/* Important warnings */}
          {info.importantWarnings?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {info.importantWarnings.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'rgba(160,64,48,0.1)', borderRadius: 10, borderLeft: '2px solid var(--terra)' }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>⚠</span>
                  <span style={{ fontSize: 12.5, color: 'var(--mist)', lineHeight: 1.45 }}>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Side effects — expandable */}
          {info.sideEffects?.length > 0 && (
            <>
              <button onClick={() => setShowSide(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--amberlt)', padding: '4px 0', fontWeight: 600 }}>
                <span>{showSide ? '▲' : '▼'}</span> Side effects ({info.sideEffects.length})
              </button>
              {showSide && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {info.sideEffects.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, fontSize: 12, color: 'var(--mist)' }}>
                      <span style={{ color: 'var(--amber)', fontSize: 10 }}>●</span> {s}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Overdose risk */}
          {info.overdoseRisk && (
            <div style={{ padding: '9px 12px', background: 'rgba(160,64,48,0.08)', borderRadius: 9, fontSize: 12, color: 'var(--mist)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--terralt)', fontSize: 11, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>⚠ Overdose risk</strong>
              {info.overdoseRisk}
            </div>
          )}

          {/* Ayurvedic */}
          {isAyurvedic && info.ayurvedicWarning && (
            <div style={{ padding: '10px 12px', background: 'rgba(26,77,46,0.1)', border: '1px solid var(--forestmd)', borderRadius: 10, fontSize: 12, color: 'var(--mist)', lineHeight: 1.6 }}>
              🌿 {info.ayurvedicWarning}
            </div>
          )}

          {/* Supplement */}
          {isSupplement && info.supplementWarning && (
            <div style={{ padding: '10px 12px', background: 'rgba(200,136,32,0.08)', border: '1px solid var(--amber)', borderRadius: 10, fontSize: 12, color: 'var(--amberlt)', lineHeight: 1.6 }}>
              💊 {info.supplementWarning}
            </div>
          )}

          {/* Interactions */}
          {info.doNotTakeWith && (
            <div style={{ padding: '9px 12px', background: 'rgba(160,64,48,0.08)', borderRadius: 9, fontSize: 12, color: 'var(--mist)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--terralt)' }}>🚫 Do not take with: </strong>{info.doNotTakeWith}
            </div>
          )}
        </div>
      </div>
    </BigCard>
  )
}

/* ── CARD 3: ALTERNATIVES ── */
function CardAlt({ visible, results, t }) {
  const alt  = results?.alternatives || {}
  const alts = alt.topAlternatives || []
  const jaAlts = alts.filter(a => a.isJanAushadhi)
  const otherAlts = alts.filter(a => !a.isJanAushadhi)

  return (
    <BigCard visible={visible}>
      <div style={{ flex: 1, borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid rgba(26,77,46,0.35)' }}>

        <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(26,77,46,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💸</div>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--cream)' }}>{t.cardAlt}</span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', padding: '4px 9px', borderRadius: 6, textTransform: 'uppercase', background: 'rgba(26,77,46,0.2)', color: 'var(--forestgl)' }}>{t.badgeJA}</span>
        </div>

        <div style={{ padding: '14px 18px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Hero */}
          {alt.savingsSummary && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'rgba(26,77,46,0.15)', borderRadius: 12, border: '1px solid rgba(26,77,46,0.28)' }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: 'var(--forestgl)', lineHeight: 1, flexShrink: 0 }}>91%</div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', display: 'block', marginBottom: 3 }}>{t.avgSavings}</span>
                <span style={{ fontSize: 11, color: 'var(--stone)', lineHeight: 1.5 }}>{alt.savingsSummary}</span>
              </div>
            </div>
          )}

          {/* Jan Aushadhi section */}
          {jaAlts.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--forestgl)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>🏛 Jan Aushadhi (Govt)</div>
              {jaAlts.map((med, i) => <AltRow key={i} med={med} highlight />)}
            </div>
          )}

          {/* Other cheaper alternatives */}
          {otherAlts.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--stone)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Other cheaper brands</div>
              {otherAlts.map((med, i) => <AltRow key={i} med={med} />)}
            </div>
          )}

          {!alt.hasGenerics && (
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 9, fontSize: 12, color: 'var(--stone)', lineHeight: 1.5 }}>
              No Jan Aushadhi generic found. Ask your doctor if a generic is available.
            </div>
          )}

          {/* Find store */}
          <a href={JA_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(26,77,46,0.12)', border: '1px solid rgba(26,77,46,0.3)', borderRadius: 12, textDecoration: 'none' }}>
            <span style={{ fontSize: 19 }}>📍</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', display: 'block' }}>{t.findStore}</span>
              <span style={{ fontSize: 11, color: 'var(--stone)' }}>janaushadhi.gov.in · 1800-180-8080 (free)</span>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--forestgl)', fontSize: 14 }}>›</span>
          </a>

          {/* Disclaimer */}
          <div style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 9, fontSize: 11, color: 'var(--stone)', lineHeight: 1.6 }}>
            ⚠ {alt.disclaimer || t.disclaimer}
          </div>
        </div>
      </div>
    </BigCard>
  )
}

function AltRow({ med, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 10px', background: highlight ? 'rgba(26,77,46,0.08)' : 'rgba(255,255,255,0.02)', borderRadius: 10, marginBottom: 6, border: highlight ? '1px solid rgba(26,77,46,0.2)' : '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{med.name}</span>
          {med.isJanAushadhi && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(26,77,46,0.28)', color: 'var(--forestgl)', padding: '2px 6px', borderRadius: 4 }}>JAN AUSHADHI</span>}
        </div>
        <span style={{ fontSize: 10.5, color: 'var(--stone)' }}>{med.salt}{med.form ? ` · ${med.form}` : ''}{med.packSize ? ` · ${med.packSize}` : ''}</span>
        {med.brand && med.brand !== 'BPPI' && <span style={{ fontSize: 10, color: 'var(--ash)', display: 'block', marginTop: 1 }}>{med.brand}</span>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: 'var(--amberlt)', display: 'block' }}>₹{med.estimatedMrp}</span>
        {med.perUnitCost && <span style={{ fontSize: 10, color: 'var(--stone)' }}>₹{med.perUnitCost}/unit</span>}
        <span style={{ fontSize: 10.5, color: 'var(--forestgl)', display: 'block' }}>{med.savingsVsBranded}</span>
      </div>
    </div>
  )
}

function BigCard({ visible, children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, padding: '0 0 8px',
      display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(40px)',
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.45s cubic-bezier(0.34,1.2,0.64,1), transform 0.45s cubic-bezier(0.34,1.2,0.64,1)',
    }}>
      {children}
    </div>
  )
}
