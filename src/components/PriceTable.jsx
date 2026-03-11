/**
 * PriceTable.jsx
 * Renders the alternatives price comparison table.
 * Jan Aushadhi medicines always appear first (ordered by MRP ascending from DB).
 */

import React from 'react'

export default function PriceTable({ medicines, brandedMrp }) {
  if (!medicines || medicines.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden border border-orange-200">
      {/* Table header */}
      <div className="grid grid-cols-3 bg-agada-navy text-white text-xs font-bold px-3 py-2">
        <span>Medicine</span>
        <span className="text-center">MRP</span>
        <span className="text-right">Savings</span>
      </div>

      {/* Branded medicine row (for comparison) */}
      {brandedMrp && (
        <div className="grid grid-cols-3 bg-red-50 border-b border-orange-100 px-3 py-2 items-center">
          <div>
            <p className="text-xs font-bold text-gray-800">Branded (you paid)</p>
            <p className="text-xs text-gray-400">Current price</p>
          </div>
          <div className="text-center">
            <span className="text-sm font-bold text-red-600">₹{brandedMrp}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400">—</span>
          </div>
        </div>
      )}

      {/* Generic alternatives */}
      {medicines.map((med, index) => {
        const savings = med.savings || (brandedMrp ? computeSavings(brandedMrp, med.mrp) : null)
        const isFirst = index === 0

        return (
          <div
            key={med.product_code || index}
            className={`grid grid-cols-3 border-b border-orange-100 px-3 py-2 items-center
              ${isFirst ? 'bg-green-50' : 'bg-white'}`}
          >
            <div>
              <p className={`text-xs font-semibold ${isFirst ? 'text-green-800' : 'text-gray-700'}`}>
                {med.product_name}
                {isFirst && (
                  <span className="ml-1 bg-green-700 text-white text-xs px-1 rounded">★ Best</span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {med.isJanAushadhi ? 'Jan Aushadhi' : 'Generic'} · {med.pack_size}
              </p>
            </div>
            <div className="text-center">
              <span className={`text-sm font-bold ${isFirst ? 'text-green-700' : 'text-gray-700'}`}>
                ₹{med.mrp}
              </span>
            </div>
            <div className="text-right">
              {savings && savings.percentageSaved > 0 ? (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                  ${savings.isMajor ? 'bg-green-700 text-white' : 
                    savings.isSignificant ? 'bg-green-100 text-green-700' : 
                    'bg-gray-100 text-gray-600'}`}>
                  {savings.percentageSaved}% off
                </span>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function computeSavings(brandedMrp, genericMrp) {
  if (!brandedMrp || !genericMrp) return null
  const savings = brandedMrp - genericMrp
  const percentageSaved = Math.round((savings / brandedMrp) * 100)
  return {
    percentageSaved: Math.max(0, percentageSaved),
    isSignificant: percentageSaved >= 30,
    isMajor: percentageSaved >= 70,
  }
}
