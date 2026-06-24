import React, { useState, useRef, useCallback } from 'react'
import { scanMedicine, scanPrescription, compressAndEncode } from '../services/geminiService.js'
import { readBarcode } from '../services/barcodeService.js'
import ResultsPanel from '../components/ResultsPanel.jsx'
import PrescriptionResultsPanel from '../components/PrescriptionResultsPanel.jsx'
import HamMenu from '../components/HamMenu.jsx'
import { useLang, useSetPage } from '../App.jsx'
import { useT } from '../i18n/translations.js'

// Import Wasm, Crypto and ARScanner components
import { processImageWasm } from '../services/wasmService.js'
import { encryptData, decryptData } from '../services/cryptoService.js'
import ARScanner from '../components/ARScanner.jsx'

const VIEWS = { HOME: 'home', LOADING: 'loading', RESULTS: 'results', ERROR: 'error', AR: 'ar' }

export default function Scanner() {
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const setPage = useSetPage()
  const [view, setView]           = useState(VIEWS.HOME)
  const [results, setResults]     = useState(null)
  const [error, setError]         = useState(null)
  const [preview, setPreview]     = useState(null)
  const [step, setStep]           = useState(0)
  const [barcodeHit, setBarcodeHit] = useState(false)
  const [hamOpen, setHamOpen]     = useState(false)
  const [scanMode, setScanMode]   = useState('medicine')
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  // WASM Pre-processing settings
  const [wasmEnabled, setWasmEnabled] = useState(true)
  const [wasmFilter, setWasmFilter] = useState(1) // 1 = Adaptive, 2 = Sobel, 3 = Contrast Stretch
  const [processedPreview, setProcessedPreview] = useState(null)

  // SSE Stream states
  const [useAsyncQueue, setUseAsyncQueue] = useState(true)
  const [activeStepId, setActiveStepId] = useState(null)
  const [completedStepIds, setCompletedStepIds] = useState([])

  // ZK local encryption states
  const [bookmarks, setBookmarks] = useState([])
  const [isVaultLocked, setIsVaultLocked] = useState(false)
  const [vaultPin, setVaultPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [newPin, setNewPin] = useState('')

  // Load bookmarks on view load
  React.useEffect(() => {
    if (view === VIEWS.HOME) {
      try {
        const savedStr = localStorage.getItem('agada_bookmarks') || '[]'
        if (savedStr.includes(':') && savedStr.split(':').length === 3) {
          setIsVaultLocked(true)
          setBookmarks([])
        } else {
          const saved = JSON.parse(savedStr)
          saved.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          setBookmarks(saved)
          setIsVaultLocked(false)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }, [view])

  const handleSelectBookmark = (bookmark) => {
    setResults(bookmark.results)
    setView(VIEWS.RESULTS)
  }

  const handleDeleteBookmark = async (e, bookmark) => {
    e.stopPropagation()
    try {
      const updated = bookmarks.filter(b => !(b.brandName === bookmark.brandName && b.saltComposition === bookmark.saltComposition))
      setBookmarks(updated)
      
      if (vaultPin) {
        const cipher = await encryptData(JSON.stringify(updated), vaultPin)
        localStorage.setItem('agada_bookmarks', cipher)
      } else {
        localStorage.setItem('agada_bookmarks', JSON.stringify(updated))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const toggleBookmark = async (res) => {
    try {
      const alreadyBookmarked = bookmarks.some(b => b.brandName === res.brandName && b.saltComposition === res.saltComposition)
      let updated
      if (alreadyBookmarked) {
        updated = bookmarks.filter(b => !(b.brandName === res.brandName && b.saltComposition === res.saltComposition))
      } else {
        updated = [...bookmarks, {
          brandName: res.brandName,
          saltComposition: res.saltComposition,
          timestamp: Date.now(),
          results: res
        }]
      }
      setBookmarks(updated)
      
      if (vaultPin) {
        const cipher = await encryptData(JSON.stringify(updated), vaultPin)
        localStorage.setItem('agada_bookmarks', cipher)
      } else {
        localStorage.setItem('agada_bookmarks', JSON.stringify(updated))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleUnlockVault = async (pin) => {
    try {
      const savedStr = localStorage.getItem('agada_bookmarks') || '[]'
      const decrypted = await decryptData(savedStr, pin)
      const parsed = JSON.parse(decrypted)
      parsed.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      setBookmarks(parsed)
      setVaultPin(pin)
      setIsVaultLocked(false)
      setPinError('')
      setPinInput('')
    } catch (err) {
      setPinError(t.incorrectPin || 'Incorrect PIN or corrupted vault.')
    }
  }

  const handleSetupPin = async (pin) => {
    if (!/^\d{4}$/.test(pin)) {
      setPinError('PIN must be exactly 4 digits.')
      return
    }
    try {
      const cipher = await encryptData(JSON.stringify(bookmarks), pin)
      localStorage.setItem('agada_bookmarks', cipher)
      setVaultPin(pin)
      setShowPinSetup(false)
      setNewPin('')
      setPinError('')
    } catch (err) {
      setPinError('Failed to encrypt bookmarks.')
    }
  }

  const handleDisableEncryption = () => {
    try {
      localStorage.setItem('agada_bookmarks', JSON.stringify(bookmarks))
      setVaultPin('')
      setPinError('')
    } catch (err) {
      setPinError('Failed to disable encryption.')
    }
  }

  // Unified Scanner backend analysis coordinator
  const startAnalysis = useCallback(async (finalBase64, barcodeData) => {
    try {
      if (!useAsyncQueue) {
        // Fallback to synchronous OCR handler
        let res
        if (scanMode === 'prescription') {
          await new Promise(r => setTimeout(r, 600))
          res = await scanPrescription(finalBase64, 'image/jpeg')
          setStep(3)
          await new Promise(r => setTimeout(r, 300))
          if (res.data?.cannotRead) throw new Error(res.data.cannotReadReason || 'Could not read the prescription.')
        } else {
          await new Promise(r => setTimeout(r, 300))
          res = await scanMedicine(finalBase64, 'image/jpeg', barcodeData)
          setStep(3)
          await new Promise(r => setTimeout(r, 300))
          if (res.cannotRead) throw new Error(res.cannotReadReason || 'Could not read the medicine. Try a clearer photo.')
        }
        setResults(res)
        setView(VIEWS.RESULTS)
      } else {
        // Serverless Live POST stream queue handler
        const response = await fetch('/api/scan-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: finalBase64,
            scanMode,
            barcodeData
          })
        })

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let scanResult = null

        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim()
              if (dataStr === ': keep-alive') continue
              try {
                const event = JSON.parse(dataStr)

                // Map events to visual stepper state
                if (event.step === 'started') {
                  setActiveStepId('started')
                } else if (event.step === 'vision_start') {
                  setCompletedStepIds(prev => [...prev, 'started'])
                  setActiveStepId('vision')
                } else if (event.step === 'db_start') {
                  setCompletedStepIds(prev => [...prev, 'vision'])
                  setActiveStepId('db')
                } else if (event.step === 'scraping_start') {
                  setCompletedStepIds(prev => [...prev, 'db'])
                  setActiveStepId('scraping')
                } else if (event.step === 'summary_start') {
                  setCompletedStepIds(prev => [...prev, 'scraping'])
                  setActiveStepId('summary')
                } else if (event.step === 'completed') {
                  setCompletedStepIds(prev => [...prev, 'summary'])
                  setActiveStepId(null)
                  scanResult = event.data
                } else if (event.step === 'failed') {
                  throw new Error(event.message || 'Background analysis failed.')
                }
              } catch (parseErr) {
                console.error("Failed to parse event packet:", parseErr)
              }
            }
          }
        }

        if (scanResult) {
          if (scanMode === 'prescription') {
            scanResult.isPrescription = true
          }
          setResults(scanResult)
          setView(VIEWS.RESULTS)
        } else {
          throw new Error('Connection closed prematurely by host.')
        }
      }
    } catch (err) {
      setError(err.message)
      setView(VIEWS.ERROR)
    }
  }, [scanMode, useAsyncQueue])

  // Handle image capture from live WebRTC stream
  const handleCapturedFrame = useCallback(async (base64) => {
    setView(VIEWS.LOADING)
    setError(null)
    setStep(1)
    setBarcodeHit(false)
    setProcessedPreview(null)
    setCompletedStepIds([])
    setActiveStepId(null)
    setPreview(`data:image/jpeg;base64,${base64}`)
    
    await startAnalysis(base64, null)
  }, [startAnalysis])

  // Handle standard file selection
  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 30 * 1024 * 1024) { alert('Image too large (max 30MB).'); return }
    
    setView(VIEWS.LOADING)
    setError(null)
    setStep(1)
    setBarcodeHit(false)
    setProcessedPreview(null)
    setCompletedStepIds([])
    setActiveStepId(null)

    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))

    try {
      const barcodePromise = scanMode === 'medicine' ? readBarcode(file).catch(() => null) : Promise.resolve(null)
      
      let finalBase64 = null
      if (wasmEnabled) {
        setActiveStepId('started')
        try {
          const result = await processImageWasm(file, wasmFilter)
          finalBase64 = result.base64
          setProcessedPreview(`data:image/jpeg;base64,${finalBase64}`)
        } catch (wasmErr) {
          console.error("WASM filter failed, falling back to client-side compression:", wasmErr)
        }
      }

      if (!finalBase64) {
        finalBase64 = await compressAndEncode(file)
      }

      const barcodeData = await barcodePromise
      if (barcodeData) setBarcodeHit(true)
      
      await startAnalysis(finalBase64, barcodeData)
    } catch (err) {
      setError(err.message)
      setView(VIEWS.ERROR)
    }
  }, [preview, scanMode, wasmEnabled, wasmFilter, startAnalysis])

  const handleChange = useCallback((e) => {
    const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''
  }, [handleFile])

  const reset = useCallback(() => {
    setView(VIEWS.HOME); setResults(null); setError(null); setStep(0)
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', position: 'relative' }}>
      
      {/* Navbar header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--navy)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'var(--green)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 15 }}>A.</div>
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
        <span style={{ fontSize: 11.5, color: '#92400E' }}>dYs  <strong>Beta</strong> ?" {t.betaBanner || 'AI results may not be 100% accurate. Verify with your pharmacist.'}</span>
      </div>

      {view === VIEWS.HOME    && (
        <HomeView
          t={t}
          setPage={setPage}
          bookmarks={bookmarks}
          handleSelectBookmark={handleSelectBookmark}
          handleDeleteBookmark={handleDeleteBookmark}
          onCamera={(mode) => { 
            setScanMode(mode);
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
              setView(VIEWS.AR);
            } else {
              cameraRef.current?.click();
            }
          }}
          onUpload={(mode) => { setScanMode(mode); uploadRef.current?.click() }}
          
          wasmEnabled={wasmEnabled}
          setWasmEnabled={setWasmEnabled}
          wasmFilter={wasmFilter}
          setWasmFilter={setWasmFilter}
          useAsyncQueue={useAsyncQueue}
          setUseAsyncQueue={setUseAsyncQueue}
          
          vaultPin={vaultPin}
          isVaultLocked={isVaultLocked}
          setIsVaultLocked={setIsVaultLocked}
          pinInput={pinInput}
          setPinInput={setPinInput}
          pinError={pinError}
          setPinError={setPinError}
          handleUnlockVault={handleUnlockVault}
          showPinSetup={showPinSetup}
          setShowPinSetup={setShowPinSetup}
          newPin={newPin}
          setNewPin={setNewPin}
          handleSetupPin={handleSetupPin}
          handleDisableEncryption={handleDisableEncryption}
        />
      )}
      {view === VIEWS.AR      && <ARScanner onCapture={handleCapturedFrame} onCancel={reset} t={t} />}
      {view === VIEWS.LOADING && (
        <LoadingView 
          t={t} 
          step={step} 
          preview={preview} 
          processedPreview={processedPreview}
          barcodeHit={barcodeHit} 
          activeStepId={activeStepId}
          completedStepIds={completedStepIds}
        />
      )}
      {view === VIEWS.RESULTS && (
        results?.isPrescription ? (
          <PrescriptionResultsPanel results={results} preview={preview} onReset={reset} t={t} lang={lang} />
        ) : (
          <ResultsPanel 
            results={results} 
            preview={preview} 
            onReset={reset} 
            t={t} 
            lang={lang} 
            isBookmarked={bookmarks.some(b => b.brandName === results.brandName && b.saltComposition === results.saltComposition)}
            onToggleBookmark={() => toggleBookmark(results)}
          />
        )
      )}
      {view === VIEWS.ERROR   && <ErrorView error={error} onReset={reset} t={t} />}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleChange} style={{ display: 'none' }} />
      <input ref={uploadRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
    </div>
  )
}

function HomeView({ 
  t, setPage, bookmarks, handleSelectBookmark, handleDeleteBookmark, onCamera, onUpload,
  wasmEnabled, setWasmEnabled, wasmFilter, setWasmFilter, useAsyncQueue, setUseAsyncQueue,
  vaultPin, isVaultLocked, setIsVaultLocked, pinInput, setPinInput, pinError, setPinError,
  handleUnlockVault, showPinSetup, setShowPinSetup, newPin, setNewPin, handleSetupPin,
  handleDisableEncryption
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, var(--bg) 0%, #FFFFFF 100%)', padding: '0 18px 32px', animation: 'fadeIn 0.4s ease' }}>

      {/* Modern Hero Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0 32px', animation: 'fadeUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--greenlt)', color: 'var(--greendk)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 20, boxShadow: '0 2px 8px rgba(15,122,90,0.1)' }}>
          <span style={{ fontSize: 14 }}>o"</span> {t.knowYourMedicine || 'Know Your Medicine'}
        </div>

        <h1 style={{ fontSize: 36, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.15, marginBottom: 14, letterSpacing: '-0.02em' }}>
          {t.heroLine1 || 'Verify.'}<br />
          <span style={{ background: 'linear-gradient(90deg, var(--green), #0D9488)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.heroLine2 || 'Never overpay.'}</span>
        </h1>

        <p style={{ fontSize: 15, color: 'var(--textmd)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 36px' }}>
          {t.heroDesc || 'Agada reads any medicine strip to find authenticity, side effects, and cheaper Jan Aushadhi alternatives instantly.'}
        </p>

        {/* Floating Scanner Graphic */}
        <div style={{ position: 'relative', width: 140, height: 140, marginBottom: 36, animation: 'fadeUp 0.8s ease 0.1s both' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--greenlt)', borderRadius: 28, transform: 'rotate(-6deg)', opacity: 0.6 }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', transform: 'rotate(4deg)' }}>
            <span style={{ fontSize: 56 }}>dY'S</span>
          </div>
          <div style={{ position: 'absolute', top: '15%', left: '-15%', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 8px', fontSize: 12, fontWeight: 700, color: 'var(--green)', boxShadow: 'var(--shadow)', transform: 'rotate(-10deg)', animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.5s both' }}>o" Verified</div>
          <div style={{ position: 'absolute', bottom: '15%', right: '-15%', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 8px', fontSize: 12, fontWeight: 700, color: 'var(--textlt)', boxShadow: 'var(--shadow)', transform: 'rotate(8deg)', animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.65s both' }}>,140 Save</div>
        </div>

        {/* Primary Call to Action */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.4s ease 0.3s both' }}>
          <button onClick={() => onCamera('medicine')} style={{ width: '100%', height: 60, background: 'linear-gradient(135deg, var(--green), #0D9488)', borderRadius: 16, color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 16px rgba(15,122,90,0.25)', border: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
            <span style={{ fontSize: 22 }}>dY"</span> {t.scanMedicineBtn || 'Scan Medicine Strip'}
          </button>
          
          <button onClick={() => onCamera('prescription')} style={{ width: '100%', height: 60, background: 'linear-gradient(135deg, var(--navy), var(--navylt))', borderRadius: 16, color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 16px rgba(26,43,74,0.25)', border: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
            <span style={{ fontSize: 22 }}>dY"?</span> {t.scanPrescriptionBtn || 'Scan Prescription'}
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onUpload('medicine')} style={{ flex: 1, height: 44, background: 'rgba(255,255,255,0.7)', border: '1.5px solid var(--border)', borderRadius: 12, color: 'var(--textmd)', fontSize: 13, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
              {t.uploadStrip || 'Upload Strip'}
            </button>
            <button onClick={() => onUpload('prescription')} style={{ flex: 1, height: 44, background: 'rgba(255,255,255,0.7)', border: '1.5px solid var(--border)', borderRadius: 12, color: 'var(--textmd)', fontSize: 13, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
              {t.uploadRx || 'Upload Rx'}
            </button>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, animation: 'fadeUp 0.5s ease 0.4s both' }}>
        {[
          ['🛡️', 'CDSCO DB', '3,300+ tracked'],
          ['💊', 'Jan Aushadhi', 'Live mapping'],
          ['🤖', 'AI Assistant', 'Instant insights'],
          ['🔒', 'Secure', 'Private scans']
        ].map(([icon, title, sub]) => (
          <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1.5px solid var(--bgsoft)', borderRadius: 12, padding: '10px 12px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bgsoft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 10.5, color: 'var(--textlt)' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Settings Panel */}
      <div style={{ 
        background: '#fff', 
        border: '1.5px solid var(--border)', 
        borderRadius: 16, 
        padding: '16px', 
        marginTop: '20px', 
        animation: 'fadeUp 0.5s ease 0.3s both',
        boxShadow: 'var(--shadow)'
      }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚙️ Settings & Device Security
        </h3>
        
        {/* WASM Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 13, color: 'var(--textmd)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={wasmEnabled} onChange={e => setWasmEnabled(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--green)' }} />
              Client WASM Pre-processing
            </label>
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--greenlt)', color: 'var(--green)' }}>WASM</span>
          </div>
          {wasmEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 22 }}>
              <span style={{ fontSize: 11, color: 'var(--textlt)' }}>Filter Mode:</span>
              <select value={wasmFilter} onChange={e => setWasmFilter(parseInt(e.target.value))} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--navy)', background: '#fff', fontWeight: 600 }}>
                <option value={1}>Adaptive Binarization</option>
                <option value={2}>Sobel Edge Detection</option>
                <option value={3}>Contrast Stretching</option>
              </select>
            </div>
          )}
        </div>
        
        {/* Async Stream Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <label style={{ fontSize: 13, color: 'var(--textmd)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={useAsyncQueue} onChange={e => setUseAsyncQueue(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--green)' }} />
            Async Background Worker Stream
          </label>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--safflt)', color: 'var(--saffron)' }}>SSE</span>
        </div>

        {/* ZK Vault Toggle / Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--textmd)', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 Zero-Knowledge Storage
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: vaultPin ? 'var(--greenlt)' : 'var(--bgsoft)', color: vaultPin ? 'var(--green)' : 'var(--textlt)' }}>
              {vaultPin ? 'ENCRYPTED' : 'UNENCRYPTED'}
            </span>
          </div>

          <div style={{ paddingLeft: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!vaultPin ? (
              <button onClick={() => setShowPinSetup(true)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'var(--greenlt)', color: 'var(--green)', fontWeight: 600 }}>
                Set Vault PIN
              </button>
            ) : (
              <>
                <button onClick={() => { setIsVaultLocked(true); setBookmarks([]) }} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'var(--bgsoft)', color: 'var(--navy)', fontWeight: 600 }}>
                  Lock Vault
                </button>
                <button onClick={handleDisableEncryption} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'var(--redlt)', color: 'var(--red)', fontWeight: 600 }}>
                  Disable Encryption
                </button>
              </>
            )}
          </div>

          {showPinSetup && (
            <div style={{ padding: '8px 8px 8px 22px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bgsoft)', display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeIn 0.25s' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--navy)' }}>Set a 4-Digit Security PIN:</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="password" maxLength={4} pattern="\d*" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,''))} placeholder="1234" style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bordermd)', fontSize: 12, textAlign: 'center', letterSpacing: '0.2em' }} />
                <button onClick={() => handleSetupPin(newPin)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--green)', color: '#fff', fontWeight: 600 }}>Save</button>
                <button onClick={() => { setShowPinSetup(false); setNewPin(''); setPinError('') }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', border: '1px solid var(--border)', color: 'var(--textlt)' }}>Cancel</button>
              </div>
              {pinError && <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>{pinError}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Saved Scans Registry */}
      {isVaultLocked ? (
        <div style={{ 
          marginTop: 24, 
          background: '#fff', 
          border: '1.5px solid var(--border)', 
          borderRadius: 16, 
          padding: '16px', 
          textAlign: 'center',
          boxShadow: 'var(--shadow)',
          animation: 'fadeUp 0.5s ease 0.35s both'
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>Saved Medicines Vault</h3>
          <p style={{ fontSize: 11.5, color: 'var(--textlt)', marginBottom: 12 }}>Your local scan history is encrypted. Enter your 4-digit PIN to unlock it.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <input type="password" maxLength={4} pattern="\d*" value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,''))} placeholder="••••" style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--bordermd)', fontSize: 13, textAlign: 'center', letterSpacing: '0.2em' }} />
            <button onClick={() => handleUnlockVault(pinInput)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'var(--green)', color: '#fff', fontWeight: 600 }}>Unlock</button>
          </div>
          {pinError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8, fontWeight: 600 }}>{pinError}</div>}
        </div>
      ) : (
        bookmarks && bookmarks.length > 0 && (
          <div style={{ marginTop: 24, marginBottom: 12, animation: 'fadeUp 0.5s ease 0.35s both' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 Saved Medicines ({bookmarks.length}) {vaultPin && <span style={{ fontSize: 10.5, color: 'var(--textlt)', fontWeight: 400 }}>(Encrypted)</span>}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
              {bookmarks.map((b, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectBookmark(b)}
                  style={{
                    background: '#fff',
                    border: '1.5px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.01)',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--green)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--greenlt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                    dY'S
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.brandName}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--textlt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.saltComposition}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteBookmark(e, b)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'transparent',
                      color: 'var(--textlt)',
                      fontSize: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--red)'}
                    onMouseOut={(e) => e.currentTarget.style.color = 'var(--textlt)'}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Footer links */}
      <div style={{ textAlign: 'center', padding: '16px 0 4px', display: 'flex', justifyContent: 'center', gap: 20 }}>
        <button onClick={() => setPage('privacy')} style={{ fontSize: 11.5, color: 'var(--textlt)', fontWeight: 500 }}>
          {t.privacyTitle || 'Privacy Policy'}
        </button>
        <button onClick={() => setPage('terms')} style={{ fontSize: 11.5, color: 'var(--textlt)', fontWeight: 500 }}>
          {t.termsTitle || 'Terms of Service'}
        </button>
      </div>
    </div>
  )
}

function LoadingView({ t, step, preview, processedPreview, barcodeHit, activeStepId, completedStepIds }) {
  const steps = [
    { id: 'started', label: 'Initializing Scan Engine', tag: 'System' },
    { id: 'vision', label: 'Reading Label (Llama Vision OCR)', tag: 'Vision' },
    { id: 'db', label: 'CDSCO Approval & Jan Aushadhi DB matches', tag: 'Registry' },
    { id: 'scraping', label: 'Live e-Pharmacy price comparison', tag: 'Scraper' },
    { id: 'summary', label: 'Compiling Patient Warning profiles', tag: 'AI Summary' }
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Visual Image Previews */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)', textTransform: 'uppercase', marginBottom: 4 }}>Original</span>
            <div style={{ width: 68, height: 68, borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow)' }}>
              <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        )}
        
        {processedPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 4 }}>WASM Filtered</span>
            <div style={{ width: 68, height: 68, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--green)', boxShadow: '0 4px 10px rgba(15,122,90,0.15)' }}>
              <img src={processedPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--green)', animation: 'spin 0.9s linear infinite', marginBottom: 18 }} />
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>{t.analysing || 'Analyzing...'}</div>
      <div style={{ fontSize: 13, color: 'var(--textlt)', marginBottom: 28 }}>{t.checkingThree || 'Checking three sources at once'}</div>
      
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {steps.map((s, i) => {
          const isDone = completedStepIds.includes(s.id);
          const isActive = activeStepId === s.id;
          
          return (
            <div key={s.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              padding: '11px 14px', 
              background: isDone ? 'var(--greenlt)' : (isActive ? 'var(--safflt)' : 'var(--bgcard)'), 
              border: `1.5px solid ${isDone ? '#A7D9CA' : (isActive ? 'var(--saffron)' : 'var(--border)')}`, 
              borderRadius: 11, 
              opacity: (isDone || isActive) ? 1 : 0.5,
              transition: 'all 0.3s ease' 
            }}>
              <div style={{ 
                width: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: isDone ? 'var(--green)' : (isActive ? 'var(--saffron)' : 'var(--bgsoft)'), 
                border: `1.5px solid ${isDone ? 'var(--green)' : (isActive ? 'var(--saffron)' : 'var(--bordermd)')}`, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: 12, 
                color: (isDone || isActive) ? '#fff' : 'var(--textlt)', 
                fontWeight: 700, 
                flexShrink: 0
              }}>{isDone ? '✓' : i+1}</div>
              
              <span style={{ 
                fontSize: 13, 
                color: isDone ? 'var(--greendk)' : (isActive ? 'var(--navy)' : 'var(--textmd)'), 
                flex: 1, 
                fontWeight: (isDone || isActive) ? 600 : 400 
              }}>{s.label}</span>
              
              <span style={{ 
                fontSize: 9.5, 
                fontWeight: 700, 
                padding: '2px 7px', 
                borderRadius: 4, 
                background: isDone ? 'rgba(15,122,90,0.15)' : (isActive ? 'rgba(232,119,34,0.15)' : 'var(--bgsoft)'), 
                color: isDone ? 'var(--green)' : (isActive ? 'var(--saffron)' : 'var(--textlt)'), 
                letterSpacing: '0.04em' 
              }}>{s.tag}</span>
            </div>
          );
        })}
      </div>
    </div>
  )
}

function ErrorView({ error, onReset, t }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ background: 'var(--redlt)', border: '1.5px solid #FECACA', borderRadius: 16, padding: '24px 20px', textAlign: 'center', width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>{t.scanFailed || 'Scan failed'}</div>
        <p style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6, marginBottom: 20 }}>{error}</p>
        <button onClick={onReset} style={{ background: 'var(--red)', color: '#fff', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600 }}>{t.tryAgain || 'Try Again'}</button>
      </div>
    </div>
  )
}
