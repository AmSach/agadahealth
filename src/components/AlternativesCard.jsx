/**
 * AlternativesCard.jsx
 * 
 * Shows Jan Aushadhi cheaper alternatives and NPPA price ceiling data.
 * Jan Aushadhi is always shown first (ranked by price, cheapest first).
 * Savings percentage is calculated and highlighted prominently.
 * 
 * Design principle: The savings number should be impossible to miss.
 * A patient who sees "91% savings" will act on it. Don't bury it.
 */

import React, { useState } from 'react'
import SourceBadge from './SourceBadge.jsx'
import PriceTable from './PriceTable.jsx'

export default function AlternativesCard({ alternatives, nppaPrice, extraction }) {
  const [showAll, setShowAll] = useState(false)
  const hasAlternatives = alternatives?.data?.length > 0
  const topAlternative = alternatives?.data?.[0]
  const brandedMrp = extraction?.mrp ? parseFloat(extraction.mrp) : null

  // Calculate headline savings vs top alternative
  const headlineSavings = topAlternative?.savings || 
    (brandedMrp && topAlternative?.mrp ? computeSavings(brandedMrp, topAlternative.mrp) : null)

  return (
    <div className="rounded-2xl border-2 bg-agada-savings-light border-orange-200 overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-agada-savings flex items-center justify-center text-xl flex-shrink-0">
            💰
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                YOU ARE OVERPAYING
              </span>
              <SourceBadge type="government" source="Jan Aushadhi" />
            </div>
            <h2 className="font-bold text-base leading-tight text-orange-900">
              {hasAlternatives ? 'Cheaper Alternatives Available' : 'No Jan Aushadhi Generic Found'}
            </h2>
          </div>
        </div>
      </div>

      {/* Headline Savings Banner — show prominently if significant */}
      {headlineSavings && headlineSavings.percentageSaved >= 30 && (
        <div className="mx-4 mb-3 bg-agada-savings rounded-2xl p-4 text-center text-white">
          <div className="text-5xl font-black mb-1">
            {headlineSavings.percentageSaved}%
          </div>
          <div className="text-sm font-semibold opacity-90">potential savings</div>
          {brandedMrp && topAlternative?.mrp && (
            <div className="text-xs opacity-80 mt-1">
              ₹{brandedMrp} → ₹{topAlternative.mrp} (Jan Aushadhi price)
            </div>
          )}
          <div className="text-xs opacity-70 mt-2">
            Same active ingredient. Bioequivalent. Required by law.
          </div>
        </div>
      )}

      {/* NPPA Price Ceiling info */}
      {nppaPrice?.success && nppaPrice.data && (
        <div className="mx-4 mb-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-blue-800 text-xs font-bold mb-1">⚖️ Government Price Ceiling (NPPA / DPCO 2013)</p>
          <p className="text-blue-700 text-xs">
            Maximum legal price: <span className="font-bold">₹{nppaPrice.data.ceiling_price} per {nppaPrice.data.unit}</span>
          </p>
          <p className="text-blue-600 text-xs mt-1">
            If you paid more than this, the seller may have violated drug price control regulations.
          </p>
          <p className="text-blue-400 text-xs mt-1">Source: NPPA · DPCO 2013</p>
        </div>
      )}

      {/* Alternatives table */}
      {hasAlternatives ? (
        <div className="px-4 pb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Jan Aushadhi Generics with same salt:
          </p>
          <PriceTable
            medicines={showAll ? alternatives.data : alternatives.data.slice(0, 3)}
            brandedMrp={brandedMrp}
          />
          {alternatives.data.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-xs text-agada-green underline hover:text-agada-green-dark"
            >
              {showAll ? 'Show fewer' : `Show ${alternatives.data.length - 3} more alternatives`}
            </button>
          )}
          <div className="mt-3 bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-600 font-semibold mb-1">📍 Where to buy Jan Aushadhi medicines</p>
            <p className="text-xs text-gray-500">
              Over 14,000 Jan Aushadhi Kendras across India. Search at{' '}
              <a
                href="https://janaushadhi.gov.in/storelocator.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-agada-green underline"
              >
                janaushadhi.gov.in
              </a>{' '}
              or call 1800-180-8080 (free).
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-sm text-gray-600">
              {alternatives?.message || `No Jan Aushadhi generic found for ${extraction?.saltComposition?.split(' ')[0]}.`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              This medicine may not yet be included in the Jan Aushadhi scheme.
              Ask your doctor if a generic alternative is available.
            </p>
          </div>
        </div>
      )}

      {/* Why generics work — trust builder */}
      <div className="mx-4 mb-4 bg-white rounded-xl p-3 border border-orange-100">
        <p className="text-xs font-bold text-gray-700 mb-1">❓ Are generics as good as branded?</p>
        <p className="text-xs text-gray-600">
          Yes. CDSCO requires all generics to be <strong>bioequivalent</strong> to the branded version — 
          meaning the same active ingredient produces the same effect. The difference in price is 
          marketing, packaging, and brand premium — not medicine quality.
        </p>
      </div>
    </div>
  )
}

function computeSavings(brandedMrp, genericMrp) {
  const savings = brandedMrp - genericMrp
  const percentageSaved = Math.round((savings / brandedMrp) * 100)
  return {
    brandedMrp,
    genericMrp,
    absoluteSavings: Math.max(0, savings).toFixed(2),
    percentageSaved: Math.max(0, percentageSaved),
    isSignificant: percentageSaved >= 30,
    isMajor: percentageSaved >= 70,
  }
}
