/**
 * Header.jsx
 */

import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Header() {
  const { i18n } = useTranslation()
  const location = useLocation()
  const [langOpen, setLangOpen] = useState(false)

  const languages = [
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'hi', label: 'HI', name: 'हिन्दी' },
    { code: 'ta', label: 'TA', name: 'தமிழ்' },
    { code: 'bn', label: 'BN', name: 'বাংলা' },
    { code: 'te', label: 'TE', name: 'తెలుగు' },
    { code: 'mr', label: 'MR', name: 'मराठी' },
  ]

  return (
    <header className="bg-agada-navy text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-agada-green rounded-lg flex items-center justify-center text-sm font-black">
            अ
          </div>
          <div>
            <span className="font-black text-lg leading-none">Agada</span>
            <p className="text-xs text-gray-300 leading-none">Know Your Medicine</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {/* Language picker */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg text-xs font-bold transition-colors"
              aria-label="Change language"
            >
              {i18n.language?.slice(0, 2).toUpperCase() || 'EN'} ▾
            </button>
            {langOpen && (
              <div className="absolute right-0 top-8 bg-white text-gray-800 rounded-xl shadow-xl z-50 overflow-hidden min-w-[120px]">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2
                      ${i18n.language === lang.code ? 'font-bold text-agada-green' : ''}`}
                  >
                    <span className="text-xs font-mono text-gray-400">{lang.label}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* How it works link */}
          <Link to="/how-it-works" className="text-xs text-gray-300 hover:text-white transition-colors">
            How it works
          </Link>
        </div>
      </div>
    </header>
  )
}
