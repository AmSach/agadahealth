/**
 * ResultsPanel.jsx
 * 
 * Renders all three result cards simultaneously after a scan:
 *   1. AuthenticityCard   — Is this medicine real? (CDSCO)
 *   2. MedicineInfoCard   — What is this medicine? (Gemini)
 *   3. AlternativesCard   — Are you overpaying? (Jan Aushadhi + NPPA)
 * 
 * Cards animate in sequentially for visual hierarchy.
 * The most urgent information (authenticity) is always shown first.
 */

import React from 'react'
import AuthenticityCard from './AuthenticityCard.jsx'
import MedicineInfoCard from './MedicineInfoCard.jsx'
import AlternativesCard from './AlternativesCard.jsx'
import SourceBadge from './SourceBadge.jsx'

export default function ResultsPanel({ results, onScanAgain }) {
  const { extraction, authenticity, explanation, alternatives, nppaPrice, imagePreview, scannedAt } = results

  return (
    <div className="py-4">
      {/* Scanned medicine summary header */}
      <div className="flex items-center gap-3 mb-4 bg-white rounded-2xl p-4 shadow-card animate-fade-in">
        {imagePreview && (
          <img
            src={imagePreview}
            alt="Scanned medicine"
            className="w-16 h-16 rounded-xl object-cover border border-gray-100"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-agada-navy text-lg leading-tight truncate">
            {extraction.brandName || 'Unknown Medicine'}
          </h1>
          <p className="text-gray-500 text-sm truncate">{extraction.saltComposition || 'Salt not extracted'}</p>
          {extraction.manufacturer && (
            <p className="text-gray-400 text-xs">{extraction.manufacturer}</p>
          )}
        </div>
        {extraction.confidence && (
          <div className={`text-xs px-2 py-1 rounded-full font-medium
            ${extraction.confidence >= 80 ? 'bg-green-100 text-green-700' :
              extraction.confidence >= 60 ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'}`}>
            {extraction.confidence}% read
          </div>
        )}
      </div>

      {/* Card 1: Authenticity — most critical, always first */}
      <div className="mb-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <AuthenticityCard authenticity={authenticity} extraction={extraction} />
      </div>

      {/* Card 2: Medicine information */}
      <div className="mb-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <MedicineInfoCard explanation={explanation} extraction={extraction} />
      </div>

      {/* Card 3: Alternatives and savings */}
      <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <AlternativesCard
          alternatives={alternatives}
          nppaPrice={nppaPrice}
          extraction={extraction}
        />
      </div>

      {/* Disclaimer */}
      <div className="text-center text-xs text-gray-400 px-2 mb-4">
        This information is for awareness only and does not replace advice from a doctor or pharmacist.
        Always consult a healthcare professional before making medication decisions.
      </div>

      {/* Scan again button */}
      <button
        onClick={onScanAgain}
        className="w-full bg-agada-green text-white py-4 rounded-2xl font-bold text-lg
          hover:bg-agada-green-dark active:scale-95 transition-all shadow-card"
      >
        📷 Scan Another Medicine
      </button>

      <p className="text-center text-xs text-gray-400 mt-3">
        Scanned at {scannedAt?.toLocaleTimeString('en-IN')} · No data stored
      </p>
    </div>
  )
}
