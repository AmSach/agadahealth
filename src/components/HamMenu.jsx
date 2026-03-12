import React, { useState } from 'react'
import { LANGUAGES } from '../i18n/translations.js'

export default function HamMenu({ open, onClose, lang, setLang, t, onScan }) {
  const [showLang, setShowLang] = useState(false)

  const items = [
    { icon: '📷', iconBg: 'rgba(26,77,46,0.3)', label: t.menuScan, sub: t.menuScanSub, pill: t.active, onClick: () => { onScan(); onClose() } },
    { icon: '💡', iconBg: 'rgba(200,136,32,0.2)', label: t.menuHow, sub: t.menuHowSub, arrow: true },
    { icon: '🏛', iconBg: 'rgba(160,64,48,0.2)', label: t.menuGov, sub: t.menuGovSub, arrow: true },
    { icon: 'ℹ', iconBg: 'rgba(40,100,200,0.15)', label: t.menuAbout, sub: t.menuAboutSub, arrow: true },
    { icon: '🌐', iconBg: 'rgba(26,77,46,0.2)', label: t.menuLang, sub: LANGUAGES.find(l => l.code === lang)?.native || 'English', arrow: true, onClick: () => setShowLang(s => !s) },
  ]

  return (
    <div style={{
      position: 'absolute', top: 54, left: 0, right: 0,
      background: 'var(--deep)', borderBottom: '1px solid var(--rim)',
      zIndex: 49, overflow: 'hidden',
      maxHeight: open ? 500 : 0,
      transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <div style={{ padding: '12px 0 16px' }}>
        {items.map((item, i) => (
          <div key={i}>
            <div onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', cursor: item.onClick ? 'pointer' : 'default' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream)', display: 'block', marginBottom: 1 }}>{item.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--stone)' }}>{item.sub}</span>
              </div>
              {item.pill && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(26,77,46,0.3)', color: 'var(--forestgl)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.pill}</span>
              )}
              {item.arrow && <span style={{ color: 'var(--stone)', fontSize: 13, marginLeft: 'auto' }}>›</span>}
            </div>

            {/* Language picker inline */}
            {item.icon === '🌐' && showLang && (
              <div style={{ padding: '0 22px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {LANGUAGES.map(l => (
                  <button key={l.code} onClick={() => { setLang(l.code); setShowLang(false) }} style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: lang === l.code ? 'var(--forest)' : 'var(--panellt)',
                    border: `1px solid ${lang === l.code ? 'var(--forestlt)' : 'var(--rim)'}`,
                    color: lang === l.code ? 'var(--cream)' : 'var(--stone)',
                    transition: 'all 0.2s',
                  }}>{l.native}</button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ height: 1, background: 'var(--rim)', margin: '6px 22px' }} />
        <div style={{ padding: '8px 22px' }}>
          <span style={{ fontSize: 11, color: 'var(--ash)' }}>India Innovates 2026 · Open Innovation · Team Agada</span>
        </div>
      </div>
    </div>
  )
}
