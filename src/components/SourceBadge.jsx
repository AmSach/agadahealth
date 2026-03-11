/**
 * SourceBadge.jsx
 * 
 * Source attribution badge shown on every result card.
 * Core design principle: every piece of information must show WHERE it came from.
 * This is not a legal disclaimer — it's a trust feature.
 */

import React from 'react'

const BADGE_CONFIGS = {
  verified: {
    bg: 'bg-green-700',
    text: 'text-white',
    icon: '🏛️',
    label: (source) => source || 'CDSCO Verified',
  },
  government: {
    bg: 'bg-blue-700',
    text: 'text-white',
    icon: '🏛️',
    label: (source) => source || 'Govt Source',
  },
  ai: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    icon: '⚡',
    label: (source) => source || 'AI Estimated',
  },
  unverified: {
    bg: 'bg-red-700',
    text: 'text-white',
    icon: '❌',
    label: () => 'Not in CDSCO',
  },
  expired: {
    bg: 'bg-orange-600',
    text: 'text-white',
    icon: '⚠️',
    label: () => 'Licence Expired',
  },
  partial: {
    bg: 'bg-yellow-500',
    text: 'text-white',
    icon: '🔍',
    label: () => 'Partial Match',
  },
  error: {
    bg: 'bg-gray-300',
    text: 'text-gray-700',
    icon: '?',
    label: () => 'Unknown',
  },
}

export default function SourceBadge({ type = 'government', source }) {
  const config = BADGE_CONFIGS[type] || BADGE_CONFIGS.government

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${config.bg} ${config.text}`}>
      <span>{config.icon}</span>
      <span>{config.label(source)}</span>
    </span>
  )
}
