import React from 'react'
import { Link } from 'react-router-dom'

export default function HowItWorksPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-agada-navy mb-1">How Agada Works</h1>
      <p className="text-gray-500 text-sm mb-6">One scan. Three seconds. Three answers. Here's what happens.</p>

      {/* Steps */}
      {[
        {
          step: '01',
          title: 'You photograph a medicine strip',
          detail: 'Tap "Scan Medicine." Your phone's rear camera opens. Frame the front of the strip — showing the brand name, dosage, and manufacturer. Tap the shutter.',
          icon: '📷',
        },
        {
          step: '02',
          title: 'Gemini Vision reads the strip',
          detail: 'Google Gemini 1.5 Flash analyses the image and extracts: brand name, active salt, dosage, manufacturer, and batch number. Structured JSON. Takes ~1.5 seconds.',
          icon: '🤖',
          badge: 'AI — Google Gemini 1.5 Flash',
        },
        {
          step: '03',
          title: 'CDSCO registry is queried',
          detail: 'The extracted brand name is checked against India\'s national CDSCO drug registry — 100,000+ approved drugs. Result: VERIFIED, NOT FOUND, or EXPIRED. This is not AI — this is the actual government database.',
          icon: '🏛️',
          badge: 'Government — CDSCO Registry',
        },
        {
          step: '04',
          title: 'Jan Aushadhi alternatives are found',
          detail: 'The active salt (e.g., Paracetamol) is matched against the Jan Aushadhi government generic database. Results are sorted by price — cheapest first. Savings percentage is calculated automatically.',
          icon: '💰',
          badge: 'Government — Jan Aushadhi / BPPI',
        },
        {
          step: '05',
          title: 'Three cards appear simultaneously',
          detail: 'All three checks run in parallel. Total time: under 3 seconds on 4G. Three cards: Is it real? What is it? Are you overpaying? Each card shows its data source badge.',
          icon: '✅',
        },
      ].map((item) => (
        <div key={item.step} className="flex gap-4 mb-5">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-agada-navy text-white rounded-full flex items-center justify-center text-xs font-black">
              {item.step}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{item.icon}</span>
              <h3 className="font-bold text-agada-navy text-sm">{item.title}</h3>
            </div>
            {item.badge && (
              <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium mb-1">
                Source: {item.badge}
              </span>
            )}
            <p className="text-sm text-gray-600 leading-relaxed">{item.detail}</p>
          </div>
        </div>
      ))}

      {/* Privacy section */}
      <div className="bg-agada-navy text-white rounded-2xl p-5 mb-6">
        <h2 className="font-bold mb-2">🔒 Your Privacy</h2>
        <ul className="text-sm text-gray-300 space-y-1">
          <li>• No login. No account. No email required.</li>
          <li>• Medicine photos are processed by Gemini and immediately discarded.</li>
          <li>• Nothing is stored. No scan history. No analytics tracking individuals.</li>
          <li>• Agada is a static website. There is no Agada application server.</li>
        </ul>
      </div>

      <div className="text-center">
        <Link to="/" className="bg-agada-green text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-agada-green-dark transition-colors">
          ← Start Scanning
        </Link>
      </div>
    </div>
  )
}
