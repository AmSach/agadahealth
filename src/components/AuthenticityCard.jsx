/**
 * AuthenticityCard.jsx
 * 
 * Displays CDSCO authenticity check result.
 * 
 * Four possible states:
 *   VERIFIED      → Green. Medicine confirmed in CDSCO registry.
 *   NOT_FOUND     → Red. Not in registry. Possible counterfeit.
 *   EXPIRED       → Orange. Was registered but licence is inactive.
 *   SIMILAR_FOUND → Yellow. Brand not found, similar salt found.
 *   ERROR         → Grey. Could not check (network issue).
 */

import React, { useState } from 'react'
import SourceBadge from './SourceBadge.jsx'

const STATUS_CONFIG = {
  VERIFIED: {
    bg: 'bg-agada-verified-light',
    border: 'border-agada-verified',
    icon: '✅',
    iconBg: 'bg-green-700',
    headline: 'REAL — Verified by CDSCO',
    headlineColor: 'text-green-800',
    messageColor: 'text-green-700',
    badgeType: 'verified',
  },
  NOT_FOUND: {
    bg: 'bg-agada-alert-light',
    border: 'border-agada-alert',
    icon: '🚨',
    iconBg: 'bg-red-700',
    headline: 'NOT FOUND in CDSCO Registry',
    headlineColor: 'text-red-800',
    messageColor: 'text-red-700',
    badgeType: 'unverified',
    warning: true,
  },
  EXPIRED: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    icon: '⚠️',
    iconBg: 'bg-orange-600',
    headline: 'Licence EXPIRED or SUSPENDED',
    headlineColor: 'text-orange-800',
    messageColor: 'text-orange-700',
    badgeType: 'expired',
    warning: true,
  },
  SIMILAR_FOUND: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    icon: '🔍',
    iconBg: 'bg-yellow-600',
    headline: 'Brand Unknown — Salt Registered',
    headlineColor: 'text-yellow-800',
    messageColor: 'text-yellow-700',
    badgeType: 'partial',
  },
  ERROR: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: '⚡',
    iconBg: 'bg-gray-500',
    headline: 'Could Not Check',
    headlineColor: 'text-gray-700',
    messageColor: 'text-gray-600',
    badgeType: 'error',
  },
}

export default function AuthenticityCard({ authenticity, extraction }) {
  const [expanded, setExpanded] = useState(false)
  const status = authenticity?.status || 'ERROR'
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ERROR
  const data = authenticity?.data

  return (
    <div className={`rounded-2xl border-2 ${config.bg} ${config.border} overflow-hidden shadow-card`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center text-xl flex-shrink-0`}>
            {config.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                REAL OR FAKE?
              </span>
              <SourceBadge type={config.badgeType} source="CDSCO" />
            </div>
            <h2 className={`font-bold text-base leading-tight ${config.headlineColor}`}>
              {config.headline}
            </h2>
          </div>
        </div>
      </div>

      {/* Message */}
      <div className={`px-4 pb-3 text-sm ${config.messageColor}`}>
        {authenticity?.message}
      </div>

      {/* Warning box for NOT_FOUND */}
      {config.warning && status === 'NOT_FOUND' && (
        <div className="mx-4 mb-3 bg-red-100 border border-red-300 rounded-xl p-3">
          <p className="text-red-800 text-xs font-semibold mb-1">⚠️ What should I do?</p>
          <ul className="text-red-700 text-xs space-y-1">
            <li>• Do NOT consume this medicine until verified with a pharmacist</li>
            <li>• Return to the chemist and ask for CDSCO registration details</li>
            <li>• Report suspected fakes: 1800-180-3024 (CDSCO helpline, free)</li>
            <li>• Try a Jan Aushadhi Kendra for a verified generic alternative</li>
          </ul>
        </div>
      )}

      {/* CDSCO Record Details (expandable) */}
      {data && !Array.isArray(data) && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            {expanded ? 'Hide' : 'Show'} CDSCO record details
          </button>
          {expanded && (
            <div className="mt-2 bg-white rounded-xl p-3 text-xs space-y-1 border border-gray-100">
              {data.license_number && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Licence No.</span>
                  <span className="font-mono font-medium text-gray-800">{data.license_number}</span>
                </div>
              )}
              {data.manufacturer && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Manufacturer</span>
                  <span className="font-medium text-gray-800 text-right max-w-[60%]">{data.manufacturer}</span>
                </div>
              )}
              {data.schedule && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Schedule</span>
                  <span className={`font-bold ${data.schedule?.includes('H') ? 'text-red-600' : 'text-green-600'}`}>
                    {data.schedule} {data.schedule?.includes('H') ? '(Prescription required)' : '(OTC)'}
                  </span>
                </div>
              )}
              {data.salt_composition && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Registered salt</span>
                  <span className="font-medium text-gray-800 text-right max-w-[60%]">{data.salt_composition}</span>
                </div>
              )}
              <div className="pt-1 border-t border-gray-100">
                <span className="text-gray-400">Source: cdsco.gov.in · Verified in real time</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Similar found — show list */}
      {status === 'SIMILAR_FOUND' && Array.isArray(data) && (
        <div className="px-4 pb-4">
          <p className="text-xs text-yellow-700 mb-2 font-medium">
            Medicines with the same salt ({extraction?.saltComposition?.split(' ')[0]}) that ARE registered:
          </p>
          {data.slice(0, 3).map((drug, i) => (
            <div key={i} className="bg-white rounded-lg p-2 mb-1 text-xs border border-yellow-100">
              <span className="font-semibold text-gray-800">{drug.brand_name}</span>
              <span className="text-gray-500"> · {drug.manufacturer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
