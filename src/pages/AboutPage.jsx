import React from 'react'
import { Link } from 'react-router-dom'

export default function AboutPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Hero */}
      <div className="bg-agada-navy text-white rounded-2xl p-6 mb-6 text-center">
        <div className="text-5xl font-black mb-2">अगद</div>
        <div className="text-2xl font-bold text-agada-saffron mb-1">Agada</div>
        <div className="text-gray-300 text-sm">Sanskrit — "Free from disease"</div>
      </div>

      {/* The story */}
      <div className="bg-white rounded-2xl p-5 mb-4 shadow-card">
        <h2 className="text-lg font-bold text-agada-navy mb-3">Why Agada Exists</h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          Her name was Sunita. A school teacher from Kanpur. Diagnosed with cancer.
        </p>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          She paid ₹4,800 for a medicine available at ₹210. Not because the system failed. 
          Because no one built the door.
        </p>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          India's government has built an extraordinary healthcare infrastructure — 
          CDSCO drug registry, Jan Aushadhi stores, NPPA price controls. 
          What's missing is the consumer-facing last mile.
        </p>
        <p className="text-gray-800 text-sm font-bold">
          The government built the data. We built the door.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { number: '₹16,000 Cr', label: 'lost to fake medicines annually', source: 'WHO, 2023' },
          { number: '72%', label: 'Indians never heard of Jan Aushadhi', source: 'CSE Survey 2023' },
          { number: '91%', label: 'max savings through generics', source: 'BPPI / NPPA' },
          { number: '14,000+', label: 'Jan Aushadhi Kendras across India', source: 'BPPI, 2025' },
        ].map((stat) => (
          <div key={stat.number} className="bg-white rounded-xl p-3 shadow-card text-center">
            <div className="text-2xl font-black text-agada-green">{stat.number}</div>
            <div className="text-xs text-gray-600 mt-0.5">{stat.label}</div>
            <div className="text-xs text-gray-400 mt-0.5 italic">{stat.source}</div>
          </div>
        ))}
      </div>

      {/* Team */}
      <div className="bg-white rounded-2xl p-5 mb-4 shadow-card">
        <h2 className="text-lg font-bold text-agada-navy mb-3">The Team</h2>
        <p className="text-sm text-gray-500 mb-2">Open Innovation 2026 · India Innovates</p>
        <div className="grid grid-cols-2 gap-2">
          {['Aman Sachan', 'Siddharth Lalwani', 'Chetna Kalra', 'Syed Akbar'].map((name) => (
            <div key={name} className="bg-agada-cream rounded-lg px-3 py-2 text-sm font-medium text-agada-navy">
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* Data sources */}
      <div className="bg-white rounded-2xl p-5 shadow-card">
        <h2 className="text-lg font-bold text-agada-navy mb-3">Government Data Sources</h2>
        {[
          { name: 'CDSCO', full: 'Central Drugs Standard Control Organisation', url: 'cdscoonline.gov.in', desc: '100,000+ approved drugs. Ground truth for authenticity.' },
          { name: 'Jan Aushadhi / BPPI', full: 'Bureau of Pharma PSUs of India', url: 'janaushadhi.gov.in', desc: '1,900+ generics. 50–90% cheaper.' },
          { name: 'NPPA', full: 'National Pharmaceutical Pricing Authority', url: 'nppaindia.nic.in', desc: 'DPCO 2013 price ceilings. Legally mandated.' },
        ].map((src) => (
          <div key={src.name} className="mb-3 last:mb-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-sm text-agada-navy">{src.name}</span>
              <span className="text-xs text-gray-400">· {src.full}</span>
            </div>
            <p className="text-xs text-gray-500">{src.desc}</p>
            <a href={`https://${src.url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-agada-green underline">
              {src.url} ↗
            </a>
          </div>
        ))}
      </div>

      <div className="text-center mt-6">
        <Link to="/" className="bg-agada-green text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-agada-green-dark transition-colors">
          ← Back to Scanner
        </Link>
      </div>
    </div>
  )
}
