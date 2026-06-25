import React from 'react'

export default function Documentation({ onBack }) {
  return (
    <div style={{ padding: '24px 20px', maxWidth: '500px', margin: '0 auto', animation: 'fadeUp 0.4s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button onClick={onBack} style={{ fontSize: 13, padding: '6px 12px', background: 'var(--bgsoft)', color: 'var(--charcoal)' }}>
          ‹ back to home
        </button>
        <h2 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Serif Display', fontWeight: 'normal' }}>
          <span className="logo-badge" style={{ width: 26, height: 26, fontSize: 14 }}>d</span>
          api docs
        </h2>
      </div>

      <div className="neo-card" style={{ background: '#fff', textAlign: 'left' }}>
        <h3 style={{ fontSize: 18, marginBottom: 8, fontFamily: 'DM Serif Display', fontWeight: 'normal' }}>ok so</h3>
        <p style={{ fontSize: 13.5, color: 'var(--textlt)', lineHeight: 1.5 }}>
          i built a few serverless backend helper endpoints because putting API keys directly in the frontend is a security risk, and vercel functions timeout if you take too long to run image processing.
        </p>
        <div className="aman-note">
          yes, i actually documented my API endpoints. if you are building another app, you can use these, but please don't spam them because my Groq and Davaindia scraper credits aren't infinite.
        </div>
      </div>

      {/* Endpoint 1 */}
      <div className="neo-card" style={{ background: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--greenlt)', color: 'var(--green)' }}>POST</span>
          <code style={{ fontSize: 13, fontWeight: 700 }}>/api/scan-stream</code>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--textlt)' }}>
          this does the heavy lifting. it reads the uploaded strip image, does the ocr, searches the local indexedDB, and pulls generic price estimates all in one go. since vercel functions timeout after 10 seconds, i made this stream updates back using server-sent events (sse) so the browser doesn't hang.
        </p>
        <div style={{ background: 'var(--bgsoft)', padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--charcol-lt)', marginBottom: 4 }}>send this payload:</div>
          <pre style={{ fontSize: 11, overflowX: 'auto', whiteSpace: 'pre' }}>
{`{
  "image": "data:image/jpeg;base64,...",
  "barcodeData": null
}`}
          </pre>
        </div>
        <div style={{ background: 'var(--bgsoft)', padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--charcol-lt)', marginBottom: 4 }}>what it streams back:</div>
          <ul style={{ fontSize: 11.5, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <li><code>vision</code>: kicks off the ocr processing.</li>
            <li><code>database</code>: matches the salt names in the cdsco drug registry.</li>
            <li><code>pricing</code>: searches generic alternatives.</li>
            <li><code>complete</code>: gives you the final medicine details json object.</li>
          </ul>
        </div>
      </div>

      {/* Endpoint 2 */}
      <div className="neo-card" style={{ background: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--greenlt)', color: 'var(--green)' }}>POST</span>
          <code style={{ fontSize: 13, fontWeight: 700 }}>/api/groq</code>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--textlt)' }}>
          a secure proxy to keep groq api keys out of the client browser. it handles key rotation and model fallback cascading server-side, so if one key get rate-limited, it handles it without breaking the app.
        </p>
        <div style={{ background: 'var(--bgsoft)', padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--charcol-lt)', marginBottom: 4 }}>payload shape:</div>
          <pre style={{ fontSize: 11, overflowX: 'auto', whiteSpace: 'pre' }}>
{`{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    { "role": "user", "content": "Explain paracetamol..." }
  ]
}`}
          </pre>
        </div>
      </div>

      {/* Endpoint 3 */}
      <div className="neo-card" style={{ background: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--bluelt)', color: 'var(--blue)' }}>GET</span>
          <code style={{ fontSize: 13, fontWeight: 700 }}>/api/prices</code>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--textlt)' }}>
          scrapes apollo, netmeds, and 1mg for real retail pricing of the generic salt so you can see exactly how much you're getting ripped off.
        </p>
      </div>

      {/* Endpoint 4 */}
      <div className="neo-card" style={{ background: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--bluelt)', color: 'var(--blue)' }}>GET</span>
          <code style={{ fontSize: 13, fontWeight: 700 }}>/api/davaindia</code>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--textlt)' }}>
          looks up generic prices from davaindia's catalog so we have live local price baselines.
        </p>
      </div>

      {/* Footer */}
      <button onClick={onBack} style={{ margin: '16px auto 32px', display: 'inline-flex', background: 'var(--navy)', color: '#fff' }}>
        back to home
      </button>
    </div>
  )
}
