import React, { useState } from 'react'
import { LANGUAGES } from '../i18n/translations.js'

export default function HamMenu({ open, onClose, lang, setLang, t, onScan }) {
  const [showLang, setShowLang] = useState(false)

  const items = [
    { icon: '📷', label: 'Scan Medicine', sub: 'Photograph any strip to verify and compare', pill: 'Active', onClick: () => { onScan(); onClose() } },
    { icon: '🌐', label: 'Language', sub: LANGUAGES.find(l => l.code === lang)?.native || 'English', onClick: () => setShowLang(s => !s) },
    { icon: '🏛', label: 'Government sources', sub: 'CDSCO · NPPA · Jan Aushadhi Portal' },
    { icon: 'ℹ️', label: 'About Agada', sub: 'India Innovates 2026 · Open Innovation' },
  ]

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', overflow: 'hidden', maxHeight: open ? 480 : 0, transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)', boxShadow: open ? '0 4px 12px rgba(0,0,0,0.08)' : 'none' }}>
      <div style={{ padding: '8px 0 12px' }}>
        {items.map((item, i) => (
          <div key={i}>
            <div onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px', cursor: item.onClick ? 'pointer' : 'default' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--bgsoft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 1 }}>{item.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--textlt)' }}>{item.sub}</span>
              </div>
              {item.pill && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'var(--greenlt)', color: 'var(--green)', letterSpacing: '0.05em' }}>{item.pill}</span>}
              {!item.pill && <span style={{ color: 'var(--textlt)', fontSize: 14 }}>›</span>}
            </div>
            {item.icon === '🌐' && showLang && (
              <div style={{ padding: '4px 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {LANGUAGES.map(l => (
                  <button key={l.code} onClick={() => { setLang(l.code); setShowLang(false) }} style={{ padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: lang === l.code ? 'var(--green)' : 'var(--bgsoft)', border: `1.5px solid ${lang === l.code ? 'var(--green)' : 'var(--border)'}`, color: lang === l.code ? '#fff' : 'var(--textlt)', transition: 'all 0.2s' }}>
                    {l.native}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div style={{ margin: '8px 18px 0', paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--textlt)' }}>India Innovates 2026 · Open Innovation · Team Agada</div>
      </div>
    </div>
  )
}
