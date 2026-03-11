/**
 * LoadingSpinner.jsx
 */

import React from 'react'

export default function LoadingSpinner({ message = 'Analysing your medicine...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Animated scan ring */}
      <div className="relative w-20 h-20 mb-4">
        <div className="absolute inset-0 rounded-full border-4 border-agada-green/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-agada-green animate-spin"></div>
        <div className="absolute inset-3 rounded-full bg-agada-green/10 flex items-center justify-center text-2xl">
          💊
        </div>
      </div>
      <p className="text-agada-navy font-semibold text-sm text-center max-w-xs">
        {message}
      </p>
      <p className="text-gray-400 text-xs mt-1">Usually takes 2–3 seconds</p>
    </div>
  )
}
