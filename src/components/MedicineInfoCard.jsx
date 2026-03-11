/**
 * MedicineInfoCard.jsx
 * 
 * "What is this medicine?" card.
 * Renders Gemini-generated plain-English explanation.
 * Always labelled "AI Estimated" — never presented as medical advice.
 */

import React, { useState } from 'react'
import SourceBadge from './SourceBadge.jsx'

export default function MedicineInfoCard({ explanation, extraction }) {
  const [expanded, setExpanded] = useState(false)

  if (!explanation) {
    return (
      <div className="rounded-2xl border-2 bg-blue-50 border-blue-200 p-4 shadow-card">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">💊</span>
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">WHAT IS THIS?</span>
          <SourceBadge type="ai" source="AI Estimated" />
        </div>
        <p className="text-sm text-gray-500">
          Could not generate medicine explanation. Please consult a pharmacist.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 bg-blue-50 border-blue-200 overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-xl flex-shrink-0">
            💊
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">WHAT IS THIS?</span>
              <SourceBadge type="ai" source="AI Estimated" />
            </div>
            <p className="text-sm text-blue-900 leading-relaxed">{explanation.whatItDoes}</p>
          </div>
        </div>
      </div>

      {/* Common uses */}
      {explanation.commonUses?.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">Common uses:</p>
          <div className="flex flex-wrap gap-1">
            {explanation.commonUses.map((use, i) => (
              <span key={i} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                {use}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Prescription requirement */}
      <div className="px-4 pb-3">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
          ${explanation.scheduleH 
            ? 'bg-red-100 text-red-700 border border-red-200' 
            : 'bg-green-100 text-green-700 border border-green-200'}`}>
          {explanation.scheduleH ? '🩺 Prescription Required (Schedule H)' : '✅ Available Over the Counter (OTC)'}
        </div>
      </div>

      {/* Expandable warnings and details */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 underline hover:text-blue-800"
        >
          {expanded ? 'Hide' : 'Show'} warnings & storage
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Warnings */}
            {explanation.importantWarnings?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-xs font-bold text-yellow-800 mb-1">⚠️ Important Warnings</p>
                <ul className="space-y-0.5">
                  {explanation.importantWarnings.map((w, i) => (
                    <li key={i} className="text-xs text-yellow-700">• {w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Do not take if */}
            {explanation.doNotTakeIf?.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 mb-1">🚫 Do not take if you are:</p>
                <ul className="space-y-0.5">
                  {explanation.doNotTakeIf.map((d, i) => (
                    <li key={i} className="text-xs text-red-600">• {d}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Storage */}
            {explanation.storageInstructions && (
              <div className="bg-white border border-gray-100 rounded-xl p-3">
                <p className="text-xs font-bold text-gray-700 mb-1">📦 Storage</p>
                <p className="text-xs text-gray-600">{explanation.storageInstructions}</p>
              </div>
            )}

            {/* AI disclaimer */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 italic">
                ⚡ {explanation.sourceNote || 'AI Estimated — verify with a pharmacist.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
