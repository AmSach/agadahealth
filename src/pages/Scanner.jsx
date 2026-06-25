import React, { useState, useRef, useCallback } from 'react'
import { scanMedicine, scanPrescription, compressAndEncode, lookupMedicineNameOnly } from '../services/geminiService.js'
import { readBarcode } from '../services/barcodeService.js'
import ResultsPanel, { BloodstreamSimulator } from '../components/ResultsPanel.jsx'
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
import { getPKParameters, simulatePharmacokinetics, checkDosageSafety } from '../services/pharmacokineticsService.js'

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

  // Smart Cabinet Hub detail state variables
  const [selectedCabinetIndex, setSelectedCabinetIndex] = useState(0)
  const cabinetSearchQueryRef = useRef('')
  const [cabinetSearchResults, setCabinetSearchResults] = useState(null)
  const [isCabinetSearching, setIsCabinetSearching] = useState(false)

  // Direct Cabinet Adding Search States
  const cabinetAddQueryRef = useRef('')
  const [cabinetAddQuery, setCabinetAddQuery] = useState('')
  const [cabinetAddResults, setCabinetAddResults] = useState(null)
  const [isCabinetAddSearching, setIsCabinetAddSearching] = useState(false)

  // Cabinet View Toggles & Add Modal Form
  const [showCabinet3D, setShowCabinet3D] = useState(true)
  const [showManualAddModal, setShowManualAddModal] = useState(false)
  const [manualAddForm, setManualAddForm] = useState({
    brandName: '',
    saltComposition: '',
    strength: 500,
    strengthUnit: 'mg',
    form: 'Tablet',
    pillCount: 30,
    mfgDate: '',
    expiryDate: '',
    batchNumber: '',
    idealTime: 'Morning',
    foodRelation: 'With or without food',
    frequency: 3
  })

  const selectedMed = cabinet[selectedCabinetIndex] || cabinet[0] || null
  const [cabDoseStrength, setCabDoseStrength] = useState(500)
  const [cabDoseFreq, setCabDoseFreq] = useState(3)
  const [cabScrubTime, setCabScrubTime] = useState(0)

  const handleCabinetSearch = useCallback((query) => {
    if (!query) {
      setCabinetSearchResults(null)
      setIsCabinetSearching(false)
      return
    }
    cabinetSearchQueryRef.current = query
    if (searchWorker) {
      setIsCabinetSearching(true)
      searchWorker.postMessage({
        type: 'search',
        data: { query }
      })
    }
  }, [searchWorker])

  const handleCabinetAddSearch = useCallback((query) => {
    setCabinetAddQuery(query)
    if (!query) {
      setCabinetAddResults(null)
      setIsCabinetAddSearching(false)
      return
    }
    cabinetAddQueryRef.current = query
    if (searchWorker) {
      setIsCabinetAddSearching(true)
      searchWorker.postMessage({
        type: 'search',
        data: { query }
      })
    }
  }, [searchWorker])

  React.useEffect(() => {
    if (selectedMed) {
      let parsedDose = 500;
      if (typeof selectedMed.strength === 'number') {
        parsedDose = selectedMed.strength;
      } else {
        const m = (selectedMed.saltComposition || '').match(/(\d+)\s*(mg|mcg|g)/i)
        parsedDose = m ? parseInt(m[1]) : 500;
      }
      
      let parsedFreq = 3;
      if (typeof selectedMed.frequency === 'number') {
        parsedFreq = selectedMed.frequency;
      }
      
      setCabDoseStrength(parsedDose)
      setCabDoseFreq(parsedFreq)
      setCabScrubTime(0)
      handleCabinetSearch(selectedMed.saltComposition || selectedMed.brandName)
    }
  }, [selectedCabinetIndex, selectedMed?.brandName, selectedMed?.saltComposition, selectedMed?.strength, selectedMed?.frequency, handleCabinetSearch])

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
          const { type, query: respQuery, cdsco, ja, success, error } = e.data;
          if (type === 'initialized') {
            if (success) {
              setSearchWorker(worker);
              setSearchStatus('Offline search ready.');
            } else {
              setSearchStatus(`Failed to initialize search: ${error}`);
            }
          } else if (type === 'results') {
            if (respQuery && respQuery === cabinetAddQueryRef.current) {
              setCabinetAddResults({ cdsco, ja });
              setIsCabinetAddSearching(false);
            } else if (respQuery && respQuery === cabinetSearchQueryRef.current) {
              setCabinetSearchResults({ cdsco, ja });
              setIsCabinetSearching(false);
            } else {
              setSearchResults({ cdsco, ja });
              setIsSearching(false);
            }
          } else if (type === 'error') {
            console.error('Search worker error:', error);
            setIsSearching(false);
            setIsCabinetSearching(false);
            setIsCabinetAddSearching(false);
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

  // Update specific fields of a cabinet item (MFG, Expiry, Batch, etc.)
  const handleUpdateCabinetItem = async (med, fields) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const nextCab = (p.cabinet || []).map(item => {
          if (item.brandName === med.brandName && item.saltComposition === med.saltComposition) {
            return { ...item, ...fields }
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

  const startAnalysis = useCallback(async (finalBase64, barcodeData) => {
    try {
      if (barcodeData && barcodeData.isEmergencyCard) {
        setStep(3)
        const mockResult = {
          isEmergencyCard: true,
          emergencyProfile: barcodeData,
          preview: `data:image/jpeg;base64,${finalBase64}`
        }
        setResults(mockResult)
        setView(VIEWS.RESULTS)
        return
      }

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

// Base64 helper to convert camera capture to Blob for QR/barcode scanner
function base64ToBlob(base64, mime = 'image/jpeg') {
  const byteString = atob(base64)
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new Blob([ab], { type: mime })
}

  // Handle image capture from live WebRTC stream
  const handleCapturedFrame = useCallback(async (base64, directBarcodeText = null) => {
    setView(VIEWS.LOADING)
    setError(null)
    setStep(1)
    setBarcodeHit(false)
    setProcessedPreview(null)
    setCompletedStepIds([])
    setActiveStepId(null)
    setPreview(`data:image/jpeg;base64,${base64}`)
    
    let barcodeData = null
    if (directBarcodeText) {
      console.log("Using direct barcode text from camera stream:", directBarcodeText)
      barcodeData = await readBarcode(directBarcodeText)
    } else {
      try {
        const blob = base64ToBlob(base64)
        barcodeData = await readBarcode(blob)
      } catch (e) {
        console.error("Barcode reading error from captured frame:", e)
      }
    }
    
    if (barcodeData) setBarcodeHit(true)
    
    await startAnalysis(base64, barcodeData)
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
          selectedCabinetIndex={selectedCabinetIndex}
          setSelectedCabinetIndex={setSelectedCabinetIndex}
          cabinetSearchResults={cabinetSearchResults}
          setCabinetSearchResults={setCabinetSearchResults}
          isCabinetSearching={isCabinetSearching}
          setIsCabinetSearching={setIsCabinetSearching}
          selectedMed={selectedMed}
          cabDoseStrength={cabDoseStrength}
          setCabDoseStrength={setCabDoseStrength}
          cabDoseFreq={cabDoseFreq}
          setCabDoseFreq={setCabDoseFreq}
          cabScrubTime={cabScrubTime}
          setCabScrubTime={setCabScrubTime}
          handleUpdateCabinetItem={handleUpdateCabinetItem}
          cabinetAddQuery={cabinetAddQuery}
          cabinetAddResults={cabinetAddResults}
          isCabinetAddSearching={isCabinetAddSearching}
          handleCabinetAddSearch={handleCabinetAddSearch}
          showCabinet3D={showCabinet3D}
          setShowCabinet3D={setShowCabinet3D}
          showManualAddModal={showManualAddModal}
          setShowManualAddModal={setShowManualAddModal}
          manualAddForm={manualAddForm}
          setManualAddForm={setManualAddForm}
          saveAllProfiles={saveAllProfiles}
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
        results?.isEmergencyCard ? (
          <EmergencyCardResultView results={results} onReset={reset} t={t} />
        ) : results?.isPrescription ? (
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
            profile={activeProfile}
          />
        )
      )}
      {view === VIEWS.ERROR   && <ErrorView error={error} onReset={reset} t={t} />}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleChange} style={{ display: 'none' }} />
      <input ref={uploadRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
    </div>
  )
}

function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 10, background: '#fff', overflow: 'hidden', marginBottom: 8, boxShadow: 'var(--shadow)' }}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          padding: '10px 12px',
          fontSize: '12.5px',
          fontWeight: 700,
          color: 'var(--navy)',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span>{question}</span>
        <span style={{ fontSize: 10, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {isOpen && (
        <div style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--textmd)', borderTop: '1.5px solid var(--border)', background: 'var(--bgsoft)', lineHeight: 1.5 }}>
          {answer}
        </div>
      )}
    </div>
  );
}

function EmergencyCardResultView({ results, onReset, t }) {
  const profile = results.emergencyProfile || {};
  return (
    <div style={{ padding: '20px', maxWidth: '480px', margin: '0 auto', animation: 'fadeUp 0.4s ease' }}>
      <div style={{
        background: 'linear-gradient(135deg, #E11D48 0%, #9F1239 100%)',
        color: '#fff',
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px',
        textAlign: 'center',
        boxShadow: 'var(--shadowmd)'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🚨</div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.05em', margin: 0 }}>EMERGENCY MEDICAL ID</h2>
        <p style={{ fontSize: '11px', opacity: 0.85, margin: '4px 0 0' }}>DECODED OFFLINE VIA AGADA SECURE SCANNER</p>
      </div>

      <div style={{
        background: '#fff',
        border: '1.5px solid var(--border)',
        borderTop: 'none',
        borderRadius: '0 0 20px 20px',
        padding: '20px',
        boxShadow: 'var(--shadowmd)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Patient Name */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', textAlign: 'left' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--textlt)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PATIENT NAME</span>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy)', marginTop: '2px' }}>{profile.name || 'Not Specified'}</div>
        </div>

        {/* Blood Group & Allergies */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', textAlign: 'left' }}>
          <div style={{ background: 'var(--bgsoft)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--textlt)', textTransform: 'uppercase' }}>BLOOD GROUP</span>
            <div>
              <span style={{
                background: 'var(--red)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '14px',
                display: 'inline-block'
              }}>{profile.bloodGroup || 'N/A'}</span>
            </div>
          </div>

          <div style={{ background: 'var(--bgsoft)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--textlt)', textTransform: 'uppercase' }}>ALLERGIES</span>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: profile.allergies && profile.allergies.toLowerCase() !== 'none' && profile.allergies.toLowerCase() !== 'none logged' ? 'var(--red)' : 'var(--textlt)'
            }}>{profile.allergies || 'None Logged'}</div>
          </div>
        </div>

        {/* Chronic Conditions */}
        <div style={{ background: 'var(--bgsoft)', borderRadius: '12px', padding: '14px', textAlign: 'left' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--textlt)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>CHRONIC CONDITIONS</span>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy)', lineHeight: 1.4 }}>{profile.chronicConditions || 'None Logged'}</div>
        </div>

        {/* Emergency Contact */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--textlt)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EMERGENCY CONTACT</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy)' }}>{profile.emergencyName || 'Not Specified'}</div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--green)', marginTop: '2px' }}>{profile.emergencyPhone || 'N/A'}</div>
            </div>
            {profile.emergencyPhone && (
              <a 
                href={`tel:${profile.emergencyPhone.replace(/\s+/g, '')}`} 
                style={{
                  background: 'var(--green)',
                  color: '#fff',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  boxShadow: 'var(--shadow)'
                }}
              >
                📞
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <button 
          onClick={onReset}
          style={{
            marginTop: '8px',
            width: '100%',
            height: '44px',
            background: 'var(--navy)',
            color: '#fff',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--shadow)'
          }}
        >
          🏥 Return to Scanner
        </button>
      </div>
    </div>
  );
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
  handleAddProfile, handleDeleteProfile,

  selectedCabinetIndex, setSelectedCabinetIndex,
  cabinetSearchResults, setCabinetSearchResults,
  isCabinetSearching, setIsCabinetSearching,
  selectedMed,
  cabDoseStrength, setCabDoseStrength,
  cabDoseFreq, setCabDoseFreq,
  cabScrubTime, setCabScrubTime,
  handleUpdateCabinetItem,
  cabinetAddQuery,
  cabinetAddResults,
  isCabinetAddSearching,
  handleCabinetAddSearch,
  showCabinet3D,
  setShowCabinet3D,
  showManualAddModal,
  setShowManualAddModal,
  manualAddForm,
  setManualAddForm,
  saveAllProfiles
}) {
  const [showPrivacySchool, setShowPrivacySchool] = useState(false)
  const [schoolTab, setSchoolTab] = useState('diary')

  const handleQuickAdd = async (medName, saltName) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const cab = p.cabinet || [];
        const isAlreadyIn = cab.some(item => item.brandName === medName && item.saltComposition === saltName);
        if (isAlreadyIn) return p;
        const nextCab = [...cab, {
          brandName: medName,
          saltComposition: saltName,
          pillCount: 30,
          notificationsEnabled: true,
          meta: {
            idealTime: 'Morning',
            foodRelation: 'With or without food',
            rationale: 'Quick-added from search suggestions.'
          }
        }];
        return { ...p, cabinet: nextCab };
      }
      return p;
    });
    await saveAllProfiles(updated);
    handleCabinetAddSearch('');
  };

  const handleUndoDose = async (log, lIdx) => {
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const nextCab = (p.cabinet || []).map(item => {
          if (item.brandName === log.medName) {
            return { ...item, pillCount: (item.pillCount || 0) + 1 };
          }
          return item;
        });
        const nextHistory = (p.doseHistory || []).filter((_, idx) => idx !== lIdx);
        return { ...p, cabinet: nextCab, doseHistory: nextHistory };
      }
      return p;
    });
    await saveAllProfiles(updated);
  };

  const handleManualAddSubmit = async (e) => {
    e.preventDefault();
    if (!manualAddForm.brandName || !manualAddForm.saltComposition) {
      alert("Please fill in both the Medicine Name and Salt Composition.");
      return;
    }
    const newItem = {
      brandName: manualAddForm.brandName.trim(),
      saltComposition: manualAddForm.saltComposition.trim(),
      strength: parseInt(manualAddForm.strength) || 500,
      strengthUnit: manualAddForm.strengthUnit || 'mg',
      form: manualAddForm.form || 'Tablet',
      frequency: parseInt(manualAddForm.frequency) || 3,
      pillCount: parseInt(manualAddForm.pillCount) || 30,
      notificationsEnabled: true,
      expiryDate: manualAddForm.expiryDate || '',
      mfgDate: manualAddForm.mfgDate || '',
      batchNumber: manualAddForm.batchNumber.trim() || '',
      productType: manualAddForm.form === 'Syrup' || manualAddForm.form === 'Drops' ? 'ALLOPATHIC' : (manualAddForm.brandName.toLowerCase().includes('ayur') ? 'AYURVEDIC' : 'ALLOPATHIC'),
      meta: {
        idealTime: manualAddForm.idealTime,
        foodRelation: manualAddForm.foodRelation,
        rationale: 'Manually added dosage schedule.'
      }
    };
    
    const updated = profiles.map(p => {
      if (p.id === activeProfileId) {
        const cab = p.cabinet || [];
        return { ...p, cabinet: [...cab, newItem] };
      }
      return p;
    });
    
    await saveAllProfiles(updated);
    setShowManualAddModal(false);
    setManualAddForm({
      brandName: '',
      saltComposition: '',
      strength: 500,
      strengthUnit: 'mg',
      form: 'Tablet',
      pillCount: 30,
      mfgDate: '',
      expiryDate: '',
      batchNumber: '',
      idealTime: 'Morning',
      foodRelation: 'With or without food',
      frequency: 3
    });
  };
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={wasmEnabled} onChange={e => setWasmEnabled(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--green)' }} />
              📸 Smart Camera Enhancer
            </label>
            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--greenlt)', color: 'var(--green)' }}>WASM (LOCAL)</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--textlt)', paddingLeft: 22, lineHeight: 1.4 }}>
            Runs image filters directly on your device to clean up blurry medicine labels. Your photos are never uploaded or sent to the cloud.
          </div>
          {wasmEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 22, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--textlt)', fontWeight: 600 }}>Filter Mode:</span>
              <select value={wasmFilter} onChange={e => setWasmFilter(parseInt(e.target.value))} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--navy)', background: '#fff', fontWeight: 600 }}>
                <option value={1}>Adaptive Binarization</option>
                <option value={2}>Sobel Edge Detection</option>
                <option value={3}>Contrast Stretching</option>
              </select>
            </div>
          )}
        </div>
        
        {/* Async Stream Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={useAsyncQueue} onChange={e => setUseAsyncQueue(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--green)' }} />
              ⚡ Fast Analysis Mode
            </label>
            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--safflt)', color: 'var(--saffron)' }}>ASYNC STREAM</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--textlt)', paddingLeft: 22, lineHeight: 1.4 }}>
            Streams medicine scans in the background so you can continue scanning without freeze screens or lag.
          </div>
        </div>

        {/* ZK Vault Toggle / Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔒 Private Local Lock (PIN)
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: vaultPin ? 'var(--greenlt)' : 'var(--bgsoft)', color: vaultPin ? 'var(--green)' : 'var(--textlt)' }}>
              {vaultPin ? 'SECURED (AES-256)' : 'UNLOCKED (PLAIN)'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--textlt)', paddingLeft: 22, lineHeight: 1.4 }}>
            Scrambles your saved medicine history under military-grade math encryption. Access it only using your 4-digit PIN.
          </div>

          <div style={{ paddingLeft: 22, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {!vaultPin ? (
              <button onClick={() => setShowPinSetup(true)} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, background: 'var(--greenlt)', color: 'var(--green)', fontWeight: 700 }}>
                🔑 Setup Lock PIN
              </button>
            ) : (
              <>
                <button onClick={() => { setIsVaultLocked(true); setBookmarks([]) }} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, background: 'var(--bgsoft)', color: 'var(--navy)', fontWeight: 700 }}>
                  🔒 Lock History Now
                </button>
                <button onClick={handleDisableEncryption} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, background: 'var(--redlt)', color: 'var(--red)', fontWeight: 700 }}>
                  🔓 Remove PIN Lock
                </button>
              </>
            )}
          </div>

          {showPinSetup && (
            <div style={{ margin: '8px 0 0 22px', padding: '10px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--bgsoft)', display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeIn 0.25s' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--navy)' }}>Create a 4-Digit Security PIN:</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="password" maxLength={4} pattern="\d*" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,''))} placeholder="1234" style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--bordermd)', fontSize: 12, textAlign: 'center', letterSpacing: '0.2em' }} />
                <button onClick={() => handleSetupPin(newPin)} style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 6, background: 'var(--green)', color: '#fff', fontWeight: 700 }}>Save</button>
                <button onClick={() => { setShowPinSetup(false); setNewPin(''); setPinError('') }} style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 6, background: '#fff', border: '1px solid var(--border)', color: 'var(--textlt)' }}>Cancel</button>
              </div>
              {pinError && <div style={{ fontSize: 10.5, color: 'var(--red)', fontWeight: 700 }}>{pinError}</div>}
            </div>
          )}
        </div>

        {/* Interactive Privacy & Security Guide (Privacy School) */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
          <button 
            type="button"
            onClick={() => setShowPrivacySchool(!showPrivacySchool)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--greenlt)',
              border: '1.5px solid rgba(13,138,104,0.15)',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 800,
              color: 'var(--greendk)'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🏫 Privacy & Security School</span>
            <span>{showPrivacySchool ? '▲ Hide Guide' : '▼ Learn How It Works'}</span>
          </button>
          
          {showPrivacySchool && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, animation: 'fadeIn 0.3s ease' }}>
              <style>{`
                .scene-container {
                  position: relative;
                  width: 140px;
                  height: 140px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  perspective: 600px;
                  background: radial-gradient(circle at center, rgba(13,138,104,0.12) 0%, transparent 70%);
                  border-radius: 12px;
                  overflow: hidden;
                  border: 1px solid rgba(13,138,104,0.1);
                  box-shadow: inset 0 0 10px rgba(13,138,104,0.05);
                }
                .diary-scene {
                  position: relative;
                  width: 120px;
                  height: 120px;
                  transform-style: preserve-3d;
                  transform: rotateX(25deg) rotateY(-20deg);
                  animation: floatBook 4s ease-in-out infinite;
                }
                .pillow-3d {
                  position: absolute;
                  width: 90px;
                  height: 60px;
                  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
                  border-radius: 18px 18px 8px 8px;
                  box-shadow: inset 0 4px 8px rgba(255,255,255,0.7), 0 6px 12px rgba(0,0,0,0.12);
                  top: 35px;
                  left: 15px;
                  transform: translateZ(-15px);
                }
                .book-3d {
                  position: absolute;
                  width: 55px;
                  height: 75px;
                  background: linear-gradient(135deg, #0d8a68 0%, #085e46 100%);
                  border-radius: 4px 10px 10px 4px;
                  box-shadow: 2px 4px 10px rgba(0,0,0,0.25);
                  top: 25px;
                  left: 32px;
                  transform-style: preserve-3d;
                  transform: translateZ(5px) rotateZ(-12deg);
                  transition: transform 0.3s ease;
                }
                .book-3d:hover {
                  transform: translateZ(20px) rotateZ(-3deg) rotateX(-5deg);
                }
                .book-spine-3d {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 5px;
                  height: 100%;
                  background: #054030;
                  border-radius: 3px 0 0 3px;
                }
                .book-pages-3d {
                  position: absolute;
                  right: 2px;
                  top: 3px;
                  width: 6px;
                  height: calc(100% - 6px);
                  background: #f8fafc;
                  border-radius: 0 3px 3px 0;
                  box-shadow: inset -1px 0 2px rgba(0,0,0,0.15);
                }
                .book-bookmark-3d {
                  position: absolute;
                  bottom: -5px;
                  right: 15px;
                  width: 6px;
                  height: 12px;
                  background: #ef4444;
                  border-radius: 0 0 2px 2px;
                  transform: rotateZ(-4deg);
                }
                .vault-scene {
                  position: relative;
                  width: 120px;
                  height: 120px;
                  transform-style: preserve-3d;
                  transform: rotateX(15deg) rotateY(-15deg);
                  animation: floatSafe 4.5s ease-in-out infinite;
                }
                .safe-body-3d {
                  position: absolute;
                  width: 80px;
                  height: 80px;
                  background: linear-gradient(135deg, #475569 0%, #1e293b 100%);
                  border-radius: 10px;
                  box-shadow: inset 0 2px 4px rgba(255,255,255,0.15), 0 8px 16px rgba(0,0,0,0.25);
                  top: 20px;
                  left: 20px;
                  transform-style: preserve-3d;
                }
                .safe-door-3d {
                  position: absolute;
                  width: 70px;
                  height: 70px;
                  background: linear-gradient(135deg, #64748b 0%, #334155 100%);
                  border-radius: 6px;
                  top: 5px;
                  left: 5px;
                  box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                  transform: translateZ(6px);
                  transform-style: preserve-3d;
                }
                .safe-dial-3d {
                  position: absolute;
                  width: 36px;
                  height: 36px;
                  background: radial-gradient(circle at center, #cbd5e1 0%, #475569 80%, #0f172a 100%);
                  border-radius: 50%;
                  top: 17px;
                  left: 17px;
                  box-shadow: 0 2px 5px rgba(0,0,0,0.35);
                  transform: translateZ(10px);
                  transform-style: preserve-3d;
                  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
                  cursor: pointer;
                }
                .safe-dial-3d:hover {
                  transform: translateZ(14px) rotate(180deg);
                }
                .safe-dial-ticks-3d {
                  position: absolute;
                  width: 100%;
                  height: 100%;
                  border: 2px dashed rgba(255,255,255,0.3);
                  border-radius: 50%;
                  box-sizing: border-box;
                }
                .safe-dial-handle-3d {
                  position: absolute;
                  width: 3px;
                  height: 12px;
                  background: #e2e8f0;
                  top: 3px;
                  left: 16px;
                  border-radius: 1.5px;
                  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
                }
                .camera-scene {
                  position: relative;
                  width: 120px;
                  height: 120px;
                  transform-style: preserve-3d;
                  transform: rotateX(20deg) rotateY(-10deg);
                }
                .magnifier-lens-3d {
                  position: absolute;
                  width: 50px;
                  height: 50px;
                  border: 3.5px solid #94a3b8;
                  background: radial-gradient(circle at center, rgba(16,185,129,0.15) 0%, rgba(13,138,104,0.05) 50%, rgba(255,255,255,0.15) 100%);
                  border-radius: 50%;
                  top: 25px;
                  left: 25px;
                  box-shadow: inset 0 0 8px rgba(16,185,129,0.25), 0 6px 12px rgba(0,0,0,0.12);
                  transform-style: preserve-3d;
                  transform: translateZ(15px);
                  animation: hoverLens 3s ease-in-out infinite;
                  transition: transform 0.3s ease;
                }
                .magnifier-lens-3d:hover {
                  transform: translateZ(28px) scale(1.08);
                }
                .magnifier-handle-3d {
                  position: absolute;
                  width: 7px;
                  height: 30px;
                  background: linear-gradient(to right, #475569, #1e293b);
                  border-radius: 0 0 3px 3px;
                  top: 70px;
                  left: 47px;
                  transform: rotateZ(-45deg);
                  box-shadow: 1.5px 1.5px 4px rgba(0,0,0,0.2);
                }
                .laser-beam-3d {
                  position: absolute;
                  width: 42px;
                  height: 48px;
                  background: linear-gradient(to bottom, rgba(16,185,129,0.35) 0%, rgba(16,185,129,0) 100%);
                  clip-path: polygon(40% 0%, 60% 0%, 100% 100%, 0% 100%);
                  top: 50px;
                  left: 29px;
                  transform: translateZ(8px) rotateX(15deg);
                  animation: pulseBeam 1.5s ease-in-out infinite alternate;
                  pointer-events: none;
                }
                @keyframes floatBook {
                  0%, 100% { transform: rotateX(25deg) rotateY(-20deg) translateY(0); }
                  50% { transform: rotateX(20deg) rotateY(-15deg) translateY(-6px); }
                }
                @keyframes floatSafe {
                  0%, 100% { transform: rotateX(15deg) rotateY(-15deg) translateY(0); }
                  50% { transform: rotateX(18deg) rotateY(-10deg) translateY(-5px); }
                }
                @keyframes hoverLens {
                  0%, 100% { transform: translateZ(15px) translateY(0) rotateX(0); }
                  50% { transform: translateZ(22px) translateY(-5px) rotateX(-4deg); }
                }
                @keyframes pulseBeam {
                  0% { opacity: 0.25; transform: translateZ(8px) rotateX(15deg) scaleX(0.92); }
                  100% { opacity: 0.7; transform: translateZ(8px) rotateX(15deg) scaleX(1.08); }
                }
              `}</style>

              <div style={{ fontSize: 11.5, color: 'var(--greendk)', lineHeight: 1.5, background: 'var(--greenlt)', padding: 12, borderRadius: 8, fontWeight: 600 }}>
                🛡️ <strong>Agada runs 100% on your device:</strong> We never upload your search history, medical details, or medicine photos to any server. Your health stays private.
              </div>

              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                {[
                  { id: 'diary', label: '📓 Local Diary', sub: 'Data Location' },
                  { id: 'vault', label: '🔑 Secret Vault', sub: 'PIN Encryption' },
                  { id: 'camera', label: '🔍 Magnifying Glass', sub: 'On-Device Vision' }
                ].map(tab => {
                  const active = schoolTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSchoolTab(tab.id)}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: 8,
                        fontSize: '11px',
                        fontWeight: 700,
                        border: active ? '1.5px solid var(--green)' : '1.5px solid var(--border)',
                        background: active ? 'var(--greenlt)' : '#fff',
                        color: active ? 'var(--greendk)' : 'var(--textmd)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2
                      }}
                    >
                      <span style={{ fontSize: '11px' }}>{tab.label}</span>
                      <span style={{ fontSize: '9px', fontWeight: 500, opacity: 0.75 }}>{tab.sub}</span>
                    </button>
                  )
                })}
              </div>

              {/* Tab Content */}
              <div style={{ background: 'var(--bgsoft)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14 }}>
                {schoolTab === 'diary' && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--red)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>⚠️ THE RISK / THE DANGER</div>
                        <div style={{ fontSize: '12px', color: 'var(--navy)', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                          Most health apps send your scanned prescriptions, symptom logs, and medication searches to cloud databases, where they can be leaked, hacked, or sold to insurance companies.
                        </div>
                      </div>
                      
                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--green)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>📓 THE METAPHOR (HOW IT WORKS)</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--navy)', fontWeight: 800, marginTop: 2 }}>The Private Notebook Under Your Pillow</div>
                        <p style={{ fontSize: '11.5px', color: 'var(--textmd)', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
                          Think of Agada like writing in a physical paper diary and hiding it under your mattress. We do not have user accounts, profile registers, or database servers in the cloud. Your scans, family profiles, and alarm times remain strictly inside your phone.
                        </p>
                      </div>

                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>🔧 THE SCIENCE (150-HOUR TECH SPEC)</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--textmd)', marginTop: 4, lineHeight: 1.5 }}>
                          - <strong>Isolated Sandbox:</strong> Health records are stored locally using the browser's sandbox <code>localStorage</code> and <code>IndexedDB</code> key-value caches.<br />
                          - <strong>Zero-Server Architecture:</strong> The application is fully serverless. All search lookups run in a local off-thread Web Worker.<br />
                          - <strong>Permanent Shredding:</strong> Because there is no database server, deleting your browser cache or cookies permanently shreds and deletes your records.
                        </div>
                      </div>

                      <div style={{ marginTop: 4, padding: '8px 10px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>🟢 LIVE SECURITY AUDIT:</span>
                        <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>
                          Local Database active. Saved scans: {bookmarks ? bookmarks.length : 0} | Cabinet items: {cabinet ? cabinet.length : 0}
                        </span>
                      </div>
                    </div>

                    <div style={{ flex: '0 0 140px', display: 'flex', justifyContent: 'center', margin: '0 auto' }}>
                      <div className="scene-container">
                        <div className="diary-scene">
                          <div className="pillow-3d"></div>
                          <div className="book-3d">
                            <div className="book-spine-3d"></div>
                            <div className="book-pages-3d"></div>
                            <div className="book-bookmark-3d"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {schoolTab === 'vault' && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--red)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>⚠️ THE RISK / THE DANGER</div>
                        <div style={{ fontSize: '12px', color: 'var(--navy)', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                          If someone gains access to your unlocked phone, they can open this page and inspect all your confidential medical history, prescriptions, and symptoms.
                        </div>
                      </div>
                      
                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--green)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>🔑 THE METAPHOR (HOW IT WORKS)</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--navy)', fontWeight: 800, marginTop: 2 }}>The Secret Cipher Steel Safe</div>
                        <p style={{ fontSize: '11.5px', color: 'var(--textmd)', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
                          Setting a PIN puts your health history in an unbreakable digital safe. We scramble your saved list into random gibberish. Only typing your secret PIN unlocks and decrypts the data.
                        </p>
                      </div>

                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>🔧 THE SCIENCE (150-HOUR TECH SPEC)</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--textmd)', marginTop: 4, lineHeight: 1.5 }}>
                          - <strong>PBKDF2 Key Derivation:</strong> Your 4-digit PIN is stretched 100,000 times using a cryptographically secure 16-byte random salt and the HMAC-SHA-256 algorithm to generate a strong 256-bit key.<br />
                          - <strong>AES-GCM Authenticated Encryption:</strong> Data is encrypted client-side using the Web Crypto API's hardware-accelerated AES-GCM 256-bit cipher before storage.<br />
                          - <strong>Zero-Knowledge:</strong> The PIN is never saved. If lost, your key is permanently gone—no backdoor reset exists.
                        </div>
                      </div>

                      <div style={{ marginTop: 4, padding: '8px 10px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: vaultPin ? 'var(--green)' : 'var(--orange)' }}>
                          {vaultPin ? '🔒 VAULT ACTIVE:' : '🔓 UNSECURED:'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>
                          {vaultPin ? 'Your history is encrypted on-device with AES-256.' : 'No PIN lock is set. History is stored in plain text.'}
                        </span>
                      </div>
                    </div>

                    <div style={{ flex: '0 0 140px', display: 'flex', justifyContent: 'center', margin: '0 auto' }}>
                      <div className="scene-container">
                        <div className="vault-scene">
                          <div className="safe-body-3d">
                            <div className="safe-door-3d">
                              <div className="safe-dial-3d">
                                <div className="safe-dial-ticks-3d"></div>
                                <div className="safe-dial-handle-3d"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {schoolTab === 'camera' && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--red)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>⚠️ THE RISK / THE DANGER</div>
                        <div style={{ fontSize: '12px', color: 'var(--navy)', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                          Most photo-enhancing scanner apps upload your raw photos and video streams to cloud server farms for pre-processing, exposing your camera feed.
                        </div>
                      </div>
                      
                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--green)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>🔍 THE METAPHOR (HOW IT WORKS)</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--navy)', fontWeight: 800, marginTop: 2 }}>The Built-in Magnifying Glass</div>
                        <p style={{ fontSize: '11.5px', color: 'var(--textmd)', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
                          Instead of uploading photos, Agada runs a digital 'magnifying glass' directly inside your browser. It sharpens, cleans, and binarizes blurry medicine strips offline.
                        </p>
                      </div>

                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--blue)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>🔧 THE SCIENCE (150-HOUR TECH SPEC)</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--textmd)', marginTop: 4, lineHeight: 1.5 }}>
                          - <strong>WebAssembly (Wasm) Engine:</strong> Image filters are compiled to a binary file and loaded dynamically in the browser sandbox.<br />
                          - <strong>Real-time Computer Vision:</strong> Runs Adaptive Binarization (adaptive thresholding) and Sobel edge detection in a separate background Web Worker thread.<br />
                          - <strong>WebRTC Stream Analysis:</strong> Auto-capture is triggered only when the focus metric reaches a high threshold, filtering out blurry frames locally.
                        </div>
                      </div>

                      <div style={{ marginTop: 4, padding: '8px 10px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: wasmEnabled ? 'var(--green)' : 'var(--textlt)' }}>
                          {wasmEnabled ? '🟢 WASM ACTIVE:' : '⚪ WASM OFF:'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600 }}>
                          {wasmEnabled ? 'Camera frames pre-processed locally in WebAssembly.' : 'WASM enhancer is disabled. Using raw capture fallback.'}
                        </span>
                      </div>
                    </div>

                    <div style={{ flex: '0 0 140px', display: 'flex', justifyContent: 'center', margin: '0 auto' }}>
                      <div className="scene-container">
                        <div className="camera-scene">
                          <div className="laser-beam-3d"></div>
                          <div className="magnifier-lens-3d"></div>
                          <div className="magnifier-handle-3d"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
                      onClick={(e) => { e.stopPropagation(); toggleCabinetItem(b, e); }} 
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
            <button className={`btn-tab ${activeTab === 'cabinet' ? 'active' : ''}`} onClick={() => setActiveTab('cabinet')}>💊 Cabinet</button>
            <button className={`btn-tab ${activeTab === 'reminders' ? 'active' : ''}`} onClick={() => setActiveTab('reminders')}>⏰ Daily Schedule</button>
            <button className={`btn-tab ${activeTab === 'healthcard' ? 'active' : ''}`} onClick={() => setActiveTab('healthcard')}>📋 Medical ID</button>
            <button className={`btn-tab ${activeTab === 'symptoms' ? 'active' : ''}`} onClick={() => setActiveTab('symptoms')}>⚠️ Track Symptoms</button>
          </div>

          {/* TAB 1: Cabinet & Stock */}
          {activeTab === 'cabinet' && (
            <div>
              <style>{`
                .cabinet-3d-container {
                  perspective: 1200px;
                  background: #0f172a;
                  border-radius: 20px;
                  padding: 24px 24px 36px;
                  box-shadow: inset 0 4px 20px rgba(0,0,0,0.6), var(--shadowmd);
                  display: flex;
                  flex-direction: column;
                  gap: 44px;
                  border: 2px solid #334155;
                  margin-bottom: 24px;
                }
                .cabinet-shelf-3d {
                  position: relative;
                  height: 90px;
                  border-bottom: 8px solid #475569;
                  transform-style: preserve-3d;
                  transform: rotateX(20deg);
                  box-shadow: 0 10px 15px rgba(0,0,0,0.5);
                  display: flex;
                  align-items: flex-end;
                  justify-content: space-around;
                  padding-bottom: 2px;
                }
                .cabinet-shelf-ledge {
                  position: absolute;
                  bottom: -8px;
                  left: 0;
                  right: 0;
                  height: 8px;
                  background: #334155;
                  transform: rotateX(-90deg);
                  transform-origin: bottom;
                }
                .med-box-hoverable:hover {
                  transform: translate3d(0, -10px, 20px) rotateY(-10deg) !important;
                  box-shadow: -6px 12px 18px rgba(0,0,0,0.4) !important;
                }
                .slot-empty-dotted {
                  width: 65px;
                  height: 85px;
                  border: 2px dashed #475569;
                  border-radius: 6px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                  transition: all 0.2s;
                  background: rgba(255,255,255,0.02);
                }
                .slot-empty-dotted:hover {
                  border-color: #10b981;
                  background: rgba(16,185,129,0.05);
                  transform: scale(1.05);
                }
                .capsule-wrapper {
                  position: relative;
                  width: 50px;
                  height: 50px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .capsule-3d-split {
                  width: 12px;
                  height: 28px;
                  position: relative;
                  transform-style: preserve-3d;
                  transition: transform 0.4s ease;
                  cursor: pointer;
                  animation: rotateCapsule 5s linear infinite;
                }
                .capsule-wrapper:hover .capsule-3d-split {
                  animation-play-state: paused;
                }
                .capsule-wrapper:hover .capsule-half-top {
                  transform: translateY(-10px) rotateY(180deg);
                }
                .capsule-wrapper:hover .capsule-half-bottom {
                  transform: translateY(10px);
                }
                .capsule-particle {
                  position: absolute;
                  width: 5px;
                  height: 5px;
                  border-radius: 50%;
                  opacity: 0;
                  pointer-events: none;
                  background: #10b981;
                }
                .capsule-wrapper:hover .capsule-particle {
                  animation: floatParticle 1.5s ease-out infinite;
                }
                @keyframes rotateCapsule {
                  0% { transform: rotateX(20deg) rotateY(0deg); }
                  100% { transform: rotateX(20deg) rotateY(360deg); }
                }
                @keyframes floatParticle {
                  0% { transform: translateY(0) scale(0.5); opacity: 0; }
                  50% { opacity: 0.8; }
                  100% { transform: translateY(-30px) translateX(var(--px)); scale(1.2); opacity: 0; }
                }
                @keyframes pulseBorder {
                  0%, 100% { border-color: #ef4444; box-shadow: 0 0 5px rgba(239,68,68,0.2); }
                  50% { border-color: #f87171; box-shadow: 0 0 12px rgba(239,68,68,0.5); }
                }
                .danger-overdose-banner {
                  animation: pulseBorder 1.5s infinite;
                }
              `}</style>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h4 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  💊 {t.cabinetTitle || 'My Medicine Cabinet'}
                </h4>
                
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button 
                    onClick={() => setShowCabinet3D(!showCabinet3D)}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', background: showCabinet3D ? 'var(--navy)' : 'var(--bgsoft)', color: showCabinet3D ? '#fff' : 'var(--navy)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {showCabinet3D ? '📋 Switch to List View' : '🖥️ Switch to 3D Shelves'}
                  </button>
                  <button 
                    onClick={() => setShowManualAddModal(true)}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 10px rgba(13,138,104,0.15)' }}
                  >
                    ➕ Add Custom Medicine
                  </button>
                </div>
              </div>

              {/* Direct Cabinet Add Search Box */}
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={cabinetAddQuery}
                    onChange={(e) => handleCabinetAddSearch(e.target.value)}
                    placeholder="🔍 Search CDSCO/Jan Aushadhi database to add immediately..."
                    style={{ flex: 1, height: 42, padding: '0 12px', borderRadius: 10, border: '1.5px solid var(--bordermd)', fontSize: 13, color: 'var(--navy)', background: '#fff', outline: 'none' }}
                  />
                  {cabinetAddQuery && (
                    <button 
                      onClick={() => handleCabinetAddSearch('')} 
                      style={{ padding: '0 12px', background: 'var(--bgsoft)', color: 'var(--textmd)', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 12, cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {cabinetAddQuery && (
                  <div style={{ position: 'absolute', top: '46px', left: 0, right: 0, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, maxHeight: 220, overflowY: 'auto', padding: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.08)', zIndex: 10 }}>
                    {isCabinetAddSearching ? (
                      <div style={{ fontSize: 12, color: 'var(--textlt)', padding: '12px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                        Querying database indexes...
                      </div>
                    ) : (!cabinetAddResults || (cabinetAddResults.cdsco.length === 0 && cabinetAddResults.ja.length === 0)) ? (
                      <div style={{ fontSize: 12, color: 'var(--textlt)', padding: '12px 0', textAlign: 'center' }}>
                        No exact match. Click "Add Custom Medicine" to enter details manually.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {cabinetAddResults.cdsco.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 4px', borderBottom: '1px solid var(--border)', marginBottom: 4, textAlign: 'left' }}>
                              CDSCO Approved Salts
                            </div>
                            {cabinetAddResults.cdsco.slice(0, 3).map((res, rid) => (
                              <div key={rid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--bgsoft)', borderRadius: 8, marginBottom: 4 }}>
                                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{res.row['Drug Name']}</div>
                                  <div style={{ fontSize: 10, color: 'var(--textlt)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Composition: {res.row['Drug Name']} | Indication: {res.row['Indication'] || 'Maintenance'}</div>
                                </div>
                                <button 
                                  onClick={() => handleQuickAdd(res.row['Drug Name'], res.row['Drug Name'])} 
                                  style={{ fontSize: 11, fontWeight: 800, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                                >
                                  ➕ Add
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {cabinetAddResults.ja.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 4px', borderBottom: '1px solid var(--border)', marginBottom: 4, marginTop: 4, textAlign: 'left' }}>
                              Jan Aushadhi Generics
                            </div>
                            {cabinetAddResults.ja.slice(0, 3).map((res, rid) => (
                              <div key={rid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--safflt)', borderRadius: 8, marginBottom: 4 }}>
                                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{res.row['Generic Name']}</div>
                                  <div style={{ fontSize: 10.5, color: 'var(--textlt)' }}>Govt Generic | MRP: ₹{res.row['MRP']} ({res.row['Unit Size']})</div>
                                </div>
                                <button 
                                  onClick={() => handleQuickAdd(res.row['Generic Name'], res.row['Generic Name'])} 
                                  style={{ fontSize: 11, fontWeight: 800, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                                >
                                  ➕ Add
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {cabinet.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {showCabinet3D ? (
                    <div className="cabinet-3d-container">
                      <div className="cabinet-shelf-3d">
                        <div className="cabinet-shelf-ledge"></div>
                        <div className="slot-empty-dotted" onClick={() => setShowManualAddModal(true)}>
                          <span style={{ fontSize: 24, color: '#10b981' }}>➕</span>
                        </div>
                        <div className="slot-empty-dotted" onClick={() => setShowManualAddModal(true)}>
                          <span style={{ fontSize: 24, color: '#10b981' }}>➕</span>
                        </div>
                        <div className="slot-empty-dotted" onClick={() => setShowManualAddModal(true)}>
                          <span style={{ fontSize: 24, color: '#10b981' }}>➕</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <p style={{ fontSize: 13, color: 'var(--textlt)', margin: 0, lineHeight: 1.6, textAlign: 'left' }}>
                    Your medicine cabinet is empty. Use the quick search above or click "+ Add Custom Medicine" to populate your cabinet inventory immediately.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 20, flexDirection: 'row', flexWrap: 'wrap', width: '100%', alignItems: 'flex-start' }}>
                  
                  {/* Left Column: Inventory List or 3D shelves grid */}
                  <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    
                    {showCabinet3D ? (
                      /* 3D Shelves View */
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--textlt)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'left' }}>
                          🖥️ Virtual Cabinet Shelves
                        </div>
                        
                        <div className="cabinet-3d-container">
                          {(() => {
                            const itemsPerShelf = 3;
                            const numShelves = Math.max(1, Math.ceil(cabinet.length / itemsPerShelf));
                            const shelvesRows = [];
                            for (let i = 0; i < numShelves; i++) {
                              shelvesRows.push(cabinet.slice(i * itemsPerShelf, (i + 1) * itemsPerShelf));
                            }
                            
                            return shelvesRows.map((shelfItems, sIdx) => (
                              <div key={sIdx} className="cabinet-shelf-3d">
                                <div className="cabinet-shelf-ledge"></div>
                                {shelfItems.map((item, idx) => {
                                  const realIdx = sIdx * itemsPerShelf + idx;
                                  const maxPills = 30;
                                  const stockPct = Math.min(100, Math.max(0, ((item.pillCount || 0) / maxPills) * 100));
                                  const isLowStock = (item.pillCount || 0) <= 5;
                                  const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                                  const isSelected = selectedCabinetIndex === realIdx;
                                  
                                  const saltLower = (item.saltComposition || '').toLowerCase();
                                  const isAntibiotic = saltLower.includes('amoxicillin') || saltLower.includes('penicillin') || saltLower.includes('cef') || saltLower.includes('cipro');
                                  const isPainKiller = saltLower.includes('paracetamol') || saltLower.includes('ibuprofen') || saltLower.includes('diclofenac') || saltLower.includes('naproxen');
                                  const isAyurvedic = item.productType === 'AYURVEDIC';
                                  const isSupplement = item.productType === 'SUPPLEMENT';
                                  let boxGradient = 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
                                  if (isAyurvedic || isSupplement) {
                                    boxGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                                  } else if (isAntibiotic) {
                                    boxGradient = 'linear-gradient(135deg, #ef4444 0%, #3b82f6 100%)';
                                  } else if (isPainKiller) {
                                    boxGradient = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)';
                                  }

                                  return (
                                    <div 
                                      key={idx} 
                                      onClick={() => setSelectedCabinetIndex(realIdx)}
                                      className="med-box-hoverable"
                                      style={{
                                        width: '65px',
                                        height: '85px',
                                        background: boxGradient,
                                        borderRadius: '6px',
                                        position: 'relative',
                                        transformStyle: 'preserve-3d',
                                        transform: isSelected ? 'translate3d(0, -12px, 30px) rotateY(-15deg)' : 'translate3d(0, 0, 5px) rotateY(-5deg)',
                                        transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                        cursor: 'pointer',
                                        boxShadow: isSelected ? '0 15px 25px rgba(0,0,0,0.5), 0 0 10px rgba(16,185,129,0.6)' : '-4px 4px 8px rgba(0,0,0,0.3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        padding: '8px',
                                        color: '#fff',
                                        border: isSelected ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.25)',
                                        boxSizing: 'border-box'
                                      }}
                                      title={`${item.brandName} - ${item.saltComposition} (${item.pillCount} pills)`}
                                    >
                                      {/* skew 3D edge */}
                                      <div style={{ position: 'absolute', top: 0, right: '-6px', width: '6px', height: '100%', background: 'rgba(0,0,0,0.2)', transform: 'skewY(45deg)', transformOrigin: 'left' }} />
                                      
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '12px' }}>
                                          {isAyurvedic || isSupplement ? '🌿' : isAntibiotic ? '🧬' : isPainKiller ? '⚡' : '💊'}
                                        </span>
                                        {isLowStock && <span style={{ fontSize: '9px', color: '#fca5a5', animation: 'pulse 1.5s infinite' }}>⚠️</span>}
                                        {isExpired && <span style={{ fontSize: '7px', background: '#ef4444', color: '#fff', padding: '1px 3px', borderRadius: 3, fontWeight: 900 }}>EXP</span>}
                                      </div>
                                      
                                      <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                                        <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                                          {item.brandName}
                                        </div>
                                        <div style={{ fontSize: '6.5px', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {item.saltComposition}
                                        </div>
                                      </div>

                                      <div style={{ height: '3.5px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
                                        <div style={{ height: '100%', width: `${stockPct}%`, background: isLowStock ? '#ef4444' : '#10b981' }} />
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                {/* Fill remainder slots to keep layout balanced */}
                                {shelfItems.length < itemsPerShelf && Array.from({ length: itemsPerShelf - shelfItems.length }).map((_, emptyIdx) => (
                                  <div key={`empty-${emptyIdx}`} className="slot-empty-dotted" onClick={() => setShowManualAddModal(true)}>
                                    <span style={{ fontSize: '20px', color: '#475569' }}>＋</span>
                                  </div>
                                ))}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    ) : (
                      /* Flat List View */
                      <>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--textlt)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, textAlign: 'left' }}>
                          Cabinet Inventory List ({cabinet.length})
                        </div>
                        {cabinet.map((item, idx) => {
                          const maxPills = 30;
                          const stockPct = Math.min(100, Math.max(0, ((item.pillCount || 0) / maxPills) * 100));
                          const isLowStock = (item.pillCount || 0) <= 5;
                          const barColor = isLowStock ? 'var(--red)' : 'var(--green)';
                          const isSelected = selectedCabinetIndex === idx;

                          return (
                            <div 
                              key={idx} 
                              onClick={() => setSelectedCabinetIndex(idx)}
                              style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: 8, 
                                padding: '14px 16px', 
                                background: isSelected ? 'rgba(13,138,104,0.04)' : 'var(--bgcard)', 
                                border: isSelected ? '2px solid var(--green)' : '1.5px solid var(--border)', 
                                borderRadius: 16,
                                boxShadow: isSelected ? '0 4px 12px rgba(13,138,104,0.1)' : 'var(--shadow)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.brandName}</span>
                                    {isSelected && <span style={{ fontSize: 9, background: 'var(--green)', color: '#fff', padding: '1px 5px', borderRadius: 10, fontWeight: 800, flexShrink: 0 }}>ACTIVE</span>}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--textlt)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.saltComposition}</div>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCabinetItem(item, e);
                                  }} 
                                  style={{ 
                                    width: 24, 
                                    height: 24, 
                                    borderRadius: '50%', 
                                    background: 'var(--redlt)', 
                                    color: 'var(--red)', 
                                    fontWeight: 800, 
                                    fontSize: 13, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    border: 'none',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                  }}
                                >
                                  ×
                                </button>
                              </div>

                              {/* Visual stock progress meter */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 11.5, color: 'var(--textmd)', fontWeight: 700 }}>
                                    📦 Stock Level: {item.pillCount || 0} / {maxPills} pills
                                  </span>
                                  {isLowStock && (
                                    <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 800, animation: 'pulse 1.5s infinite' }}>
                                      ⚠️ Low Stock
                                    </span>
                                  )}
                                </div>
                                <div className="stock-bar-container" style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div className="stock-bar-fill" style={{ height: '100%', width: `${stockPct}%`, backgroundColor: barColor, transition: 'width 0.3s' }}></div>
                                </div>
                              </div>

                              {/* Dosing Actions and notifications */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px dashed var(--border)', paddingTop: 10, marginTop: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdatePillCount(item, -1);
                                    }} 
                                    title="Take 1 pill"
                                    style={{ 
                                      width: 28, 
                                      height: 28, 
                                      background: '#fff', 
                                      border: '1.5px solid var(--border)', 
                                      borderRadius: '50%', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center', 
                                      fontSize: 15, 
                                      fontWeight: 800, 
                                      cursor: 'pointer',
                                      boxShadow: 'var(--shadow)' 
                                    }}
                                  >
                                    -
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdatePillCount(item, 30);
                                    }} 
                                    style={{ 
                                      padding: '0 10px', 
                                      height: 28, 
                                      background: 'var(--bgsoft)', 
                                      border: '1.5px solid var(--border)', 
                                      borderRadius: 14, 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center', 
                                      fontSize: 11, 
                                      fontWeight: 700, 
                                      color: 'var(--navy)',
                                      cursor: 'pointer',
                                      boxShadow: 'var(--shadow)' 
                                    }}
                                  >
                                    +30 pills
                                  </button>
                                </div>

                                <label style={{ fontSize: 11.5, color: 'var(--textmd)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700 }} onClick={e => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    checked={!!item.notificationsEnabled} 
                                    onChange={() => handleToggleNotification(item)}
                                    style={{ accentColor: 'var(--green)', width: 14, height: 14 }} 
                                  />
                                  Reminders On
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Interaction Warning Sub-Panel */}
                    {cabinet.length >= 2 && (
                      <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {activeInteractions.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                              ⚠️ Dangerous Combinations Found:
                            </div>
                            {activeInteractions.map((col, idx) => (
                              <div key={idx} style={{ 
                                padding: '12px 14px', 
                                background: 'var(--redlt)', 
                                border: '1.5px solid #FECACA', 
                                borderLeft: '5px solid var(--red)',
                                borderRadius: 14,
                                boxShadow: 'var(--shadow)',
                                textAlign: 'left'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)' }}>{col.title}</span>
                                  <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: 'var(--red)', color: '#fff' }}>{col.severity}</span>
                                </div>
                                <div style={{ fontSize: 11.5, color: '#991B1B', fontWeight: 700, marginBottom: 6 }}>Clash: {col.saltA} + {col.saltB}</div>
                                <p style={{ fontSize: 12.5, color: '#7F1D1D', margin: 0, lineHeight: 1.5 }}>{col.explanation}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {activeDuplications.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--saffron)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                              ⚠️ Double Dosing Warning:
                            </div>
                            {activeDuplications.map((dup, idx) => (
                              <div key={idx} style={{ 
                                padding: '12px 14px', 
                                background: 'var(--safflt)', 
                                border: '1.5px solid #FCD34D', 
                                borderLeft: '5px solid var(--saffron)',
                                borderRadius: 14,
                                boxShadow: 'var(--shadow)',
                                textAlign: 'left'
                              }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 4 }}>
                                  {dup.title} ({dup.className})
                                </div>
                                <p style={{ fontSize: 12.5, color: '#78350F', margin: 0, lineHeight: 1.5 }}>{dup.explanation}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {activeInteractions.length === 0 && activeDuplications.length === 0 && (
                          <div style={{ 
                            padding: '12px 14px', 
                            background: 'var(--greenlt)', 
                            border: '1.5px solid #86EFAC', 
                            borderRadius: 14, 
                            fontSize: 13, 
                            color: 'var(--greendk)', 
                            fontWeight: 700, 
                            textAlign: 'center',
                            boxShadow: 'var(--shadow)'
                          }}>
                            ✅ Safe: No drug clashes or overlaps found in your cabinet.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Smart Cabinet Hub Details */}
                  {selectedMed && (() => {
                    const pkParams = getPKParameters(selectedMed.saltComposition || selectedMed.brandName);
                    
                    const saltLower = (selectedMed.saltComposition || '').toLowerCase();
                    const isAntibiotic = saltLower.includes('amoxicillin') || saltLower.includes('penicillin') || saltLower.includes('cef') || saltLower.includes('cipro');
                    const isPainKiller = saltLower.includes('paracetamol') || saltLower.includes('ibuprofen') || saltLower.includes('diclofenac') || saltLower.includes('naproxen');
                    const isAyurvedic = selectedMed.productType === 'AYURVEDIC';
                    const isSupplement = selectedMed.productType === 'SUPPLEMENT';
                    let capTopColor = '#f59e0b';
                    let capBottomColor = '#f8fafc';
                    if (isAyurvedic || isSupplement) {
                      capTopColor = '#10b981';
                    } else if (isAntibiotic) {
                      capTopColor = '#ef4444';
                      capBottomColor = '#3b82f6';
                    } else if (isPainKiller) {
                      capTopColor = '#ef4444';
                    }

                    const parsedDose = (() => {
                      const m = (selectedMed.saltComposition || '').match(/(\d+)\s*(mg|mcg|g)/i);
                      return m ? parseInt(m[1]) : 500;
                    })();

                    // Simulated PK data
                    const cabDoseTimes = cabDoseFreq === 1 ? [0] 
                                    : cabDoseFreq === 2 ? [0, 12] 
                                    : cabDoseFreq === 3 ? [0, 8, 16] 
                                    : [0, 6, 12, 18];
                    const cabPkData = pkParams ? simulatePharmacokinetics(
                      pkParams, 
                      cabDoseStrength, 
                      cabDoseTimes, 
                      activeProfile.weight || 70, 
                      activeProfile.height || 170, 
                      activeProfile.age || 30, 
                      activeProfile.gender || 'male', 
                      24
                    ) : [];
                    
                    const maxConc = pkParams ? Math.max(...cabPkData.map(d => d.conc), pkParams.minToxicConc * 1.2, 10) : 10;
                    const currentPoint = cabPkData.find(d => d.time === cabScrubTime) || cabPkData[0] || { time: 0, conc: 0 };
                    const currentConc = currentPoint.conc;

                    // Expiry check
                    const isExpired = selectedMed.expiryDate && new Date(selectedMed.expiryDate) < new Date();
                    const isExpiringSoon = selectedMed.expiryDate && !isExpired && (new Date(selectedMed.expiryDate) - new Date()) < (30 * 24 * 60 * 60 * 1000);

                    // Adherence Compliance Score
                    const ad = activeProfile.adherence || {};
                    let totalDoseSlotsLogged = 0;
                    let totalDaysWithLogs = 0;
                    Object.entries(ad).forEach(([dateStr, slotObj]) => {
                      const slots = Object.values(slotObj);
                      if (slots.some(v => v === true)) {
                        totalDaysWithLogs++;
                        totalDoseSlotsLogged += slots.filter(v => v === true).length;
                      }
                    });
                    const compliancePct = totalDaysWithLogs > 0 ? Math.min(100, Math.round((totalDoseSlotsLogged / (totalDaysWithLogs * 3)) * 100)) : 100;

                    const getX = (t) => 35 + (t / 24) * 290;
                    const getY = (c) => 15 + (1 - (c / maxConc)) * 140;

                    const pathD = cabPkData.length > 0 ? cabPkData.map((d, idx) => {
                      return `${idx === 0 ? 'M' : 'L'} ${getX(d.time)} ${getY(d.conc)}`;
                    }).join(' ') : '';
                    const areaD = pathD ? `${pathD} L ${getX(24)} ${getY(0)} L ${getX(0)} ${getY(0)} Z` : '';

                    // Adaptive safety result
                    const safetyResult = checkDosageSafety(
                      selectedMed.saltComposition || selectedMed.brandName,
                      cabDoseStrength,
                      cabDoseFreq,
                      activeProfile.weight || 70,
                      activeProfile.height || 170,
                      activeProfile.age || 30,
                      activeProfile.gender || 'male'
                    );

                    return (
                      <div style={{ 
                        flex: '2 2 400px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: 16, 
                        background: '#fff', 
                        border: '1.5px solid var(--border)', 
                        borderRadius: 18, 
                        padding: 20, 
                        boxShadow: 'var(--shadow)',
                        animation: 'fadeUp 0.3s ease'
                      }}>
                        
                        {/* Header Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                          <div style={{ textAlign: 'left' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--green)', background: 'var(--greenlt)', padding: '2px 8px', borderRadius: 8, letterSpacing: '0.04em' }}>🔬 SMART CABINET HUB</span>
                            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', margin: '4px 0 2px' }}>{selectedMed.brandName}</h3>
                            <div style={{ fontSize: 12.5, color: 'var(--textmd)', fontWeight: 600 }}>{selectedMed.saltComposition}</div>
                          </div>
                          
                          {/* 3D Interactive Splitting Capsule */}
                          <div className="capsule-wrapper" title="Hover to inspect active ingredients!">
                            <div className="capsule-3d-split">
                              <div className="capsule-half-top" style={{ position: 'absolute', top: 0, width: '100%', height: '50%', borderRadius: '6px 6px 0 0', border: '0.5px solid rgba(0,0,0,0.15)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4)', transition: 'all 0.3s ease', backgroundColor: capTopColor }}></div>
                              <div className="capsule-half-bottom" style={{ position: 'absolute', bottom: 0, width: '100%', height: '50%', borderRadius: '0 0 6px 6px', border: '0.5px solid rgba(0,0,0,0.15)', boxShadow: 'inset 0 -1px 2px rgba(255,255,255,0.4)', transition: 'all 0.3s ease', backgroundColor: capBottomColor }}></div>
                            </div>
                            
                            {/* Particles that float out on hover */}
                            {Array.from({ length: 6 }).map((_, pIdx) => {
                              const xOffset = -15 + Math.random() * 30;
                              return (
                                <div 
                                  key={pIdx} 
                                  className="capsule-particle" 
                                  style={{ 
                                    '--px': `${xOffset}px`, 
                                    animationDelay: `${pIdx * 0.25}s`,
                                    background: pIdx % 2 === 0 ? capTopColor : 'var(--green)'
                                  }} 
                                />
                              );
                            })}
                          </div>
                        </div>

                        {/* Expiry & Batch Tracker Section */}
                        <div style={{ background: 'var(--bgsoft)', borderRadius: 14, padding: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)', textAlign: 'left' }}>📦 Batch & Expiry Tracker</span>
                          
                          {isExpired && (
                            <div style={{ padding: '8px 10px', background: 'var(--redlt)', border: '1px solid #FCA5A5', color: 'var(--red)', borderRadius: 8, fontSize: 11.5, fontWeight: 700, textAlign: 'left' }}>
                              ❌ EXPIRED! Please dispose of this medication safely. Do not consume.
                            </div>
                          )}
                          {isExpiringSoon && (
                            <div style={{ padding: '8px 10px', background: 'var(--safflt)', border: '1px solid #FCD34D', color: '#92400E', borderRadius: 8, fontSize: 11.5, fontWeight: 700, textAlign: 'left' }}>
                              ⚠️ EXPIRING SOON: This medicine expires in less than 30 days!
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--textlt)' }}>BATCH NO.</label>
                              <input 
                                type="text" 
                                value={selectedMed.batchNumber || ''} 
                                onChange={e => handleUpdateCabinetItem(selectedMed, { batchNumber: e.target.value })}
                                placeholder="e.g. B2502"
                                style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, outline: 'none', background: '#fff' }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--textlt)' }}>MFG. DATE</label>
                              <input 
                                type="date" 
                                value={selectedMed.mfgDate || ''} 
                                onChange={e => handleUpdateCabinetItem(selectedMed, { mfgDate: e.target.value })}
                                style={{ height: 32, padding: '0 6px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 11, outline: 'none', background: '#fff' }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--textlt)' }}>EXP. DATE</label>
                              <input 
                                type="date" 
                                value={selectedMed.expiryDate || ''} 
                                onChange={e => handleUpdateCabinetItem(selectedMed, { expiryDate: e.target.value })}
                                style={{ height: 32, padding: '0 6px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 11, outline: 'none', background: '#fff' }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Adherence Intake Logger */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 800 }}>🎯 Medication Adherence Rate</div>
                              <div style={{ fontSize: 18, color: '#1e3a8a', fontWeight: 900, marginTop: 2 }}>{compliancePct}% compliance</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 800 }}>📦 Stock Level</div>
                              <div id="cabinet-stock-level" style={{ fontSize: 16, color: '#1e3a8a', fontWeight: 900, marginTop: 2 }}>Stock Level: {selectedMed.pillCount || 0} / 30 pills</div>
                            </div>
                          </div>
                          <button 
                            onClick={async () => {
                              const currentCount = selectedMed.pillCount || 0;
                              if (currentCount <= 0) {
                                alert("No pills left in stock! Please add pills before logging intake.");
                                return;
                              }
                              const nextCount = Math.max(0, currentCount - 1);
                              const dateStr = new Date().toDateString();
                              const now = new Date();
                              const hours = now.getHours();
                              let slot = 'Morning';
                              if (hours >= 12 && hours < 16) slot = 'Afternoon';
                              else if (hours >= 16 && hours < 21) slot = 'Evening';
                              else if (hours >= 21 || hours < 6) slot = 'Bedtime';

                              const nextHistory = [
                                {
                                  medName: selectedMed.brandName,
                                  saltName: selectedMed.saltComposition,
                                  timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                                  date: dateStr,
                                  slot: slot
                                },
                                ...(activeProfile.doseHistory || [])
                              ].slice(0, 50);

                              const updated = profiles.map(p => {
                                if (p.id === activeProfileId) {
                                  const nextCab = (p.cabinet || []).map(item => {
                                    if (item.brandName === selectedMed.brandName && item.saltComposition === selectedMed.saltComposition) {
                                      return { ...item, pillCount: nextCount };
                                    }
                                    return item;
                                  });
                                  const ad = p.adherence || {};
                                  const todayAd = ad[dateStr] || { Morning: false, Afternoon: false, Evening: false, Bedtime: false };
                                  const nextTodayAd = { ...todayAd, [slot]: true };
                                  return { 
                                    ...p, 
                                    cabinet: nextCab, 
                                    adherence: { ...ad, [dateStr]: nextTodayAd },
                                    doseHistory: nextHistory
                                  };
                                }
                                return p;
                              });
                              await saveAllProfiles(updated);
                            }}
                            style={{ 
                              padding: '10px 16px', 
                              background: '#2563eb', 
                              color: '#fff', 
                              borderRadius: 10, 
                              fontSize: 12.5, 
                              fontWeight: 800, 
                              border: 'none',
                              cursor: 'pointer',
                              boxShadow: '0 4px 10px rgba(37,99,235,0.2)'
                            }}
                          >
                            ✔️ Log Dose Taken
                          </button>
                        </div>

                        {/* Dosage Safety Warnings Panel */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>⚖️ Daily Safety Check</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: safetyResult.safe ? '#166534' : '#991b1b', background: safetyResult.safe ? '#dcfce7' : '#fef2f2', padding: '1px 8px', borderRadius: 10 }}>
                              {safetyResult.safe ? 'SAFE LIMIT' : 'LIMIT EXCEEDED'}
                            </span>
                          </div>
                          
                          {!safetyResult.safe ? (
                            <div className="danger-overdose-banner" style={{ background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 14, padding: '12px 14px', textAlign: 'left' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 16 }}>⚠️</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#991b1b' }}>DANGEROUS OVERDOSE WARNING</span>
                              </div>
                              <p style={{ fontSize: 12.5, color: '#b91c1c', margin: 0, lineHeight: 1.4, fontWeight: 600, textAlign: 'left' }}>
                                {safetyResult.reason}
                              </p>
                            </div>
                          ) : (
                            <div style={{ background: 'var(--greenlt)', border: '1px solid #a7d9ca', borderRadius: 14, padding: '10px 12px', fontSize: 12, color: 'var(--greendk)', fontWeight: 700, textAlign: 'left' }}>
                              ✅ {safetyResult.reason}
                            </div>
                          )}
                        </div>

                        {/* Adaptive Pharmacokinetics Graph */}
                        {pkParams && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>🩸 Active Bloodstream Simulation</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '1px 8px', borderRadius: 10 }}>ADAPTIVE PK</span>
                            </div>
                            
                            <div style={{ background: 'var(--bgsoft)', borderRadius: 14, padding: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
                              <svg width="100%" height="150" viewBox="0 0 340 150" style={{ maxWidth: 340 }}>
                                <defs>
                                  <linearGradient id="cab-curve-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0D8A68" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#0D8A68" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>

                                {/* Grid Lines & Ticks */}
                                {[0, 6, 12, 18, 24].map(t => (
                                  <g key={t}>
                                    <line x1={getX(t)} y1="15" x2={getX(t)} y2="125" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                                    <text x={getX(t)} y="140" fontSize="9" fill="var(--textlt)" textAnchor="middle">{t}h</text>
                                  </g>
                                ))}

                                {/* Therapeutic Band */}
                                {pkParams.minEffectiveConc < maxConc && (
                                  <rect
                                    x="35"
                                    y={getY(Math.min(maxConc, pkParams.minToxicConc))}
                                    width="290"
                                    height={Math.max(0, getY(pkParams.minEffectiveConc) - getY(Math.min(maxConc, pkParams.minToxicConc)))}
                                    fill="var(--greenlt)"
                                    opacity="0.95"
                                  />
                                )}

                                <line x1="35" y1={getY(pkParams.minEffectiveConc)} x2="325" y2={getY(pkParams.minEffectiveConc)} stroke="var(--amber)" strokeWidth="1" strokeDasharray="3,3" />
                                
                                {areaD && <path d={areaD} fill="url(#cab-curve-grad)" />}
                                {pathD && <path d={pathD} fill="none" stroke="#0d8a68" strokeWidth="2.5" />}

                                {/* Scrubber Indicator */}
                                <line x1={getX(cabScrubTime)} y1="15" x2={getX(cabScrubTime)} y2="125" stroke="#3b82f6" strokeWidth="1" strokeDasharray="2,2" />
                                <circle cx={getX(cabScrubTime)} cy={getY(currentConc)} r="4" fill="#3b82f6" stroke="#fff" strokeWidth="1" />

                                <line x1="35" y1="15" x2="35" y2="125" stroke="var(--border)" strokeWidth="1.2" />
                                <line x1="35" y1="125" x2="325" y2="125" stroke="var(--border)" strokeWidth="1.2" />
                              </svg>
                            </div>

                            {/* Scrubber Timeline */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#1e293b', padding: 12, borderRadius: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>🕒 SCRUB TIMELINE: {cabScrubTime.toFixed(1)}h</span>
                                <span style={{ fontSize: '11px', fontWeight: 900, color: currentConc > pkParams.minToxicConc ? '#ef4444' : currentConc > pkParams.minEffectiveConc ? '#10b981' : '#f59e0b' }}>
                                  {currentConc.toFixed(1)} mcg/mL
                                </span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="24" 
                                step="0.25" 
                                value={cabScrubTime} 
                                onChange={e => setCabScrubTime(parseFloat(e.target.value))} 
                                style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }} 
                              />
                            </div>

                            {/* Segmented Strength & Freq Controls */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--bgsoft)', padding: 10, borderRadius: 12, border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--navy)' }}>Strength:</label>
                                <select 
                                  value={cabDoseStrength}
                                  onChange={e => setCabDoseStrength(parseInt(e.target.value))}
                                  style={{ height: 26, fontSize: 11, fontWeight: 700, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--navy)' }}
                                >
                                  {[Math.round(parsedDose / 2), parsedDose, parsedDose * 2].filter(v => v > 0).map(v => (
                                    <option key={v} value={v}>{v}mg</option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--navy)' }}>Frequency:</label>
                                <select 
                                  value={cabDoseFreq}
                                  onChange={e => setCabDoseFreq(parseInt(e.target.value))}
                                  style={{ height: 26, fontSize: 11, fontWeight: 700, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--navy)' }}
                                >
                                  <option value="1">Once a day</option>
                                  <option value="2">2x a day</option>
                                  <option value="3">3x a day</option>
                                  <option value="4">4x a day</option>
                                </select>
                              </div>
                            </div>

                            {/* Clinical Bio-Parameter Info Box */}
                            <div style={{ background: '#f8fafc', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 12px', textAlign: 'left' }}>
                              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>📈 Scientific Dosing Parameters:</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 11, color: 'var(--textmd)' }}>
                                <div>• <strong>Half-life:</strong> {pkParams.halfLifeElimination} hrs (Ke: {(Math.log(2)/pkParams.halfLifeElimination).toFixed(2)})</div>
                                <div>• <strong>Volume of Distr. (Vd):</strong> {pkParams.vd} L/kg</div>
                                <div>• <strong>Bioavailability (F):</strong> {Math.round(pkParams.bioavailability * 100)}%</div>
                                <div>• <strong>Active Composition:</strong> {pkParams.partition === 'lipophilic' ? 'Lipophilic (Fat solubility)' : 'Hydrophilic (Water solubility)'}</div>
                              </div>
                            </div>

                          </div>
                        )}

                        {/* Jan Aushadhi Savings Finder */}
                        <div style={{ borderTop: '1.5px dashed var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>🏛 Jan Aushadhi generic equivalents</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'var(--greenlt)', padding: '1px 8px', borderRadius: 8 }}>SAVINGS FINDER</span>
                          </div>

                          {isCabinetSearching ? (
                            <div style={{ fontSize: 12, color: 'var(--textlt)', fontStyle: 'italic', padding: '6px 0', textAlign: 'left' }}>🔍 Searching local CDSCO & BPPI databases...</div>
                          ) : cabinetSearchResults && cabinetSearchResults.ja && cabinetSearchResults.ja.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {cabinetSearchResults.ja.slice(0, 2).map((jaMed, jIdx) => {
                                return (
                                  <div key={jIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--greenlt)', border: '1px solid #a7d9ca', borderRadius: 10, padding: '8px 12px' }}>
                                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{jaMed.row['Generic Name']}</div>
                                      <div style={{ fontSize: 10.5, color: '#166534', marginTop: 1 }}>Govt Price: ₹{jaMed.row['MRP']} ({jaMed.row['Unit Size']})</div>
                                    </div>
                                    <a 
                                      href="https://janaushadhi.gov.in/near-by-kendra" 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      style={{ fontSize: 11, fontWeight: 800, background: 'var(--green)', color: '#fff', textDecoration: 'none', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                      📍 Store
                                    </a>
                                  </div>
                                );
                              })}
                              
                              <div style={{ fontSize: 11, color: 'var(--textmd)', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 10px', lineHeight: 1.4, textAlign: 'left' }}>
                                💡 Tip: You can legally substitute {selectedMed.brandName} with these government-approved generics. Find nearest Kendra store link above.
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--textlt)', fontStyle: 'italic', textAlign: 'left' }}>
                              No generic alternatives found in the offline Jan Aushadhi catalog. Please ask your local pharmacist for equivalent options.
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })()}

                </div>
              )}

              {/* Recent Doses History Logs Timeline */}
              <div style={{ marginTop: 24, borderTop: '1.5px solid var(--border)', paddingTop: 16 }}>
                <h4 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                  ⏳ Recent Intake Logs ({activeProfile.doseHistory ? activeProfile.doseHistory.length : 0})
                </h4>
                
                {!activeProfile.doseHistory || activeProfile.doseHistory.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--textlt)', margin: 0, fontStyle: 'italic', textAlign: 'left' }}>
                    No intake logs recorded yet. Tap "Log Dose Taken" inside a cabinet medicine card to record.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
                    {activeProfile.doseHistory.map((log, lIdx) => (
                      <div key={lIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bgsoft)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
                        <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>
                            Logged 1 dose of {log.medName}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--textlt)', marginTop: 1 }}>
                            Slot: {log.slot} | {log.date} at {log.timestamp}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleUndoDose(log, lIdx)}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', background: 'var(--redlt)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                        >
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Add Medicine Modal dialog Overlay */}
              {showManualAddModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                  <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                      <h4 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>➕ Add Custom Medicine</h4>
                      <button onClick={() => setShowManualAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--textlt)' }}>×</button>
                    </div>
                    
                    <form onSubmit={handleManualAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>MEDICINE BRAND NAME *</label>
                        <input id="cabinet-brand-name" type="text" value={manualAddForm.brandName} onChange={e => setManualAddForm({...manualAddForm, brandName: e.target.value})} placeholder="e.g. Crocin, Lipitor" style={{ height: 38, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }} required />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>ACTIVE SALT COMPOSITION *</label>
                        <input id="cabinet-salt-composition" type="text" value={manualAddForm.saltComposition} onChange={e => setManualAddForm({...manualAddForm, saltComposition: e.target.value})} placeholder="e.g. Paracetamol, Atorvastatin" style={{ height: 38, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }} required />
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>STRENGTH VALUE</label>
                          <input id="cabinet-strength-value" type="number" value={manualAddForm.strength} onChange={e => setManualAddForm({...manualAddForm, strength: parseInt(e.target.value) || 0})} style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>UNIT</label>
                          <select id="cabinet-strength-unit" value={manualAddForm.strengthUnit} onChange={e => setManualAddForm({...manualAddForm, strengthUnit: e.target.value})} style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff' }}>
                            <option value="mg">mg</option>
                            <option value="mcg">mcg</option>
                            <option value="g">g</option>
                            <option value="ml">ml</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>FORM</label>
                          <select id="cabinet-form" value={manualAddForm.form} onChange={e => setManualAddForm({...manualAddForm, form: e.target.value})} style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff' }}>
                            <option value="Tablet">Tablet</option>
                            <option value="Capsule">Capsule</option>
                            <option value="Syrup">Syrup</option>
                            <option value="Drops">Drops</option>
                            <option value="Cream">Cream</option>
                            <option value="Injection">Injection</option>
                            <option value="Inhaler">Inhaler</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>INITIAL PILL COUNT</label>
                          <input id="cabinet-pill-count" type="number" value={manualAddForm.pillCount} onChange={e => setManualAddForm({...manualAddForm, pillCount: parseInt(e.target.value) || 0})} style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }} />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>MFG. DATE</label>
                          <input id="cabinet-mfg-date" type="date" value={manualAddForm.mfgDate} onChange={e => setManualAddForm({...manualAddForm, mfgDate: e.target.value})} style={{ height: 36, padding: '0 6px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>EXP. DATE</label>
                          <input id="cabinet-expiry-date" type="date" value={manualAddForm.expiryDate} onChange={e => setManualAddForm({...manualAddForm, expiryDate: e.target.value})} style={{ height: 36, padding: '0 6px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12 }} />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>BATCH NUMBER</label>
                          <input id="cabinet-batch-number" type="text" value={manualAddForm.batchNumber} onChange={e => setManualAddForm({...manualAddForm, batchNumber: e.target.value})} placeholder="e.g. B2502" style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>INTAKE RELATION</label>
                          <select id="cabinet-food-relation" value={manualAddForm.foodRelation} onChange={e => setManualAddForm({...manualAddForm, foodRelation: e.target.value})} style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff' }}>
                            <option value="Before food">Before food</option>
                            <option value="With food">With food</option>
                            <option value="After food">After food</option>
                            <option value="With or without food">With or without food</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>DAILY SLOT</label>
                          <select id="cabinet-ideal-time" value={manualAddForm.idealTime} onChange={e => setManualAddForm({...manualAddForm, idealTime: e.target.value})} style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff' }}>
                            <option value="Morning">Morning</option>
                            <option value="Afternoon">Afternoon</option>
                            <option value="Evening">Evening</option>
                            <option value="Bedtime">Bedtime</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--textlt)' }}>DAILY FREQ</label>
                          <select id="cabinet-frequency" value={manualAddForm.frequency} onChange={e => setManualAddForm({...manualAddForm, frequency: parseInt(e.target.value) || 1})} style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: '#fff' }}>
                            <option value="1">1x a day</option>
                            <option value="2">2x a day</option>
                            <option value="3">3x a day</option>
                            <option value="4">4x a day</option>
                          </select>
                        </div>
                      </div>

                      <button type="submit" style={{ height: 44, background: 'linear-gradient(135deg, var(--green), #0d9488)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8, boxShadow: '0 4px 12px rgba(13,138,104,0.2)' }}>
                        Save Medicine to Cabinet
                      </button>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: Alarms & Adherence */}
          {activeTab === 'reminders' && (
            <div>
              {/* Daily Reminder Time Pickers */}
              <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>⏰ Set Your Daily Pill Times</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {Object.entries(activeProfile.reminderTimes || { Morning: '08:00', Afternoon: '13:00', Evening: '18:00', Bedtime: '22:00' }).map(([slot, time]) => {
                  let slotLabel = slot;
                  let slotIcon = '🌅';
                  if (slot === 'Morning') { slotLabel = 'Morning'; slotIcon = '🌅'; }
                  if (slot === 'Afternoon') { slotLabel = 'Afternoon'; slotIcon = '☀️'; }
                  if (slot === 'Evening') { slotLabel = 'Evening'; slotIcon = '🌇'; }
                  if (slot === 'Bedtime') { slotLabel = 'Bedtime'; slotIcon = '🌙'; }

                  return (
                    <div key={slot} style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 4, 
                      background: 'var(--bgcard)', 
                      border: '1.5px solid var(--border)',
                      padding: '10px 12px', 
                      borderRadius: 14,
                      boxShadow: 'var(--shadow)'
                    }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--textlt)' }}>{slotIcon} {slotLabel}</span>
                      <input 
                        type="time" 
                        value={time} 
                        onChange={(e) => handleUpdateReminderTime(slot, e.target.value)} 
                        style={{ 
                          fontSize: 13, 
                          padding: '6px 8px', 
                          border: '1.5px solid var(--border)', 
                          borderRadius: 8, 
                          background: '#fff', 
                          width: '100%', 
                          outline: 'none',
                          color: 'var(--navy)',
                          fontWeight: 600
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Daily Adherence Grid */}
              <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>✅ Check Off Taken Pills</h4>
              {(() => {
                const dateStr = new Date().toDateString();
                const ad = activeProfile.adherence || {};
                const todayAd = ad[dateStr] || { Morning: false, Afternoon: false, Evening: false, Bedtime: false };
                
                // Check if all scheduled slots are done
                const activeSlots = ['Morning', 'Afternoon', 'Evening', 'Bedtime'];
                const completedAll = activeSlots.every(slot => !!todayAd[slot]);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--greenlt)', border: '1.5px solid #86EFAC', padding: 14, borderRadius: 16, marginBottom: 16, boxShadow: 'var(--shadow)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--greendk)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Did you take your medicine today?</span>
                      <span style={{ opacity: 0.8 }}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>

                    {completedAll ? (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: 8, 
                        background: '#fff', 
                        border: '1.5px solid var(--green)', 
                        padding: '10px 14px', 
                        borderRadius: 12, 
                        color: 'var(--greendk)', 
                        fontWeight: 800, 
                        fontSize: 13,
                        textAlign: 'center',
                        animation: 'popIn 0.3s ease'
                      }}>
                        <span>🎉</span> All done for today! Great job taking your meds.
                      </div>
                    ) : null}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {activeSlots.map(slot => {
                        const isChecked = !!todayAd[slot];
                        let slotIcon = '🌅';
                        if (slot === 'Afternoon') slotIcon = '☀️';
                        if (slot === 'Evening') slotIcon = '🌇';
                        if (slot === 'Bedtime') slotIcon = '🌙';

                        return (
                          <button 
                            key={slot}
                            onClick={() => handleToggleAdherence(dateStr, slot)}
                            style={{
                              padding: '10px 4px',
                              borderRadius: 12,
                              border: `1.5px solid ${isChecked ? 'var(--green)' : 'var(--border)'}`,
                              background: isChecked ? 'var(--green)' : '#fff',
                              color: isChecked ? '#fff' : 'var(--textmd)',
                              fontSize: 11.5,
                              fontWeight: 700,
                              textAlign: 'center',
                              transition: 'all 0.2s',
                              cursor: 'pointer',
                              boxShadow: 'var(--shadow)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2
                            }}
                          >
                            <span style={{ fontSize: 16 }}>{slotIcon}</span>
                            <span>{isChecked ? '✓' : ''} {slot}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Chronotherapy Daily Schedule Timeline */}
              {activeSchedule && activeSchedule.schedule && (
                <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    📅 Your Pill Schedule for Today:
                  </div>
                  
                  {activeSchedule.notes && activeSchedule.notes.map((note, nidx) => (
                    <div key={nidx} style={{ 
                      padding: '10px 14px', 
                      background: 'var(--safflt)', 
                      border: '1px solid #FCD34D', 
                      borderRadius: 12, 
                      fontSize: 12.5, 
                      color: '#92400E', 
                      marginBottom: 12, 
                      fontWeight: 700, 
                      lineHeight: 1.5,
                      boxShadow: 'var(--shadow)'
                    }}>
                      💡 {note.message}
                    </div>
                  ))}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', paddingLeft: 16 }}>
                    <div style={{ position: 'absolute', left: 4, top: 8, bottom: 8, width: 3, background: 'linear-gradient(180deg, var(--green) 0%, var(--saffron) 50%, var(--navy) 100%)', borderRadius: 2 }} />
                    
                    {Object.entries(activeSchedule.schedule).map(([timeOfDay, meds]) => {
                      let icon = '🌅';
                      let bulletColor = 'var(--green)';
                      if (timeOfDay === 'Morning') { icon = '🌅 Morning'; bulletColor = 'var(--green)'; }
                      if (timeOfDay === 'Afternoon') { icon = '☀️ Afternoon'; bulletColor = 'var(--saffron)'; }
                      if (timeOfDay === 'Evening') { icon = '🌇 Evening'; bulletColor = 'var(--saffron)'; }
                      if (timeOfDay === 'Bedtime') { icon = '🌙 Bedtime'; bulletColor = 'var(--navy)'; }

                      return (
                        <div key={timeOfDay} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ 
                            position: 'absolute', 
                            left: -20, 
                            top: 4, 
                            width: 11, 
                            height: 11, 
                            borderRadius: '50%', 
                            background: bulletColor, 
                            border: '2.5px solid #fff', 
                            boxShadow: '0 0 0 1.5px ' + bulletColor 
                          }} />
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>{icon}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'var(--bgsoft)', color: 'var(--textmd)' }}>
                              {meds.length} {meds.length === 1 ? 'med' : 'meds'}
                            </span>
                          </div>

                          {meds.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--textlt)', paddingLeft: 4, fontStyle: 'italic' }}>
                              No medicines scheduled.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                              {meds.map((med, midx) => {
                                let friendlyFood = med.foodRelation;
                                if (med.foodRelation.includes('Empty')) friendlyFood = '🍽️ Take on empty stomach';
                                if (med.foodRelation.includes('After')) friendlyFood = '🍲 Take after eating';

                                return (
                                  <div key={midx} style={{ 
                                    padding: '10px 12px', 
                                    background: 'var(--bgcard)', 
                                    border: '1.5px solid var(--border)', 
                                    borderRadius: 12,
                                    boxShadow: 'var(--shadow)'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>{med.brandName}</span>
                                      <span style={{ fontSize: 10, fontWeight: 800, color: med.foodRelation.includes('Empty') ? 'var(--red)' : 'var(--green)', background: med.foodRelation.includes('Empty') ? 'var(--redlt)' : 'var(--greenlt)', padding: '2px 8px', borderRadius: 6 }}>
                                        {friendlyFood}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 11.5, color: 'var(--textlt)', marginTop: 2 }}>{med.saltComposition}</div>
                                    <div style={{ fontSize: 12, color: 'var(--textmd)', marginTop: 6, borderTop: '1px dashed var(--border)', paddingTop: 6, fontStyle: 'italic', lineHeight: 1.45 }}>
                                      💡 {med.rationale}
                                    </div>
                                  </div>
                                );
                              })}
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
              <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 10 }}>⚠️ Track How You Feel (Side Effects)</h4>
              
              {/* Symptom logger input form */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input 
                  type="text" 
                  value={symptomInput} 
                  onChange={e => setSymptomInput(e.target.value)} 
                  placeholder="e.g. Headache, feeling dizzy, stomach pain..." 
                  style={{ 
                    flex: 1, 
                    height: 44, 
                    padding: '0 12px', 
                    borderRadius: 10, 
                    border: '1.5px solid var(--border)', 
                    fontSize: 13.5,
                    outline: 'none',
                    color: 'var(--navy)'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--green)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                  onKeyDown={e => { if (e.key === 'Enter') handleLogSymptom(symptomInput) }}
                />
                <button 
                  onClick={() => handleLogSymptom(symptomInput)} 
                  style={{ 
                    padding: '0 16px', 
                    background: 'var(--green)', 
                    color: '#fff', 
                    borderRadius: 10, 
                    fontSize: 13.5, 
                    fontWeight: 700, 
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow)' 
                  }}
                >
                  ➕ Add
                </button>
              </div>

              {/* Flagged ADR Side-effect alert warnings */}
              {(() => {
                const cabSalts = cabinet.map(c => c.saltComposition);
                const symTexts = (activeProfile.symptoms || []).map(s => s.text);
                const warnings = flagPotentialSideEffects(cabSalts, symTexts);

                if (warnings.length > 0) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        🚨 Warnings: A pill you take might be causing this!
                      </div>
                      {warnings.map((w, idx) => (
                        <div key={idx} style={{ 
                          padding: '12px 14px', 
                          background: 'var(--redlt)', 
                          border: '1.5px solid #FECACA', 
                          borderLeft: '5px solid var(--red)',
                          borderRadius: 14, 
                          fontSize: 13, 
                          color: '#991B1B', 
                          fontWeight: 600, 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: 4,
                          boxShadow: 'var(--shadow)'
                        }}>
                          <div>{w.explanation}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--textmd)', fontStyle: 'italic', marginTop: 4, borderTop: '1px dashed rgba(225,29,72,0.15)', paddingTop: 4 }}>
                            💡 Your medicine with <strong>{w.salt}</strong> can cause <strong>{w.symptom}</strong>. We recommend talking to your doctor or pharmacist.
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Symptoms history log */}
              <h5 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>📋 My Logged Symptoms</h5>
              {(!activeProfile.symptoms || activeProfile.symptoms.length === 0) ? (
                <p style={{ fontSize: 12.5, color: 'var(--textlt)', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>
                  No symptoms logged. Type how you are feeling above to check if any of your medicines are causing it.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {activeProfile.symptoms.map((s, sidx) => (
                    <div key={sidx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      background: 'var(--bgsoft)', 
                      padding: '8px 12px', 
                      borderRadius: 10, 
                      fontSize: 13,
                      boxShadow: 'var(--shadow)'
                    }}>
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{s.text}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--textlt)', marginLeft: 8 }}>({s.date})</span>
                      </div>
                      <button onClick={() => handleDeleteSymptom(sidx)} style={{ color: 'var(--red)', fontSize: 14, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer' }}>🗑️</button>
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
