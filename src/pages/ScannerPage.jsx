/**
 * ScannerPage.jsx
 * 
 * The core product page of Agada. Contains the full scan-to-results flow.
 * 
 * States:
 *   idle        → Scan button shown
 *   capturing   → Camera open (mobile) or file picker open (desktop)
 *   processing  → Gemini + Supabase calls in progress (parallel)
 *   results     → All three cards shown
 *   error       → User-friendly error with retry
 */

import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CameraCapture from '../components/CameraCapture.jsx'
import ResultsPanel from '../components/ResultsPanel.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import HeroSection from '../components/HeroSection.jsx'
import { extractMedicineFromImage, generateMedicineExplanation } from '../services/geminiService.js'
import { runAllChecks } from '../services/supabaseService.js'
import { compressImage, imageToBase64 } from '../utils/imageUtils.js'

// ─── Page State Machine ────────────────────────────────────────
const STATES = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  RESULTS: 'results',
  ERROR: 'error',
}

export default function ScannerPage() {
  const { t } = useTranslation()
  const [pageState, setPageState] = useState(STATES.IDLE)
  const [capturedImage, setCapturedImage] = useState(null)  // base64 preview
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [processingStep, setProcessingStep] = useState('')  // For loading messages

  // ─── Handle image captured from camera or file picker ────────
  const handleImageCaptured = useCallback(async (imageFile) => {
    try {
      setPageState(STATES.PROCESSING)
      setError(null)

      // Step 1: Show image preview
      const previewUrl = URL.createObjectURL(imageFile)
      setCapturedImage(previewUrl)

      // Step 2: Compress image to <1MB for API efficiency
      setProcessingStep('Preparing image...')
      const compressed = await compressImage(imageFile, { maxWidthOrHeight: 1200, maxSizeMB: 0.9 })
      const base64 = await imageToBase64(compressed)

      // Step 3: Gemini Vision — extract medicine data from photo
      setProcessingStep('Reading your medicine strip...')
      const extractionResult = await extractMedicineFromImage(base64)

      if (!extractionResult.success || !extractionResult.data) {
        throw new Error(extractionResult.error || 'Could not read medicine from image. Please try a clearer photo.')
      }

      const { brandName, saltComposition } = extractionResult.data

      // Step 4: Run all DB checks + explanation in parallel
      setProcessingStep('Checking government database & finding alternatives...')
      const [dbResults, explanationResult] = await Promise.all([
        runAllChecks(extractionResult.data),
        generateMedicineExplanation(saltComposition, brandName),
      ])

      // Step 5: Assemble final results object
      setResults({
        extraction: extractionResult.data,
        authenticity: dbResults.authenticity,
        explanation: explanationResult.success ? explanationResult.data : null,
        alternatives: dbResults.alternatives,
        nppaPrice: dbResults.nppaPrice,
        imagePreview: previewUrl,
        scannedAt: new Date(),
      })

      setPageState(STATES.RESULTS)
    } catch (err) {
      console.error('[Agada] Scan processing error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
      setPageState(STATES.ERROR)
    }
  }, [])

  // ─── Reset to scan again ──────────────────────────────────────
  const handleReset = useCallback(() => {
    setPageState(STATES.IDLE)
    setCapturedImage(null)
    setResults(null)
    setError(null)
    setProcessingStep('')
    // Revoke object URL to prevent memory leak
    if (capturedImage) URL.revokeObjectURL(capturedImage)
  }, [capturedImage])

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-agada-cream">
      {/* Hero — only shown in idle state */}
      {pageState === STATES.IDLE && (
        <HeroSection />
      )}

      {/* Camera / file picker */}
      {pageState === STATES.IDLE && (
        <div className="max-w-lg mx-auto px-4 pb-8">
          <CameraCapture onImageCaptured={handleImageCaptured} />
          <TrustIndicators />
        </div>
      )}

      {/* Processing state */}
      {pageState === STATES.PROCESSING && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          {capturedImage && (
            <div className="mb-6 rounded-2xl overflow-hidden shadow-card w-full max-w-sm">
              <img
                src={capturedImage}
                alt="Medicine being analysed"
                className="w-full object-cover max-h-48"
              />
              <div className="bg-agada-navy text-white px-4 py-2 text-center text-sm">
                Analysing your medicine...
              </div>
            </div>
          )}
          <LoadingSpinner message={processingStep} />
          <ProcessingSteps currentStep={processingStep} />
        </div>
      )}

      {/* Results */}
      {pageState === STATES.RESULTS && results && (
        <div className="max-w-lg mx-auto px-4 pb-8">
          <ResultsPanel results={results} onScanAgain={handleReset} />
        </div>
      )}

      {/* Error state */}
      {pageState === STATES.ERROR && (
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-red-800 mb-2">Scan Failed</h2>
            <p className="text-red-700 text-sm mb-4">{error}</p>
            <p className="text-gray-600 text-xs mb-4">
              Tips: Ensure the medicine name and dosage are clearly visible. 
              Try in better lighting or upload from your gallery.
            </p>
            <button
              onClick={handleReset}
              className="bg-agada-green text-white px-6 py-3 rounded-xl font-semibold hover:bg-agada-green-dark transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Trust Indicators ─────────────────────────────────────────────
function TrustIndicators() {
  const indicators = [
    { icon: '🏛️', text: 'CDSCO Govt Database' },
    { icon: '🔒', text: 'No login required' },
    { icon: '📱', text: 'No app to download' },
    { icon: '₹', text: 'Forever free' },
  ]

  return (
    <div className="mt-6 grid grid-cols-2 gap-3">
      {indicators.map((item) => (
        <div key={item.text} className="flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm">
          <span className="text-xl">{item.icon}</span>
          <span className="text-sm text-gray-700 font-medium">{item.text}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Processing Steps Indicator ───────────────────────────────────
function ProcessingSteps({ currentStep }) {
  const steps = [
    'Preparing image...',
    'Reading your medicine strip...',
    'Checking government database & finding alternatives...',
  ]

  return (
    <div className="mt-6 w-full max-w-sm">
      {steps.map((step, index) => {
        const isActive = currentStep === step
        const isPast = steps.indexOf(currentStep) > index
        return (
          <div key={step} className={`flex items-center gap-3 py-2 ${isPast ? 'opacity-50' : ''}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${isPast ? 'bg-agada-green text-white' : isActive ? 'bg-agada-saffron text-white animate-pulse' : 'bg-gray-200 text-gray-500'}`}>
              {isPast ? '✓' : index + 1}
            </div>
            <span className={`text-sm ${isActive ? 'font-semibold text-agada-navy' : 'text-gray-500'}`}>
              {step}
            </span>
          </div>
        )
      })}
    </div>
  )
}
