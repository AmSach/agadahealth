/**
 * HeroSection.jsx
 */

import React from 'react'

export default function HeroSection() {
  return (
    <div className="bg-agada-navy text-white px-4 pt-6 pb-8">
      <div className="max-w-lg mx-auto">
        {/* Main headline */}
        <div className="text-center mb-6">
          <div className="text-4xl font-black mb-1">
            One scan.<br/>
            <span className="text-agada-saffron">Three seconds.</span><br/>
            Three answers.
          </div>
          <p className="text-gray-300 text-sm mt-3 leading-relaxed">
            Real or fake? What does it do? Are you overpaying?<br/>
            Powered by India's own government health databases.
          </p>
        </div>

        {/* Three value props */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { icon: '🔍', title: 'Real or Fake?', sub: 'CDSCO verified' },
            { icon: '💊', title: 'What Is This?', sub: 'Plain language' },
            { icon: '💰', title: 'Overpaying?', sub: 'Jan Aushadhi' },
          ].map((item) => (
            <div key={item.title} className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs font-bold leading-tight">{item.title}</div>
              <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Social proof / stats */}
        <div className="flex justify-center gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-black text-agada-saffron">91%</div>
            <div className="text-xs text-gray-400">max savings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-agada-saffron">1.4B</div>
            <div className="text-xs text-gray-400">Indians served</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-agada-saffron">₹0</div>
            <div className="text-xs text-gray-400">forever free</div>
          </div>
        </div>
      </div>
    </div>
  )
}
