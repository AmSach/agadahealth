import React, { useState, createContext, useContext } from 'react'
import Scanner from './pages/Scanner.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import Terms from './pages/Terms.jsx'

export const LangContext = createContext({ lang: 'en', setLang: () => {} })
export const useLang = () => useContext(LangContext)
export const PageContext = createContext({ setPage: () => {} })
export const useSetPage = () => useContext(PageContext).setPage

const GLOBAL_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
:root {
  --bg:       #F8F5F0;
  --bgcard:   #FFFFFF;
  --bgsoft:   #F3F0EB;
  --navy:     #1A2B4A;
  --navylt:   #2A3F6A;
  --green:    #0F7A5A;
  --greendk:  #0A5740;
  --greenlt:  #E8F5F0;
  --greengl:  #12A070;
  --saffron:  #E87722;
  --safflt:   #FEF3E7;
  --red:      #DC2626;
  --redlt:    #FEF2F2;
  --amber:    #D97706;
  --amberlt:  #FFFBEB;
  --text:     #1A2B4A;
  --textmd:   #374151;
  --textlt:   #6B7280;
  --border:   #E5E7EB;
  --bordermd: #D1D5DB;
  --shadow:   0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
  --shadowmd: 0 4px 12px rgba(0,0,0,0.1);
}
html, body { height: 100%; }
body { margin: 0; background: var(--bg); font-family: 'Inter', 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; color: var(--text); }
button { cursor: pointer; border: none; outline: none; font-family: inherit; background: none; }
button:active { opacity: 0.85; transform: scale(0.98); }
a { color: var(--green); text-decoration: none; }
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes fadeUp  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
@keyframes popIn   { from { opacity:0; transform:scale(0.5); } to { opacity:1; transform:scale(1); } }
@keyframes slideIn { from { opacity:0; transform:translateX(28px); } to { opacity:1; transform:translateX(0); } }
@keyframes pulse   { 0%,100%{opacity:1;} 50%{opacity:0.4;} }

/* Dashboard & Medicine OS styling */
.glass-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow);
}
.health-card-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.health-card-header h3 {
  font-size: 15px;
  font-weight: 700;
  color: var(--navy);
  margin-bottom: 2px;
}
.card-subtitle {
  font-size: 11.5px;
  color: var(--textlt);
}
.health-display-card {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  overflow: hidden;
  border-left: 4px solid var(--green);
}
.card-top-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--green);
}
.health-card-main-info {
  flex: 1.2;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}
.info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.info-label {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--textlt);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.info-val {
  font-size: 13.5px;
  color: var(--navy);
  font-weight: 600;
}
.highlight-text {
  font-size: 16px;
  font-weight: 800;
  color: var(--green);
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.blood-badge {
  display: inline-block;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--redlt);
  color: var(--red);
  font-weight: 800;
  width: fit-content;
}
.alert-badge {
  display: inline-block;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--safflt);
  color: var(--saffron);
  font-weight: 800;
  width: fit-content;
}
.emergency-contact-box {
  background: var(--bgsoft);
  padding: 8px 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.contact-details {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--navy);
}
.health-card-qr-side {
  flex: 0.8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-width: 120px;
}
.qr-preview-box {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: #fff;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 10px rgba(0,0,0,0.03);
}
.qr-img {
  width: 100px;
  height: 100px;
}
.qr-caption {
  font-size: 9.5px;
  color: var(--textlt);
  font-weight: 600;
}
.card-action-bar {
  width: 100%;
  margin-top: 10px;
}
.btn-primary, .btn-secondary, .btn-tertiary {
  padding: 8px 16px;
  font-size: 12.5px;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary {
  background: var(--green);
  color: #fff;
}
.btn-secondary {
  background: var(--bgsoft);
  color: var(--navy);
  border: 1px solid var(--border);
}
.btn-tertiary {
  background: transparent;
  color: var(--textlt);
}
.btn-primary:hover {
  background: var(--greendk);
}
.btn-secondary:hover {
  background: var(--border);
}
.health-card-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 480px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 11px;
  font-weight: 700;
  color: var(--navy);
}
.form-group input, .form-group select {
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1.5px solid var(--border);
  font-size: 13px;
  outline: none;
  background: #fff;
}
.form-group input:focus, .form-group select:focus {
  border-color: var(--green);
}
.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal-content {
  background: #fff;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  text-align: center;
  animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-content h4 {
  font-size: 16px;
  font-weight: 800;
  color: var(--navy);
  margin-bottom: 6px;
}
.modal-content p {
  font-size: 12px;
  color: var(--textmd);
  margin-bottom: 16px;
}
.large-qr-wrapper {
  background: #fff;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--border);
  display: inline-block;
  margin-bottom: 16px;
}
.large-qr-wrapper img {
  width: 180px;
  height: 180px;
}
.qr-card-data-summary {
  text-align: left;
  background: var(--bgsoft);
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.qr-card-data-summary p {
  margin: 0;
}
.btn-tab {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--textlt);
  background: transparent;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-tab.active {
  color: var(--green);
  background: var(--greenlt);
}
`

export default function App() {
  const [lang, setLang] = useState('en')
  const [page, setPage] = useState('home') // 'home' | 'privacy' | 'terms'

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <PageContext.Provider value={{ setPage }}>
        <style>{GLOBAL_CSS}</style>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" />
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', maxWidth: 540, margin: '0 auto' }}>
          {page === 'home'    && <Scanner />}
          {page === 'privacy' && <PrivacyPolicy onBack={() => setPage('home')} />}
          {page === 'terms'   && <Terms onBack={() => setPage('home')} />}
        </div>
      </PageContext.Provider>
    </LangContext.Provider>
  )
}
