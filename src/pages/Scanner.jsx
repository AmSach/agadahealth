import React, { useState, useRef, useCallback } from 'react'
import { scanMedicine, compressAndEncode } from '../services/geminiService.js'
import ResultsPanel from '../components/ResultsPanel.jsx'
import HamMenu from '../components/HamMenu.jsx'
import { useLang } from '../App.jsx'
import { useT } from '../i18n/translations.js'

const VIEWS = { HOME: 'home', LOADING: 'loading', RESULTS: 'results', ERROR: 'error' }

export default function Scanner() {
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const [view, setView]       = useState(VIEWS.HOME)
  const [results, setResults] = useState(null)
  const [error, setError]     = useState(null)
  const [preview, setPreview] = useState(null)
  const [step, setStep]       = useState(0)
  const [hamOpen, setHamOpen] = useState(false)
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 25 * 1024 * 1024) { alert('Image too large. Please use a smaller photo.'); return }
    setView(VIEWS.LOADING); setError(null); setStep(1)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    try {
      setStep(1)
      await new Promise(r => setTimeout(r, 700))
      const b64 = await compressAndEncode(file)
      setStep(2)
      await new Promise(r => setTimeout(r, 600))
      const res = await scanMedicine(b64)
      setStep(3)
      await new Promise(r => setTimeout(r, 500))
      if (res.cannotRead) throw new Error(res.cannotReadReason || 'Could not read the medicine. Try a clearer photo in good lighting.')
      setResults(res); setView(VIEWS.RESULTS)
    } catch (err) {
      setError(err.message); setView(VIEWS.ERROR)
    }
  }, [preview])

  const handleChange = useCallback((e) => {
    const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''
  }, [handleFile])

  const reset = useCallback(() => {
    setView(VIEWS.HOME); setResults(null); setError(null); setStep(0)
    if (preview) { URL.revokeObjectURL(preview); setPreview(null) }
  }, [preview])

  return (
    <div style={S.root}>
      {/* Nav */}
      <div style={S.nav}>
        <div style={S.brand}>
          <span style={S.logo}>Agada</span>
          <span style={S.sanskrit}>अगद</span>
        </div>
        <button style={{ ...S.ham, ...(hamOpen ? S.hamOpen : {}) }} onClick={() => setHamOpen(o => !o)} aria-label="Menu">
          <span style={{ ...S.hbl, ...(hamOpen ? S.hbl1o : {}) }} />
          <span style={{ ...S.hbl, ...(hamOpen ? S.hbl2o : {}) }} />
          <span style={{ ...S.hbl, ...(hamOpen ? S.hbl3o : {}) }} />
        </button>
      </div>

      {/* Hamburger dropdown */}
      <HamMenu open={hamOpen} onClose={() => setHamOpen(false)} lang={lang} setLang={setLang} t={t} onScan={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset() }} />

      {/* Views */}
      {view === VIEWS.HOME    && <HomeView t={t} onCamera={() => cameraRef.current?.click()} onUpload={() => uploadRef.current?.click()} />}
      {view === VIEWS.LOADING && <LoadingView t={t} step={step} preview={preview} />}
      {view === VIEWS.RESULTS && <ResultsPanel results={results} preview={preview} onReset={reset} t={t} lang={lang} />}
      {view === VIEWS.ERROR   && <ErrorView error={error} onReset={reset} t={t} />}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleChange} style={{ display: 'none' }} />
      <input ref={uploadRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
    </div>
  )
}

/* ── HOME ── */
function HomeView({ t, onCamera, onUpload }) {
  return (
    <div style={S.view}>
      {/* Glow bg */}
      <div style={{ ...S.glow, background: 'radial-gradient(circle, rgba(26,77,46,0.28) 0%, transparent 65%)', width: 320, height: 320, top: 60, left: -80, position: 'absolute', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ ...S.glow, background: 'radial-gradient(circle, rgba(200,136,32,0.14) 0%, transparent 65%)', width: 260, height: 260, bottom: 80, right: -60, position: 'absolute', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={S.hero}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 44, color: 'var(--forestlt)', textAlign: 'center', marginBottom: 4, animation: 'fadeUp 0.6s ease 0.2s both' }}>अगद</div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 64, color: 'var(--cream)', letterSpacing: '0.1em', textAlign: 'center', marginBottom: 8, animation: 'fadeUp 0.6s ease 0.4s both' }}>AGADA</div>
        <div style={{ width: 160, height: 2, background: 'linear-gradient(90deg, transparent, var(--amber), transparent)', margin: '0 auto 14px', animation: 'fadeIn 0.6s ease 0.6s both' }} />
        <div style={{ fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--mist)', textAlign: 'center', lineHeight: 1.7, marginBottom: 40, animation: 'fadeUp 0.6s ease 0.8s both', whiteSpace: 'pre-line' }}>
          {t.appTagline}
        </div>

        <button onClick={onCamera} style={{ ...S.scanBtn, animation: 'fadeUp 0.6s ease 1.0s both' }}>
          <span style={S.scanBtnGlow} />
          {t.scanBtn}
        </button>
        <button onClick={onUpload} style={{ background: 'none', color: 'var(--stone)', fontSize: 12.5, marginTop: 12, animation: 'fadeIn 0.5s ease 1.2s both' }}>
          {t.uploadHint} <span style={{ color: 'var(--amberlt)' }}>›</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '0 22px 24px', animation: 'fadeUp 0.5s ease 1.4s both' }}>
        {[[t.stat1val, t.stat1lbl], [t.stat2val, t.stat2lbl], [t.stat3val, t.stat3lbl]].map(([v, l]) => (
          <div key={l} style={S.stat}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--amberlt)', display: 'block', marginBottom: 2 }}>{v}</span>
            <span style={{ fontSize: 9, color: 'var(--stone)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── LOADING ── */
function LoadingView({ t, step, preview }) {
  const steps = [
    { label: t.step1, tag: t.tagGroq,  tagColor: 'amber' },
    { label: t.step2, tag: t.tagCDSCO, tagColor: 'green' },
    { label: t.step3, tag: t.tagJA,    tagColor: 'green' },
  ]
  return (
    <div style={{ ...S.view, alignItems: 'center', justifyContent: 'center' }}>
      {preview && (
        <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--rim)', flexShrink: 0 }}>
          <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ position: 'relative', width: 84, height: 84, marginBottom: 20 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--rim)', borderTopColor: 'var(--forestlt)', borderRightColor: 'var(--amber)', animation: 'spin 1s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: '2px solid var(--panelmd)', borderBottomColor: 'var(--forestmd)', animation: 'spinR 1.4s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Serif Display', serif", fontSize: 11, color: 'var(--forestlt)' }}>⬤</div>
      </div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 21, color: 'var(--cream)', marginBottom: 6 }}>{t.analysing}</div>
      <div style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 28 }}>{t.checkingThree}</div>
      <div style={{ width: '100%', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => {
          const done = step > i
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: done ? 'rgba(26,77,46,0.09)' : 'var(--panel)', border: `1px solid ${done ? 'var(--forestmd)' : 'var(--rim)'}`, borderRadius: 10, opacity: done ? 1 : 0.3, transition: 'all 0.4s ease' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: done ? 'var(--forest)' : 'var(--panellt)', border: `1.5px solid ${done ? 'var(--forestlt)' : 'var(--rim)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: done ? 'var(--cream)' : 'var(--stone)', fontWeight: 600, flexShrink: 0, transition: 'all 0.4s ease' }}>{i + 1}</div>
              <span style={{ fontSize: 12.5, color: done ? 'var(--cream)' : 'var(--mist)', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', background: s.tagColor === 'green' ? 'rgba(26,77,46,0.25)' : 'rgba(200,136,32,0.2)', color: s.tagColor === 'green' ? 'var(--forestgl)' : 'var(--amberlt)', opacity: done ? 1 : 0, transition: 'opacity 0.4s ease 0.2s' }}>{s.tag}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── ERROR ── */
function ErrorView({ error, onReset, t }) {
  return (
    <div style={{ ...S.view, alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ background: 'rgba(160,64,48,0.12)', border: '1px solid var(--terra)', borderRadius: 20, padding: 28, textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>⚠</div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: 'var(--terralt)', marginBottom: 10 }}>Scan failed</div>
        <p style={{ fontSize: 13, color: 'var(--mist)', lineHeight: 1.6, marginBottom: 24 }}>{error}</p>
        <button onClick={onReset} style={{ background: 'var(--terra)', color: 'var(--cream)', padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>Try Again</button>
      </div>
    </div>
  )
}

/* ── STYLES ── */
const S = {
  root: { minHeight: '100vh', background: 'var(--void)', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative', overflow: 'hidden' },
  nav:  { background: 'var(--panel)', borderBottom: '1px solid var(--rim)', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', flexShrink: 0, position: 'relative', zIndex: 50 },
  brand:{ display: 'flex', alignItems: 'baseline', gap: 8 },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: 21, color: 'var(--cream)', letterSpacing: '0.06em' },
  sanskrit: { fontSize: 12, color: 'var(--forestlt)' },
  ham:  { width: 38, height: 38, borderRadius: 10, background: 'var(--panellt)', border: '1px solid var(--rim)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.2s' },
  hbl:  { width: 18, height: 2, background: 'var(--mist)', borderRadius: 1, transition: 'all 0.3s ease', transformOrigin: 'center', display: 'block' },
  hbl1o:{ transform: 'translateY(7px) rotate(45deg)' },
  hbl2o:{ opacity: 0, transform: 'scaleX(0)' },
  hbl3o:{ transform: 'translateY(-7px) rotate(-45deg)' },
  view: { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' },
  hero: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 30px', position: 'relative', zIndex: 2 },
  glow: {},
  scanBtn: { width: '100%', maxWidth: 290, height: 58, background: 'var(--forest)', border: '1px solid var(--forestmd)', borderRadius: 16, color: 'var(--cream)', fontSize: 16, fontWeight: 600, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, position: 'relative', overflow: 'hidden' },
  scanBtnGlow: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(79,160,104,0.22) 0%, transparent 60%)', animation: 'btnGlow 2.5s ease-in-out infinite' },
  stat: { flex: 1, background: 'var(--panel)', border: '1px solid var(--rim)', borderRadius: 12, padding: '11px 6px', textAlign: 'center' },
}
