import React from 'react'

export default function Documentation({ onBack }) {
  return (
    <div style={{ padding: '24px 20px', maxWidth: '500px', margin: '0 auto', animation: 'fadeUp 0.4s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button onClick={onBack} style={{ fontSize: 13, padding: '6px 12px', background: 'var(--bgsoft)', color: 'var(--charcoal)' }}>
          ‹ Back to Home
        </button>
        <h2 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="logo-badge" style={{ width: 26, height: 26, fontSize: 14 }}>D</span>
          API Docs
        </h2>
      </div>

      <div className="neo-card" style={{ background: '#fff', textAlign: 'left' }}>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>🌿 Agada Serverless APIs</h3>
        <p style={{ fontSize: 13.5, color: 'var(--textlt)', lineHeight: 1.5 }}>
          Agada exposes secure, serverless helper endpoints to run client-side requests without exposing API tokens in the browser console.
        </p>
      </div>

      {/* Endpoint 1 */}
      <div className="neo-card" style={{ background: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--greenlt)', color: 'var(--green)' }}>POST</span>
          <code style={{ fontSize: 13, fontWeight: 700 }}>/api/scan-stream</code>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--textlt)' }}>
          Streams medicine OCR, Cdsco database lookup, and pricing calculations via Server-Sent Events (SSE). Helps execute long-running AI pipelines within serverless function timeouts.
        </p>
        <div style={{ background: 'var(--bgsoft)', padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--charcol-lt)', marginBottom: 4 }}>Payload Format:</div>
          <pre style={{ fontSize: 11, overflowX: 'auto', whiteSpace: 'pre' }}>
{`{
  "image": "data:image/jpeg;base64,...",
  "barcodeData": null
}`}
          </pre>
        </div>
        <div style={{ background: 'var(--bgsoft)', padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--charcol-lt)', marginBottom: 4 }}>SSE Event Sequence:</div>
          <ul style={{ fontSize: 11.5, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <li><code>vision</code>: OCR label processing.</li>
            <li><code>database</code>: CDsCO registry indications search.</li>
            <li><code>pricing</code>: Online generic alternatives price lookup.</li>
            <li><code>complete</code>: Emits finalized medicine payload.</li>
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
          Proxies unstructured chat prompts safely to the Groq API, handling key rotation and model fallback cascading server-side to protect keys.
        </p>
        <div style={{ background: 'var(--bgsoft)', padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--charcol-lt)', marginBottom: 4 }}>Example Request Body:</div>
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
          Crawls and aggregates retail drug prices across digital pharmacies (Apollo, Netmeds, 1mg) by searching for matching salts and dosages.
        </p>
      </div>

      {/* Endpoint 4 */}
      <div className="neo-card" style={{ background: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--bluelt)', color: 'var(--blue)' }}>GET</span>
          <code style={{ fontSize: 13, fontWeight: 700 }}>/api/davaindia</code>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--textlt)' }}>
          Queries generic drug items from the DavaIndia database, returning direct matches for chemical salts and their prices.
        </p>
      </div>

      {/* Footer */}
      <button onClick={onBack} style={{ margin: '16px auto 32px', display: 'inline-flex', background: 'var(--navy)', color: '#fff' }}>
        Back to Dashboard
      </button>
    </div>
  )
}
