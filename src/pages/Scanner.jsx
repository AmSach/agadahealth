import React, { useState, useRef, useCallback } from 'react'
import { scanMedicine, scanPrescription, compressAndEncode, lookupMedicineNameOnly } from '../services/geminiService.js'
import { readBarcode } from '../services/barcodeService.js'
import ResultsPanel from '../components/ResultsPanel.jsx'
import PrescriptionResultsPanel from '../components/PrescriptionResultsPanel.jsx'
import HamMenu from '../components/HamMenu.jsx'
import HealthCard from '../components/HealthCard.jsx'
import { useLang, useSetPage } from '../App.jsx'
import { useT } from '../i18n/translations.js'

// Import Wasm, Crypto and ARScanner components
import { processImageWasm } from '../services/wasmService.js'
import { encryptData, decryptData } from '../services/cryptoService.js'
import ARScanner from '../components/ARScanner.jsx'
import { checkInteractions, checkTherapeuticDuplication, orchestrateMedicationSchedule, flagPotentialSideEffects } from '../services/interactionService.js'
import { getSecureLogs, saveSecureLogs, cacheCSVDatabase, getCachedCSVDatabase, saveEncryptedProfile, getEncryptedProfile, listProfileIds, deleteProfile as dbDeleteProfile } from '../services/dbServiceIndexedDB.js'
import { startReminderLoop, stopReminderLoop } from '../services/notificationService.js'
import SearchWorker from '../wasm/search.worker.js?worker'

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

  // Medicine Cabinet & Profiles
  const [profiles, setProfiles] = useState([])
  const [activeProfileId, setActiveProfileId] = useState('aman')
  const [activeTab, setActiveTab] = useState('cabinet')
  const [symptomInput, setSymptomInput] = useState('')
  const [profileInput, setProfileInput] = useState('')
  const [showAddProfile, setShowAddProfile] = useState(false)

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || {
    id: 'aman',
    name: 'Aman Sachan',
    bloodGroup: '',
    allergies: '',
    chronicConditions: '',
    emergencyName: '',
    emergencyPhone: '',
    cabinet: [],
    adherence: {},
    symptoms: [],
    reminderTimes: { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }
  };
  const cabinet = activeProfile.cabinet || [];

  const [activeInteractions, setActiveInteractions] = useState([])
  const [activeDuplications, setActiveDuplications] = useState([])
  const [activeSchedule, setActiveSchedule] = useState({ schedule: { 'Morning': [], 'Afternoon': [], 'Evening': [], 'Bedtime': [] }, notes: [] })

  // Client-Side Search Engine states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchWorker, setSearchWorker] = useState(null)
  const [searchStatus, setSearchStatus] = useState('Initializing search engine...')

  // Initialize Search worker and database cache
  React.useEffect(() => {
    let active = true;
    let worker = null;

    async function initSearch() {
      try {
        setSearchStatus('Loading drug databases...');
        let cdscoText = await getCachedCSVDatabase('cdsco');
        let jaText = await getCachedCSVDatabase('jan_aushadhi');

        if (!cdscoText || !jaText) {
          setSearchStatus('Downloading database indexes for offline search...');
          const [cdscoRes, jaRes] = await Promise.all([
            fetch('/data/cdsco.csv'),
            fetch('/data/jan_aushadhi.csv')
          ]);
          if (!cdscoRes.ok || !jaRes.ok) throw new Error('Failed to fetch static CSV records from host.');
          
          cdscoText = await cdscoRes.text();
          jaText = await jaRes.text();

          await cacheCSVDatabase('cdsco', cdscoText);
          await cacheCSVDatabase('jan_aushadhi', jaText);
        }

        if (!active) return;
        setSearchStatus('Initializing search thread worker...');
        
        worker = new SearchWorker();
        worker.onmessage = (e) => {
          if (!active) return;
          const { type, cdsco, ja, success, error } = e.data;
          if (type === 'initialized') {
            if (success) {
              setSearchWorker(worker);
              setSearchStatus('Offline search ready.');
            } else {
              setSearchStatus(`Failed to initialize search: ${error}`);
            }
          } else if (type === 'results') {
            setSearchResults({ cdsco, ja });
            setIsSearching(false);
          } else if (type === 'error') {
            console.error('Search worker error:', error);
            setIsSearching(false);
          }
        };

        worker.postMessage({
          type: 'init',
          data: { cdscoText, jaText }
        });
      } catch (err) {
        console.error('Failed to setup search worker:', err);
        setSearchStatus('Search unavailable: offline database load failed.');
      }
    }

    initSearch();

    return () => {
      active = false;
      if (worker) worker.terminate();
    };
  }, []);

  const handleSearchChange = (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    if (searchWorker) {
      setIsSearching(true);
      searchWorker.postMessage({
        type: 'search',
        data: { query }
      });
    }
  };

  React.useEffect(() => {
    if (cabinet.length >= 2) {
      const activeSalts = cabinet.map(item => item.saltComposition)
      const collisions = checkInteractions(activeSalts)
      const dups = checkTherapeuticDuplication(activeSalts)
      setActiveInteractions(collisions)
      setActiveDuplications(dups)
    } else {
      setActiveInteractions([])
      setActiveDuplications([])
    }

    if (cabinet.length > 0) {
      const sched = orchestrateMedicationSchedule(cabinet)
      setActiveSchedule(sched)
    } else {
      setActiveSchedule({ schedule: { 'Morning': [], 'Afternoon': [], 'Evening': [], 'Bedtime': [] }, notes: [] })
    }
  }, [profiles, activeProfileId])

  // Save all profiles to IndexedDB (either encrypted or plain)
  const saveAllProfiles = async (updatedProfiles, pin = vaultPin) => {
    setProfiles(updatedProfiles)
    for (const prof of updatedProfiles) {
      const plainStr = JSON.stringify(prof)
      if (pin) {
        const cipher = await encryptData(plainStr, pin)
        await saveEncryptedProfile(prof.id, cipher)
      } else {
        await saveEncryptedProfile(prof.id, plainStr)
      }
    }
  }

  // Load bookmarks and profiles from IndexedDB
  const loadAllData = async (pin = vaultPin) => {
    try {
      // 1. Load bookmarks
      let savedStr = await getSecureLogs()
      if (!savedStr) {
        savedStr = localStorage.getItem('agada_bookmarks')
        if (savedStr) {
          await saveSecureLogs(savedStr)
          localStorage.removeItem('agada_bookmarks')
        } else {
          savedStr = '[]'
        }
      }
      
      let parsedBookmarks = []
      if (savedStr.includes(':') && savedStr.split(':').length === 3) {
        if (!pin) {
          setIsVaultLocked(true)
          return
        }
        const decrypted = await decryptData(savedStr, pin)
        parsedBookmarks = JSON.parse(decrypted)
      } else {
        parsedBookmarks = JSON.parse(savedStr)
      }
      parsedBookmarks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      setBookmarks(parsedBookmarks)
      
      // 2. Load Profiles
      const keys = await listProfileIds()
      let loadedProfiles = []
      for (const k of keys) {
        const cipher = await getEncryptedProfile(k)
        if (cipher) {
          let plain
          if (cipher.includes(':') && cipher.split(':').length === 3) {
            if (!pin) {
              setIsVaultLocked(true)
              return
            }
            plain = await decryptData(cipher, pin)
          } else {
            plain = cipher
          }
          loadedProfiles.push(JSON.parse(plain))
        }
      }
      
      if (loadedProfiles.length === 0) {
        const defaultProf = {
          id: 'aman',
          name: 'Aman Sachan',
          bloodGroup: 'O+',
          allergies: '',
          chronicConditions: '',
          emergencyName: '',
          emergencyPhone: '',
          cabinet: [],
          adherence: {},
          symptoms: [],
          reminderTimes: { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }
        }
        const serialized = JSON.stringify(defaultProf)
        if (pin) {
          const cipher = await encryptData(serialized, pin)
          await saveEncryptedProfile('aman', cipher)
        } else {
          await saveEncryptedProfile('aman', serialized)
        }
        loadedProfiles = [defaultProf]
      }
      
      setProfiles(loadedProfiles)
      const activeId = localStorage.getItem('agada_active_profile_id') || loadedProfiles[0].id
      setActiveProfileId(activeId)
      setIsVaultLocked(false)
    } catch (e) {
      console.error("Failed to load secure vault data:", e)
    }
  }

  // Toggles an item in the active profile's cabinet
  const toggleCabinetItem = useCallback(async (bookmark, e) => {
    if (e) e.stopPropagation()
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const cab = p.cabinet || []
        const isAlreadyIn = cab.some(item => item.brandName === bookmark.brandName && item.saltComposition === bookmark.saltComposition)
        const nextCab = isAlreadyIn 
          ? cab.filter(item => !(item.brandName === bookmark.brandName && item.saltComposition === bookmark.saltComposition))
          : [...cab, { 
              brandName: bookmark.brandName, 
              saltComposition: bookmark.saltComposition, 
              pillCount: 30, 
              notificationsEnabled: true,
              meta: {
                idealTime: 'Morning',
                foodRelation: 'With or without food',
                rationale: 'Standard maintenance dosing.'
              }
            }]
        return { ...p, cabinet: nextCab }
      }
      return p
    })
    await saveAllProfiles(updated)
  }, [profiles, activeProfileId])

  // Update a profile's emergency health card details
  const handleSaveHealthCard = async (formData) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        return { ...p, ...formData }
      }
      return p
    })
    await saveAllProfiles(updated)
  }

  // Log a symptom for the active profile
  const handleLogSymptom = async (text) => {
    if (!text.trim()) return
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const sym = p.symptoms || []
        return { 
          ...p, 
          symptoms: [...sym, { text: text.trim(), date: new Date().toLocaleDateString() }] 
        }
      }
      return p
    })
    await saveAllProfiles(updated)
    setSymptomInput('')
  }

  // Delete a symptom
  const handleDeleteSymptom = async (idx) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const sym = p.symptoms || []
        return { ...p, symptoms: sym.filter((_, i) => i !== idx) }
      }
      return p
    })
    await saveAllProfiles(updated)
  }

  // Toggle notification alerts for a medicine
  const handleToggleNotification = async (med) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const nextCab = (p.cabinet || []).map(item => {
          if (item.brandName === med.brandName && item.saltComposition === med.saltComposition) {
            return { ...item, notificationsEnabled: !item.notificationsEnabled }
          }
          return item
        })
        return { ...p, cabinet: nextCab }
      }
      return p
    })
    await saveAllProfiles(updated)
  }

  // Update pill stock counts
  const handleUpdatePillCount = async (med, diff) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const nextCab = (p.cabinet || []).map(item => {
          if (item.brandName === med.brandName && item.saltComposition === med.saltComposition) {
            const count = Math.max(0, (item.pillCount || 0) + diff)
            return { ...item, pillCount: count }
          }
          return item
        })
        return { ...p, cabinet: nextCab }
      }
      return p
    })
    await saveAllProfiles(updated)
  }

  // Update reminder take-times
  const handleUpdateReminderTime = async (slot, val) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const times = p.reminderTimes || { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }
        return { ...p, reminderTimes: { ...times, [slot]: val } }
      }
      return p
    })
    await saveAllProfiles(updated)
  }

  // Toggle daily dose adherence checklist items
  const handleToggleAdherence = async (dateStr, slot) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const ad = p.adherence || {}
        const todayAd = ad[dateStr] || { Morning: false, Afternoon: false, Evening: false, Bedtime: false }
        const nextTodayAd = { ...todayAd, [slot]: !todayAd[slot] }
        return { ...p, adherence: { ...ad, [dateStr]: nextTodayAd } }
      }
      return p
    })
    await saveAllProfiles(updated)
  }

  // Add a new family profile
  const handleAddProfile = async (name) => {
    if (!name.trim()) return
    const cleanId = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')
    if (profiles.some(p => p.id === cleanId)) return
    
    const newProf = {
      id: cleanId,
      name: name.trim(),
      bloodGroup: '',
      allergies: '',
      chronicConditions: '',
      emergencyName: '',
      emergencyPhone: '',
      cabinet: [],
      adherence: {},
      symptoms: [],
      reminderTimes: { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }
    }
    const nextProfiles = [...profiles, newProf]
    await saveAllProfiles(nextProfiles)
    setActiveProfileId(cleanId)
    localStorage.setItem('agada_active_profile_id', cleanId)
    setProfileInput('')
    setShowAddProfile(false)
  }

  // Delete a profile
  const handleDeleteProfile = async (profileId) => {
    if (profiles.length <= 1) return
    const updated = profiles.filter(p => p.id !== profileId)
    setProfiles(updated)
    await dbDeleteProfile(profileId)
    const nextId = updated[0].id
    setActiveProfileId(nextId)
    localStorage.setItem('agada_active_profile_id', nextId)
  }

  // Notification Reminder Background loop
  React.useEffect(() => {
    if (activeProfile && activeProfile.cabinet && activeProfile.cabinet.length > 0) {
      const times = activeProfile.reminderTimes || { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }
      startReminderLoop(activeProfile.cabinet, times, (item, slot) => {
        alert(`⏰ Reminder: It is time to take your ${item.brandName} (${slot} dose).`)
      })
    }
    return () => {
      stopReminderLoop()
    }
  }, [profiles, activeProfileId])

  // Load bookmarks and profiles on view load
  React.useEffect(() => {
    if (view === VIEWS.HOME) {
      loadAllData()
    }
  }, [view])

  const handleSelectBookmark = (bookmark) => {
    setResults(bookmark.results)
    setPreview(bookmark.results?.preview || null)
    setView(VIEWS.RESULTS)
  }

  const handleDeleteBookmark = async (e, bookmark) => {
    e.stopPropagation()
    try {
      const updated = bookmarks.filter(b => !(b.brandName === bookmark.brandName && b.saltComposition === bookmark.saltComposition))
      setBookmarks(updated)
      
      if (vaultPin) {
        const cipher = await encryptData(JSON.stringify(updated), vaultPin)
        await saveSecureLogs(cipher)
      } else {
        await saveSecureLogs(JSON.stringify(updated))
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
        await saveSecureLogs(cipher)
      } else {
        await saveSecureLogs(JSON.stringify(updated))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleUnlockVault = async (pin) => {
    try {
      const savedStr = await getSecureLogs() || '[]'
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
      await saveSecureLogs(cipher)
      setVaultPin(pin)
      setShowPinSetup(false)
      setNewPin('')
      setPinError('')
    } catch (err) {
      setPinError('Failed to encrypt bookmarks.')
    }
  }

  const handleDisableEncryption = async () => {
    try {
      await saveSecureLogs(JSON.stringify(bookmarks))
      setVaultPin('')
      setPinError('')
    } catch (err) {
      setPinError('Failed to disable encryption.')
    }
  }

  const handleGlobalSearch = async (queryText) => {
    if (!queryText || !queryText.trim()) return;
    setView(VIEWS.LOADING);
    setError(null);
    setStep(1);
    setBarcodeHit(false);
    setProcessedPreview(null);
    setCompletedStepIds([]);
    setActiveStepId(null);
    setPreview(null);
    try {
      setActiveStepId('started');
      const res = await lookupMedicineNameOnly(queryText.trim());
      setCompletedStepIds(['started', 'vision', 'db', 'scraping', 'summary']);
      setActiveStepId(null);
      setResults(res);
      setView(VIEWS.RESULTS);
    } catch (err) {
      setError(err.message || 'Failed to complete global online search.');
      setView(VIEWS.ERROR);
    }
  };

  const handleSelectSearchResult = (result, type) => {
    let queryText = '';
    if (type === 'cdsco') {
      queryText = result.row['Drug Name'] || '';
    } else {
      queryText = result.row['Generic Name'] || result.row['Drug Name'] || '';
    }
    if (queryText) {
      handleGlobalSearch(queryText);
    }
  };

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
          res.isPrescription = true
        } else {
          await new Promise(r => setTimeout(r, 300))
          res = await scanMedicine(finalBase64, 'image/jpeg', barcodeData)
          setStep(3)
          await new Promise(r => setTimeout(r, 300))
          if (res.cannotRead) throw new Error(res.cannotReadReason || 'Could not read the medicine. Try a clearer photo.')
        }
        res.preview = `data:image/jpeg;base64,${finalBase64}`
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
          scanResult.preview = `data:image/jpeg;base64,${finalBase64}`
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
        <button id="menu-toggle-btn" onClick={() => setHamOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4.5 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 17, height: 1.5, background: hamOpen && i===1 ? 'transparent' : '#fff', borderRadius: 1, display: 'block',
            transform: hamOpen ? (i===0 ? 'translateY(6px) rotate(45deg)' : i===2 ? 'translateY(-6px) rotate(-45deg)' : 'none') : 'none', transition: 'all 0.25s' }} />)}
        </button>
      </header>

      <HamMenu 
        open={hamOpen} 
        onClose={() => setHamOpen(false)} 
        lang={lang} 
        setLang={setLang} 
        t={t} 
        onScan={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset(); setActiveTab('cabinet'); }} 
        onCabinet={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset(); setActiveTab('cabinet'); }}
        onReminders={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset(); setActiveTab('reminders'); }}
        onHealthCard={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset(); setActiveTab('healthcard'); }}
        onSymptoms={() => { setHamOpen(false); if (view !== VIEWS.HOME) reset(); setActiveTab('symptoms'); }}
      />

      {/* Beta banner */}
      <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FCD34D', padding: '7px 16px', textAlign: 'center' }}>
        <span style={{ fontSize: 11.5, color: '#92400E' }}>🚧 <strong>Beta</strong> — {t.betaBanner || 'AI results may not be 100% accurate. Verify with your pharmacist.'}</span>
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
          cabinet={cabinet}
          toggleCabinetItem={toggleCabinetItem}
          activeInteractions={activeInteractions}
          activeDuplications={activeDuplications}
          activeSchedule={activeSchedule}
          searchQuery={searchQuery}
          handleSearchChange={handleSearchChange}
          searchResults={searchResults}
          isSearching={isSearching}
          searchStatus={searchStatus}
          handleSelectSearchResult={handleSelectSearchResult}
          handleGlobalSearch={handleGlobalSearch}
          
          profiles={profiles}
          activeProfileId={activeProfileId}
          setActiveProfileId={setActiveProfileId}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          symptomInput={symptomInput}
          setSymptomInput={setSymptomInput}
          profileInput={profileInput}
          setProfileInput={setProfileInput}
          showAddProfile={showAddProfile}
          setShowAddProfile={setShowAddProfile}
          activeProfile={activeProfile}
          handleSaveHealthCard={handleSaveHealthCard}
          handleLogSymptom={handleLogSymptom}
          handleDeleteSymptom={handleDeleteSymptom}
          handleToggleNotification={handleToggleNotification}
          handleUpdatePillCount={handleUpdatePillCount}
          handleUpdateReminderTime={handleUpdateReminderTime}
          handleToggleAdherence={handleToggleAdherence}
          handleAddProfile={handleAddProfile}
          handleDeleteProfile={handleDeleteProfile}
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
          <PrescriptionResultsPanel results={results} preview={preview} onReset={reset} t={t} lang={lang} bookmarks={bookmarks} onToggleBookmark={toggleBookmark} />
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
  handleDisableEncryption,
  cabinet, toggleCabinetItem, activeInteractions, activeDuplications, activeSchedule,
  searchQuery, handleSearchChange, searchResults, isSearching, searchStatus, handleSelectSearchResult, handleGlobalSearch,
  
  profiles, activeProfileId, setActiveProfileId, activeTab, setActiveTab,
  symptomInput, setSymptomInput, profileInput, setProfileInput, showAddProfile, setShowAddProfile,
  activeProfile, handleSaveHealthCard, handleLogSymptom, handleDeleteSymptom,
  handleToggleNotification, handleUpdatePillCount, handleUpdateReminderTime, handleToggleAdherence,
  handleAddProfile, handleDeleteProfile
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, var(--bg) 0%, #FFFFFF 100%)', padding: '0 18px 32px', animation: 'fadeIn 0.4s ease' }}>

      {/* Modern Hero Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 0 32px', animation: 'fadeUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--greenlt)', color: 'var(--greendk)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 20, boxShadow: '0 2px 8px rgba(15,122,90,0.1)' }}>
          <span style={{ fontSize: 14 }}>✨</span> {t.knowYourMedicine || 'Know Your Medicine'}
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
            <span style={{ fontSize: 56 }}>💊</span>
          </div>
          <div style={{ position: 'absolute', top: '15%', left: '-15%', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 8px', fontSize: 12, fontWeight: 700, color: 'var(--green)', boxShadow: 'var(--shadow)', transform: 'rotate(-10deg)', animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.5s both' }}>✓ Verified</div>
          <div style={{ position: 'absolute', bottom: '15%', right: '-15%', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 8px', fontSize: 12, fontWeight: 700, color: 'var(--textlt)', boxShadow: 'var(--shadow)', transform: 'rotate(8deg)', animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.65s both' }}>₹140 Save</div>
        </div>

        {/* Primary Call to Action */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.4s ease 0.3s both' }}>
          <button onClick={() => onCamera('medicine')} style={{ width: '100%', height: 60, background: 'linear-gradient(135deg, var(--green), #0D9488)', borderRadius: 16, color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 16px rgba(15,122,90,0.25)', border: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
            <span style={{ fontSize: 22 }}>📷</span> {t.scanMedicineBtn ? t.scanMedicineBtn.replace(/^[📷\s]+/, '') : 'Scan Medicine Strip'}
          </button>
          
          <button onClick={() => onCamera('prescription')} style={{ width: '100%', height: 60, background: 'linear-gradient(135deg, var(--navy), var(--navylt))', borderRadius: 16, color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 16px rgba(26,43,74,0.25)', border: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}>
            <span style={{ fontSize: 22 }}>📝</span> {t.scanPrescriptionBtn ? t.scanPrescriptionBtn.replace(/^[📝\s]+/, '') : 'Scan Prescription'}
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

      {/* Offline search engine section */}
      <div style={{
        background: '#fff',
        border: '1.5px solid var(--border)',
        borderRadius: 16,
        padding: '16px',
        marginTop: '16px',
        marginBottom: '20px',
        boxShadow: 'var(--shadow)',
        animation: 'fadeUp 0.5s ease 0.35s both'
      }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          🔍 Instant Medicine & Salt Lookup
        </h3>
        <p style={{ fontSize: 11, color: 'var(--textlt)', margin: '0 0 12px 0' }}>
          Type a brand name or composition salt. Works offline using Double Metaphone and BM25 index matching.
        </p>

        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGlobalSearch(searchQuery) }}
              placeholder="Search e.g. Crocin, Paracetamol, Atorvastatin..."
              style={{
                flex: 1,
                height: 46,
                padding: '0 12px',
                borderRadius: 10,
                border: '1.5px solid var(--bordermd)',
                fontSize: 13.5,
                color: 'var(--navy)',
                outline: 'none',
                background: '#fff',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--green)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--bordermd)'}
            />
            <button 
              onClick={() => handleGlobalSearch(searchQuery)}
              style={{
                height: 46,
                padding: '0 16px',
                background: 'linear-gradient(135deg, var(--green), #0D9488)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(15,122,90,0.15)',
                transition: 'transform 0.2s'
              }}
            >
              Search
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--textlt)', marginTop: 6, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🔒</span> {searchStatus}
          </div>
        </div>

        {/* Real-time Search suggestions */}
        {searchQuery && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, maxHeight: 220, overflowY: 'auto' }}>
            {isSearching && (
              <div style={{ fontSize: 12, color: 'var(--textlt)', padding: '6px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                Computing scoring ranks...
              </div>
            )}

            {!isSearching && (!searchResults || (searchResults.cdsco.length === 0 && searchResults.ja.length === 0)) && (
              <div style={{ fontSize: 12, color: 'var(--textlt)', padding: '6px 0', textAlign: 'center' }}>
                No matches found phonetically or by keyword relevance.
              </div>
            )}

            {searchResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.cdsco.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      Approved CDSCO Formulations:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {searchResults.cdsco.map((res, ridx) => (
                        <div
                          key={ridx}
                          onClick={() => handleSelectSearchResult(res, 'cdsco')}
                          style={{ padding: '8px 10px', background: 'var(--bgsoft)', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'var(--greenlt)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'var(--bgsoft)'}
                        >
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {res.row['Drug Name']}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--textlt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Indication: {res.row['Indication'] || 'Maintenance Therapy'}
                            </div>
                          </div>
                          <span style={{ fontSize: 9.5, padding: '2px 6px', background: 'var(--greenlt)', color: 'var(--green)', borderRadius: 4, fontWeight: 700, marginLeft: 8 }}>
                            Score: {res.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.ja.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, marginTop: 6 }}>
                      Jan Aushadhi Generic Alternatives:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {searchResults.ja.map((res, ridx) => (
                        <div
                          key={ridx}
                          onClick={() => handleSelectSearchResult(res, 'ja')}
                          style={{ padding: '8px 10px', background: 'var(--bgsoft)', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'var(--safflt)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'var(--bgsoft)'}
                        >
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {res.row['Generic Name']}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--textlt)' }}>
                              MRP: ₹{res.row['MRP']} ({res.row['Unit Size']})
                            </div>
                          </div>
                          <span style={{ fontSize: 9.5, padding: '2px 6px', background: 'var(--safflt)', color: 'var(--saffron)', borderRadius: 4, fontWeight: 700, marginLeft: 8 }}>
                            Score: {res.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
              {bookmarks.map((b, idx) => {
                const isInCabinet = cabinet.some(item => item.brandName === b.brandName && item.saltComposition === b.saltComposition);
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectBookmark(b)}
                    style={{
                      background: '#fff',
                      border: isInCabinet ? '1.5px solid var(--green)' : '1.5px solid var(--border)',
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
                      e.currentTarget.style.borderColor = isInCabinet ? 'var(--green)' : 'var(--border)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <div 
                      onClick={(e) => toggleCabinetItem(b, e)} 
                      title="Add/remove from interaction check cabinet"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        width: 28, 
                        height: 28, 
                        borderRadius: 8, 
                        border: `1.5px solid ${isInCabinet ? 'var(--green)' : 'var(--bordermd)'}`, 
                        background: isInCabinet ? 'var(--green)' : '#fff',
                        color: isInCabinet ? '#fff' : 'transparent',
                        fontWeight: 900,
                        fontSize: 14,
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}
                    >
                      ✓
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
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Personal Medicine OS Dashboard */}
      {!isVaultLocked && (
        <div style={{ 
          marginTop: 20, 
          background: '#fff', 
          border: '1.5px solid var(--border)', 
          borderRadius: 16, 
          padding: '16px', 
          boxShadow: 'var(--shadow)',
          animation: 'fadeUp 0.5s ease 0.4s both'
        }}>
          {/* Profile Selector Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, background: 'var(--navy)', color: '#fff', padding: '10px 14px', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>👤</span>
              <select 
                value={activeProfileId} 
                onChange={e => {
                  setActiveProfileId(e.target.value);
                  localStorage.setItem('agada_active_profile_id', e.target.value);
                }}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
              >
                {profiles.map(p => <option key={p.id} value={p.id} style={{ color: 'var(--navy)' }}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setShowAddProfile(o => !o)} style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', background: 'rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff' }}>
                {showAddProfile ? 'Cancel' : '➕ User'}
              </button>
              {profiles.length > 1 && (
                <button onClick={() => { if(confirm(`Delete profile for ${activeProfile.name}?`)) handleDeleteProfile(activeProfileId) }} style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', background: 'var(--red)', borderRadius: 6, color: '#fff' }}>
                  🗑️
                </button>
              )}
            </div>
          </div>

          {/* Add Profile Inline Form */}
          {showAddProfile && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: 12, background: 'var(--bgsoft)', borderRadius: 10, animation: 'fadeIn 0.25s' }}>
              <input 
                type="text" 
                value={profileInput} 
                onChange={e => setProfileInput(e.target.value)} 
                placeholder="Family member's name..." 
                style={{ flex: 1, height: 36, padding: '0 8px', borderRadius: 6, border: '1px solid var(--bordermd)', fontSize: 13 }}
              />
              <button onClick={() => handleAddProfile(profileInput)} style={{ padding: '0 12px', background: 'var(--green)', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>Add</button>
            </div>
          )}

          {/* Dashboard Navigation Tabs */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            <button className={`btn-tab ${activeTab === 'cabinet' ? 'active' : ''}`} onClick={() => setActiveTab('cabinet')}>💊 Cabinet & Stock</button>
            <button className={`btn-tab ${activeTab === 'reminders' ? 'active' : ''}`} onClick={() => setActiveTab('reminders')}>📅 Alarms & Adherence</button>
            <button className={`btn-tab ${activeTab === 'healthcard' ? 'active' : ''}`} onClick={() => setActiveTab('healthcard')}>📋 Health Card</button>
            <button className={`btn-tab ${activeTab === 'symptoms' ? 'active' : ''}`} onClick={() => setActiveTab('symptoms')}>⚠️ Symptoms & ADR</button>
          </div>

          {/* TAB 1: Cabinet & Stock */}
          {activeTab === 'cabinet' && (
            <div>
              <h4 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>Active Cabinet Inventory</h4>
              {cabinet.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--textlt)', margin: 0, lineHeight: 1.5 }}>
                  No medicines in cabinet. Add from search autocomplete or check bookmark boxes above to add scans to this user's cabinet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {cabinet.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'var(--bgsoft)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{item.brandName}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--textlt)' }}>{item.saltComposition}</div>
                        </div>
                        <button onClick={(e) => toggleCabinetItem(item, e)} style={{ fontSize: 16, color: 'var(--red)', fontWeight: 800 }}>×</button>
                      </div>

                      {/* Stock & Notifications control row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTop: '1px dashed var(--border)', paddingTop: 6, marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--textmd)', fontWeight: 600 }}>Stock:</span>
                          <span style={{ 
                            fontSize: 11, 
                            fontWeight: 700, 
                            color: (item.pillCount || 0) <= 5 ? 'var(--red)' : 'var(--navy)',
                            background: (item.pillCount || 0) <= 5 ? 'var(--redlt)' : 'transparent',
                            padding: '1px 5px',
                            borderRadius: 4
                          }}>
                            {item.pillCount || 0} pills {(item.pillCount || 0) <= 5 && '⚠️ Low stock!'}
                          </span>
                          <button onClick={() => handleUpdatePillCount(item, -1)} style={{ fontSize: 11, padding: '2px 6px', background: '#fff', border: '1px solid var(--border)', borderRadius: 4, fontWeight: 800 }}>-1</button>
                          <button onClick={() => handleUpdatePillCount(item, 30)} style={{ fontSize: 11, padding: '2px 6px', background: '#fff', border: '1px solid var(--border)', borderRadius: 4, fontWeight: 800 }}>+30</button>
                        </div>

                        <label style={{ fontSize: 11, color: 'var(--textmd)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={!!item.notificationsEnabled} 
                            onChange={() => handleToggleNotification(item)}
                            style={{ accentColor: 'var(--green)' }} 
                          />
                          🔔 Alerts
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Interaction Warning Sub-Panel */}
              {cabinet.length >= 2 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {activeInteractions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        ⚠️ Contraindications Warning:
                      </div>
                      {activeInteractions.map((col, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', background: col.severity === 'CRITICAL' ? 'var(--redlt)' : '#FFFBEB', border: `1.5px solid ${col.severity === 'CRITICAL' ? '#FECACA' : '#FCD34D'}`, borderRadius: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: col.severity === 'CRITICAL' ? 'var(--red)' : '#92400E' }}>{col.title}</span>
                            <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: col.severity === 'CRITICAL' ? 'var(--red)' : 'var(--saffron)', color: '#fff' }}>{col.severity}</span>
                          </div>
                          <div style={{ fontSize: 10.5, color: col.severity === 'CRITICAL' ? '#991B1B' : '#78350F', fontWeight: 600, marginBottom: 4 }}>Collision: {col.saltA} + {col.saltB}</div>
                          <p style={{ fontSize: 11.5, color: 'var(--textmd)', margin: 0, lineHeight: 1.45 }}>{col.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeDuplications.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--saffron)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        ⚠️ Therapeutic Overlaps:
                      </div>
                      {activeDuplications.map((dup, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400E' }}>{dup.title} ({dup.className})</span>
                          </div>
                          <p style={{ fontSize: 11.5, color: 'var(--textmd)', margin: 0, lineHeight: 1.45 }}>{dup.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeInteractions.length === 0 && activeDuplications.length === 0 && (
                    <div style={{ padding: '8px 12px', background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10, fontSize: 11.5, color: '#15803D', fontWeight: 600, textAlign: 'center' }}>
                      ✓ No interactions or therapeutic duplications found in cabinet.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Alarms & Adherence */}
          {activeTab === 'reminders' && (
            <div>
              {/* Daily Reminder Time Pickers */}
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Set Reminder Times</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {Object.entries(activeProfile.reminderTimes || { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }).map(([slot, time]) => (
                  <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--bgsoft)', padding: '6px 10px', borderRadius: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>{slot}</span>
                    <input 
                      type="time" 
                      value={time} 
                      onChange={(e) => handleUpdateReminderTime(slot, e.target.value)} 
                      style={{ fontSize: 12, padding: '2px', border: '1px solid var(--border)', borderRadius: 4, background: '#fff', width: '100%', outline: 'none' }}
                    />
                  </div>
                ))}
              </div>

              {/* Daily Adherence Grid */}
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Daily Adherence Check-off</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--greenlt)', padding: 12, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--greendk)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Dose Adherence checklist:</span>
                  <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {['Morning', 'Afternoon', 'Evening', 'Bedtime'].map(slot => {
                    const dateStr = new Date().toDateString();
                    const ad = activeProfile.adherence || {};
                    const todayAd = ad[dateStr] || { Morning: false, Afternoon: false, Evening: false, Bedtime: false };
                    const isChecked = !!todayAd[slot];

                    return (
                      <button 
                        key={slot}
                        onClick={() => handleToggleAdherence(dateStr, slot)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: 8,
                          border: `1.5px solid ${isChecked ? 'var(--green)' : 'var(--border)'}`,
                          background: isChecked ? 'var(--green)' : '#fff',
                          color: isChecked ? '#fff' : 'var(--textmd)',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        {isChecked ? '✓ ' : ''}{slot}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chronotherapy Daily Schedule Timeline */}
              {activeSchedule && activeSchedule.schedule && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    📅 Orchestrated Daily Dosing Timeline:
                  </div>
                  
                  {activeSchedule.notes && activeSchedule.notes.map((note, nidx) => (
                    <div key={nidx} style={{ padding: '8px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 11.5, color: '#1E40AF', marginBottom: 12, fontWeight: 600 }}>
                      {note.message}
                    </div>
                  ))}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', paddingLeft: 12 }}>
                    <div style={{ position: 'absolute', left: 4, top: 8, bottom: 8, width: 2, background: 'linear-gradient(180deg, var(--green) 0%, var(--saffron) 50%, var(--navy) 100%)', borderRadius: 1 }} />
                    
                    {Object.entries(activeSchedule.schedule).map(([timeOfDay, meds]) => {
                      let icon = '☀️';
                      let bulletColor = 'var(--green)';
                      if (timeOfDay === 'Afternoon') { icon = '🌤️'; bulletColor = 'var(--saffron)'; }
                      if (timeOfDay === 'Evening') { icon = '🌇'; bulletColor = 'var(--orange)'; }
                      if (timeOfDay === 'Bedtime') { icon = '🌙'; bulletColor = 'var(--navy)'; }

                      return (
                        <div key={timeOfDay} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ position: 'absolute', left: -14, top: 4, width: 8, height: 8, borderRadius: '50%', background: bulletColor, border: '2px solid #fff', boxShadow: '0 0 0 1.5px ' + bulletColor }} />
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{icon} {timeOfDay}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--bgsoft)', color: 'var(--textmd)' }}>
                              {meds.length} {meds.length === 1 ? 'med' : 'meds'}
                            </span>
                          </div>

                          {meds.length === 0 ? (
                            <div style={{ fontSize: 11, color: 'var(--textlt)', paddingLeft: 4, fontStyle: 'italic' }}>
                              No medicines scheduled.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                              {meds.map((med, midx) => (
                                <div key={midx} style={{ padding: '8px 10px', background: 'var(--bgcard)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>{med.brandName}</span>
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: med.foodRelation.includes('Empty') ? 'var(--red)' : 'var(--green)', background: med.foodRelation.includes('Empty') ? 'var(--redlt)' : 'var(--greenlt)', padding: '2px 5px', borderRadius: 4 }}>
                                      {med.foodRelation}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 10.5, color: 'var(--textlt)', marginTop: 2 }}>{med.saltComposition}</div>
                                  <div style={{ fontSize: 10.5, color: 'var(--textmd)', marginTop: 4, borderTop: '1px dashed var(--border)', paddingTop: 4, fontStyle: 'italic' }}>
                                    💡 {med.rationale}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Health Card & QR */}
          {activeTab === 'healthcard' && (
            <HealthCard profile={activeProfile} onSaveProfile={handleSaveHealthCard} />
          )}

          {/* TAB 4: Symptoms & ADR Warnings */}
          {activeTab === 'symptoms' && (
            <div>
              <h4 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Log Symptoms & Track Side Effects</h4>
              
              {/* Symptom logger input form */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input 
                  type="text" 
                  value={symptomInput} 
                  onChange={e => setSymptomInput(e.target.value)} 
                  placeholder="Enter symptom (e.g. Dry cough, muscle pain)..." 
                  style={{ flex: 1, height: 38, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--bordermd)', fontSize: 13 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleLogSymptom(symptomInput) }}
                />
                <button onClick={() => handleLogSymptom(symptomInput)} style={{ padding: '0 14px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>Log</button>
              </div>

              {/* Flagged ADR Side-effect alert warnings */}
              {(() => {
                const cabSalts = cabinet.map(c => c.saltComposition);
                const symTexts = (activeProfile.symptoms || []).map(s => s.text);
                const warnings = flagPotentialSideEffects(cabSalts, symTexts);

                if (warnings.length > 0) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        🚨 Potential Side Effect Overlaps Flagged:
                      </div>
                      {warnings.map((w, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', background: 'var(--redlt)', border: '1.5px solid #FECACA', borderRadius: 10, fontSize: 12, color: '#991B1B', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div>{w.explanation}</div>
                          <div style={{ fontSize: 10, color: 'var(--textlt)', fontStyle: 'italic' }}>
                            Linked drug: {w.salt} causes {w.symptom}. We recommend consulting a pharmacist to adjust dosage.
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Symptoms history log */}
              <h5 style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Symptom History</h5>
              {(!activeProfile.symptoms || activeProfile.symptoms.length === 0) ? (
                <p style={{ fontSize: 11.5, color: 'var(--textlt)', margin: 0, fontStyle: 'italic' }}>No logged symptoms. Enter symptoms above to check for adverse drug reactions.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                  {activeProfile.symptoms.map((s, sidx) => (
                    <div key={sidx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bgsoft)', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{s.text}</span>
                        <span style={{ fontSize: 10, color: 'var(--textlt)', marginLeft: 8 }}>({s.date})</span>
                      </div>
                      <button onClick={() => handleDeleteSymptom(sidx)} style={{ color: 'var(--red)', fontSize: 12 }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer links */}
      <div style={{ textAlign: 'center', padding: '16px 0 4px', display: 'flex', justifyContent: 'center', gap: 20 }}>
        <button id="footer-privacy-link" onClick={() => setPage('privacy')} style={{ fontSize: 11.5, color: 'var(--textlt)', fontWeight: 500 }}>
          {t.privacyTitle || 'Privacy Policy'}
        </button>
        <button id="footer-terms-link" onClick={() => setPage('terms')} style={{ fontSize: 11.5, color: 'var(--textlt)', fontWeight: 500 }}>
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
