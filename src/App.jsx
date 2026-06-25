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
  --bg:       #FAF9F6;
  --bgcard:   #FFFFFF;
  --bgsoft:   #F4F1EA;
  --navy:     #0F1E36;
  --navylt:   #1E2E4A;
  --green:    #0D8A68;
  --greendk:  #085E46;
  --greenlt:  #E8F6F1;
  --greengl:  #10B981;
  --saffron:  #F28C38;
  --safflt:   #FFF6EC;
  --red:      #E11D48;
  --redlt:    #FFF1F2;
  --amber:    #F59E0B;
  --amberlt:  #FEF3C7;
  --text:     #0F1E36;
  --textmd:   #374151;
  --textlt:   #6B7280;
  --border:   #E5E7EB;
  --bordermd: #D1D5DB;
  --shadow:   0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  --shadowmd: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
  --shadowlg: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
html, body { height: 100%; }
body { margin: 0; background: var(--bg); font-family: 'DM Sans', 'Inter', sans-serif; -webkit-font-smoothing: antialiased; color: var(--text); }
button { cursor: pointer; border: none; outline: none; font-family: inherit; background: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
button:active { opacity: 0.85; transform: scale(0.97); }
a { color: var(--green); text-decoration: none; }

@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
@keyframes popIn   { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
@keyframes slideIn { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
@keyframes pulse   { 0%,100%{opacity:1;} 50%{opacity:0.5;} }

/* Premium Cards */
.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  padding: 20px;
  box-shadow: var(--shadowmd);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.health-card-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.health-card-header h3 {
  font-size: 17px;
  font-weight: 800;
  color: var(--navy);
  margin-bottom: 4px;
}
.card-subtitle {
  font-size: 12px;
  color: var(--textlt);
}

/* Premium Wallet Card */
.emergency-wallet-card {
  position: relative;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 20px;
  color: #fff;
  overflow: hidden;
  box-shadow: var(--shadowlg);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}
.emergency-wallet-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
.wallet-card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at 80% 20%, rgba(225, 29, 72, 0.15) 0%, transparent 50%);
  pointer-events: none;
}
.wallet-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.wallet-logo {
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.05em;
  color: #fda4af;
  display: flex;
  align-items: center;
  gap: 6px;
}
.wallet-logo-icon {
  width: 10px;
  height: 10px;
  background: var(--red);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--red);
  animation: pulse 2s infinite;
}
.wallet-type {
  font-size: 10px;
  font-weight: 700;
  background: rgba(225, 29, 72, 0.2);
  color: #fca5a5;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid rgba(225, 29, 72, 0.3);
  letter-spacing: 0.05em;
}
.wallet-body {
  padding: 20px;
  display: flex;
  gap: 16px;
  align-items: center;
}
.wallet-info-side {
  flex: 1.2;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wallet-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wallet-label {
  font-size: 8.5px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.wallet-value {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}
.wallet-value.highlight {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}
.wallet-blood-badge {
  background: var(--red);
  color: #fff;
  padding: 2px 10px;
  border-radius: 6px;
  font-weight: 800;
  font-size: 13px;
  display: inline-block;
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.4);
}
.wallet-allergies-badge {
  background: #d97706;
  color: #fff;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 11.5px;
  display: inline-block;
}
.wallet-qr-side {
  flex: 0.8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.wallet-qr-box {
  background: #fff;
  padding: 8px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.wallet-qr-box:hover {
  transform: scale(1.04);
}
.wallet-qr-img {
  width: 90px;
  height: 90px;
  display: block;
}
.wallet-qr-caption {
  font-size: 9px;
  color: #94a3b8;
  font-weight: 600;
  text-align: center;
}
.wallet-footer {
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0,0,0,0.15);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.wallet-contact-name {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}
.wallet-contact-phone {
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
}

/* Premium Form Elements */
.health-card-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 480px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 12px;
  font-weight: 700;
  color: var(--navy);
  display: flex;
  align-items: center;
  gap: 4px;
}
.form-group input, .form-group select {
  height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  font-size: 14px;
  color: var(--navy);
  outline: none;
  background: #fff;
  transition: all 0.2s;
}
.form-group input:focus, .form-group select:focus {
  border-color: var(--green);
  box-shadow: 0 0 0 3px rgba(13, 138, 104, 0.12);
}
.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 10px;
}

/* Segmented Controls for PK Simulator */
.segmented-control {
  display: flex;
  background: var(--bgsoft);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--border);
  gap: 2px;
  width: 100%;
}
.segmented-btn {
  flex: 1;
  padding: 8px 6px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
  color: var(--textlt);
  text-align: center;
  background: transparent;
  transition: all 0.2s ease;
}
.segmented-btn.active {
  background: #fff;
  color: var(--navy);
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

/* Dashboard Tabs */
.btn-tab {
  font-size: 12.5px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 10px;
  color: var(--textlt);
  background: transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  border: 1.5px solid transparent;
}
.btn-tab.active {
  color: var(--green);
  background: var(--greenlt);
  border-color: rgba(13, 138, 104, 0.2);
}

/* Action Buttons */
.btn-primary, .btn-secondary, .btn-tertiary {
  padding: 10px 20px;
  font-size: 13.5px;
  font-weight: 700;
  border-radius: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn-primary {
  background: linear-gradient(135deg, var(--green), #0a7356);
  color: #fff;
  box-shadow: 0 4px 12px rgba(13, 138, 104, 0.2);
}
.btn-primary:hover {
  box-shadow: 0 6px 16px rgba(13, 138, 104, 0.3);
  transform: translateY(-1px);
}
.btn-secondary {
  background: var(--bgsoft);
  color: var(--navy);
  border: 1.5px solid var(--border);
}
.btn-secondary:hover {
  background: var(--border);
}
.btn-tertiary {
  background: transparent;
  color: var(--textlt);
}
.btn-tertiary:hover {
  color: var(--navy);
}

/* Modern Pill Stock Progress Bar */
.stock-bar-container {
  width: 100%;
  height: 8px;
  background: var(--border);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  margin-top: 4px;
}
.stock-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.4s;
}

/* Large QR Overlay Modal */
.qr-large-modal {
  max-width: 360px;
  border-radius: 24px;
  padding: 24px;
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
