import React, { useState, useRef, useCallback } from 'react'
import { scanMedicine, compressAndEncode } from '../services/geminiService.js'
import ResultsPanel from '../components/ResultsPanel.jsx'

const C = {
  green: '#0F7A5A', greenDark: '#0A5740', greenLight: '#E8F5F0',
  navy: '#1A2B4A', cream: '#F8F5F0', saffron: '#E87722',
  white: '#FFFFFF', gray100: '#F3F4F6', gray300: '#D1D5DB',
  gray500: '#6B7280', gray700: '#374151', red: '#DC2626', redLight: '#FEF2F2',
}

const S = { IDLE: 'idle', PROCESSING: 'processing', RESULTS: 'results', ERROR: 'error' }

export default function Scanner() {
  const [state, setState] = useState(S.IDLE)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [step, setStep] = useState('')
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 20 * 1024 * 1024) { alert('Image too large. Please use a smaller photo.'); return }

    setState(S.PROCESSING)
    setError(null)
    setPreview(URL.createObjectURL(file))

    try {
      setStep('Reading your medicine strip...')
      const base64 = await compressAndEncode(file)
      setStep('Analysing — takes a few seconds...')
      const result = await scanMedicine(base64)
      if (result.cannotRead) throw new Error(result.cannotReadReason || 'Could not read the medicine. Please try a clearer photo in better lighting.')
      setResults(result)
      setState(S.RESULTS)
    } catch (err) {
      setError(err.message)
      setState(S.ERROR)
    }
  }, [])

  const handleInputChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  const reset = useCallback(() => {
    setState(S.IDLE); setResults(null); setError(null); setStep('')
    if (preview) { URL.revokeObjectURL(preview); setPreview(null) }
  }, [preview])

  return (
    <div style={{ minHeight: '100vh', background: C.cream, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: C.navy, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, background: C.green, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>अ</div>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, lineHeight: 1 }}>Agada</div>
          <div style={{ color: '#9CA3AF', fontSize: 11 }}>Know Your Medicine</div>
        </div>
      </header>

      {/* Beta banner */}
      <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FCD34D', padding: '7px 16px', textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: '#92400E' }}>
          🚧 <strong>Beta</strong> — AI-estimated results. Always verify with a pharmacist.
        </span>
      </div>

      <main style={{ flex: 1, maxWidth: 520, width: '100%', margin: '0 auto', padding: '16px 16px 32px' }}>

        {/* IDLE */}
        {state === S.IDLE && (
          <div className="fade-in">
            <div style={{ background: C.navy, borderRadius: 20, padding: '24px 20px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: 8 }}>
                One scan.<br />
                <span style={{ color: C.saffron }}>Three seconds.</span><br />
                Three answers.
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>
                Real or fake? What does it do? Are you overpaying?
              </p>
            </div>

            <button onClick={() => cameraRef.current?.click()} style={{
              width: '100%', background: C.green, color: '#fff', padding: '17px',
              borderRadius: 16, fontSize: 17, fontWeight: 700, marginBottom: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 14px rgba(15,122,90,0.35)',
            }}>
              <CameraIcon /> Scan Medicine
            </button>

            <button onClick={() => uploadRef.current?.click()} style={{
              width: '100%', background: C.white, color: C.navy, padding: '13px',
              borderRadius: 16, fontSize: 15, fontWeight: 600, marginBottom: 20,
              border: `2px dashed ${C.gray300}`,
            }}>
              🖼️ Upload from Gallery
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {[['🏛️','CDSCO cross-check'],['🔒','No login needed'],['📱','No app download'],['₹','Always free']].map(([icon, text]) => (
                <div key={text} style={{ background: C.white, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <span style={{ fontSize: 17 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: C.gray700, fontWeight: 500 }}>{text}</span>
                </div>
              ))}
            </div>

            <div style={{ background: C.white, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.gray100}` }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: C.gray700 }}>📸 For best results:</p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.gray500, lineHeight: 1.9 }}>
                <li>Hold steady — brand name must be sharp</li>
                <li>Photograph the front face of the strip or box</li>
                <li>Good lighting makes a big difference</li>
              </ul>
            </div>

            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleInputChange} style={{ display: 'none' }} />
            <input ref={uploadRef} type="file" accept="image/*" onChange={handleInputChange} style={{ display: 'none' }} />
          </div>
        )}

        {/* PROCESSING */}
        {state === S.PROCESSING && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
            {preview && (
              <div style={{ width: '100%', maxWidth: 300, borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                <img src={preview} alt="Medicine" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
                <div style={{ background: C.navy, color: '#fff', padding: '7px 0', textAlign: 'center', fontSize: 13 }}>Analysing...</div>
              </div>
            )}
            <Spinner />
            <p style={{ color: C.navy, fontWeight: 600, fontSize: 14, marginTop: 16, textAlign: 'center' }}>{step}</p>
            <p style={{ color: C.gray500, fontSize: 12, marginTop: 4 }}>Usually takes 3–6 seconds</p>
          </div>
        )}

        {/* RESULTS */}
        {state === S.RESULTS && results && (
          <ResultsPanel results={results} preview={preview} onReset={reset} />
        )}

        {/* ERROR */}
        {state === S.ERROR && (
          <div className="fade-in" style={{ background: C.redLight, border: `2px solid ${C.red}`, borderRadius: 20, padding: 24, textAlign: 'center', marginTop: 20 }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ color: C.red, fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>Scan failed</h2>
            <p style={{ color: '#7F1D1D', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>{error}</p>
            <button onClick={reset} style={{ background: C.red, color: '#fff', padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
              Try Again
            </button>
          </div>
        )}
      </main>

      <footer style={{ background: C.navy, padding: '14px', textAlign: 'center' }}>
        <p style={{ color: '#6B7280', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
          Agada is an information tool only — not medical advice.<br />
          Powered by OpenRouter · CDSCO · Jan Aushadhi · NPPA<br />
          <span style={{ color: '#4B5563' }}>Team Agada · Open Innovation 2026</span>
        </p>
      </footer>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{ position: 'relative', width: 64, height: 64 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `4px solid ${C.greenLight}` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid transparent', borderTopColor: C.green, animation: 'spin 0.9s linear infinite' }} />
      <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: C.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>💊</div>
    </div>
  )
}
