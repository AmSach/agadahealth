import React from 'react'
import { useT } from '../i18n/translations.js'
import { useLang } from '../App.jsx'

export default function PrivacyPolicy({ onBack }) {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div style={{ flex: 1, padding: '24px 18px 48px 56px', animation: 'fadeIn 0.3s ease', maxWidth: 540 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
        ← {t.back || 'Back'}
      </button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>{t.privacyTitle || 'Privacy Policy'}</h1>
      <p style={{ fontSize: 12, color: 'var(--textlt)', marginBottom: 28 }}>{t.privacyLastUpdated || 'Last updated: March 2026'}</p>

      {[
        {
          heading: t.privacyS1h || 'No data collected',
          body: t.privacyS1b || 'Agada does not collect, store, or transmit any personal data. We do not require an account, login, or any identifying information to use the app.'
        },
        {
          heading: t.privacyS2h || 'Images are not stored',
          body: t.privacyS2b || 'Photos you take or upload are processed entirely in memory for analysis and then discarded immediately. We do not retain any images, scan history, or results on our servers.'
        },
        {
          heading: t.privacyS3h || 'AI processing',
          body: t.privacyS3b || 'Images are sent to Groq\'s API (via a secure server-side proxy) for OCR and analysis. Groq\'s data handling is governed by their privacy policy at groq.com. We pass no user-identifying metadata alongside your image.'
        },
        {
          heading: t.privacyS4h || 'Third-party data sources',
          body: t.privacyS4b || 'Drug verification uses publicly available government databases: CDSCO (cdsco.gov.in), Jan Aushadhi (janaushadhi.gov.in), and NPPA pricing data. Price lookups may query 1mg\'s public search API. None of these calls include any user data.'
        },
        {
          heading: t.privacyS5h || 'Analytics',
          body: t.privacyS5b || 'We use Vercel Analytics and Speed Insights to collect anonymous, aggregate usage metrics (page loads, performance timings). No personally identifiable information is collected.'
        },
        {
          heading: t.privacyS6h || 'Cookies',
          body: t.privacyS6b || 'Agada does not use cookies or local storage for tracking. Your language preference may be stored in browser memory for the duration of your session only.'
        },
        {
          heading: t.privacyS7h || 'Contact',
          body: t.privacyS7b || 'For privacy-related questions, contact: agadahealth@proton.me'
        },
      ].map(({ heading, body }) => (
        <div key={heading} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>{heading}</h2>
          <p style={{ fontSize: 14, color: 'var(--textmd)', lineHeight: 1.7 }}>{body}</p>
        </div>
      ))}

      <div style={{ background: 'var(--greenlt)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--greendk)', fontWeight: 500, lineHeight: 1.6 }}>
        [Locked] {t.privacyFooter || 'Agada is a public service. Your health data stays with you - always.'}
      </div>
    </div>
  )
}
