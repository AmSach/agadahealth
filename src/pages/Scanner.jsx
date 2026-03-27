import React, { useState, useRef, useCallback } from 'react'
import { scanMedicine, compressAndEncode } from '../services/geminiService.js'
import { readBarcode } from '../services/barcodeService.js'
import ResultsPanel from '../components/ResultsPanel.jsx'
import HamMenu from '../components/HamMenu.jsx'
import { useLang } from '../App.jsx'
import { useT } from '../i18n/translations.js'

const VIEWS = { HOME: 'home', LOADING: 'loading', RESULTS: 'results', ERROR: 'error' }

export default function Scanner() {
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const [view, setView]           = useState(VIEWS.HOME)
  const [results, setResults]     = useState(null)
  const [error, setError]         = useState(null)
  const [preview, setPreview]     = useState(null)
  const [step, setStep]           = useState(0)
  const [barcodeHit, setBarcodeHit] = useState(false)
  const [hamOpen, setHamOpen]     = useState(false)
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 30 * 1024 * 1024) { alert('Image too large (max 30MB).'); return }
    setView(VIEWS.LOADING); setError(null); setStep(1); setBarcodeHit(false)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    try {
      const barcodePromise = readBarcode(file).catch(() => null)
      setStep(1)
      await new Promise(r => setTimeout(r, 400))
      const b64 = await compressAndEncode(file)
      setStep(2)
      const barcodeData = await barcodePromise
      if (barcodeData) setBarcodeHit(true)
      await new Promise(r => setTimeout(r, 300))
      const res = await scanMedicine(b64, 'image/jpeg', barcodeData)
      setStep(3)
      await new Promise(r => setTimeout(r, 300))
      if (res.cannotRead) throw new Error(res.cannotReadReason || 'Could not read the medicine. Try a clearer photo.')
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', maxWidth: 540, margin: '0 auto' }}>

      {/* Header */}
      <header style={{ background: 'var(--navy)', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'var(--green)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 15 }}>अ</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}>Agada</div>
            <div style={{ color: '#9CA3AF', fontSize: 10.5 }}>Know Your Medicine</div>
          </div>
        </div>
        <button onClick={() => setHamOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4.5 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 17, height: 1.5, background: hamOpen && i===1 ? 'transparent' : '#fff', borderRadius: 1, display: 'block',
            transform: hamOpen ? (i===0 ? 'translateY(6px) rotate(45deg)' : i===2 ? 'translateY(-6px) rotate(-45deg)' : 'none') : 'none', transition: 'all 0.25s' }} />)}
        </button>
      </header>

      <HamMenu open={hamOpen} onClose={() => setHamOpen(false)} lang={lang} setLang={setLang} t={t} onScan={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset() }} />

      {/* Beta banner */}
      <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FCD34D', padding: '7px 16px', textAlign: 'center' }}>
        <span style={{ fontSize: 11.5, color: '#92400E' }}>🚧 <strong>Beta</strong> — AI results may not be 100% accurate. Verify with your pharmacist.</span>
      </div>

      {view === VIEWS.HOME    && <HomeView t={t} onCamera={() => cameraRef.current?.click()} onUpload={() => uploadRef.current?.click()} />}
      {view === VIEWS.LOADING && <LoadingView t={t} step={step} preview={preview} barcodeHit={barcodeHit} />}
      {view === VIEWS.RESULTS && <ResultsPanel results={results} preview={preview} onReset={reset} t={t} lang={lang} />}
      {view === VIEWS.ERROR   && <ErrorView error={error} onReset={reset} t={t} />}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleChange} style={{ display: 'none' }} />
      <input ref={uploadRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
    </div>
  )
}

function HomeView({ t, onCamera, onUpload }) {
  return (
    <div style={{ flex: 1, padding: '24px 18px 32px', animation: 'fadeIn 0.3s ease' }}>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 28, animation: 'fadeUp 0.4s ease 0.1s both' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>India Innovates 2026</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.25, marginBottom: 10 }}>
          Know your medicine.<br />Pay what it's worth.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--textlt)', lineHeight: 1.65 }}>
          Scan any medicine strip. Find out if it's real,<br />what it does, and if you're overpaying.
        </p>
      </div>

      {/* Scan button */}
      <div style={{ animation: 'fadeUp 0.4s ease 0.25s both' }}>
        <button onClick={onCamera} style={{ width: '100%', height: 56, background: 'var(--green)', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 4px 16px rgba(15,122,90,0.35)', marginBottom: 10 }}>
          📷 &nbsp;Scan Medicine
        </button>
        <button onClick={onUpload} style={{ width: '100%', height: 44, background: 'var(--bgcard)', border: '1.5px solid var(--border)', borderRadius: 12, color: 'var(--textlt)', fontSize: 14, fontWeight: 500 }}>
          Upload a photo instead
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 24, animation: 'fadeUp 0.4s ease 0.4s both' }}>
        {[['3 sec','Results'], ['₹0','Cost to you'], ['2,400+','Jan Aushadhi products']].map(([v,l]) => (
          <div key={l} style={{ background: 'var(--bgcard)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', marginBottom: 2 }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--textlt)', lineHeight: 1.3 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ marginTop: 24, background: 'var(--bgcard)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow)', animation: 'fadeUp 0.4s ease 0.55s both' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--textlt)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
        {[
          ['📷', 'Photograph any medicine strip or box'],
          ['🔍', 'AI reads the label — name, salt, batch'],
          ['🏛', 'Cross-checks CDSCO drug registry (3,300+ drugs)'],
          ['💊', 'Finds Jan Aushadhi generics from official BPPI database'],
        ].map(([icon, text]) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
            <span style={{ fontSize: 17, width: 26, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, color: 'var(--textmd)', lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingView({ t, step, preview, barcodeHit }) {
  const steps = [
    { label: 'Reading medicine label', tag: 'Groq AI', done: step >= 1 },
    { label: barcodeHit ? '✓ Barcode / QR decoded' : 'Scanning barcode / QR code', tag: barcodeHit ? 'DECODED' : 'ZXing', done: step >= 2 },
    { label: 'Looking up CDSCO + Jan Aushadhi database', tag: 'Local DB', done: step >= 3 },
  ]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', animation: 'fadeIn 0.3s ease' }}>
      {preview && (
        <div style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '2px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--green)', animation: 'spin 0.9s linear infinite', marginBottom: 18 }} />
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Analysing...</div>
      <div style={{ fontSize: 13, color: 'var(--textlt)', marginBottom: 28 }}>Checking three sources at once</div>
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: s.done ? 'var(--greenlt)' : 'var(--bgcard)', border: `1.5px solid ${s.done ? '#A7D9CA' : 'var(--border)'}`, borderRadius: 11, transition: 'all 0.4s ease' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: s.done ? 'var(--green)' : 'var(--bgsoft)', border: `1.5px solid ${s.done ? 'var(--green)' : 'var(--bordermd)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: s.done ? '#fff' : 'var(--textlt)', fontWeight: 700, flexShrink: 0, transition: 'all 0.4s ease' }}>{s.done ? '✓' : i+1}</div>
            <span style={{ fontSize: 13, color: s.done ? 'var(--greendk)' : 'var(--textmd)', flex: 1, fontWeight: s.done ? 600 : 400 }}>{s.label}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: s.done ? 'rgba(15,122,90,0.15)' : 'var(--bgsoft)', color: s.done ? 'var(--green)' : 'var(--textlt)', letterSpacing: '0.04em', transition: 'all 0.4s ease' }}>{s.tag}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorView({ error, onReset }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ background: 'var(--redlt)', border: '1.5px solid #FECACA', borderRadius: 16, padding: '24px 20px', textAlign: 'center', width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>Scan failed</div>
        <p style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6, marginBottom: 20 }}>{error}</p>
        <button onClick={onReset} style={{ background: 'var(--red)', color: '#fff', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Try Again</button>
      </div>
    </div>
  )
}
