import React, { useState, createContext, useContext } from 'react'
import Scanner from './pages/Scanner.jsx'

export const LangContext = createContext({ lang: 'en', setLang: () => {} })
export const useLang = () => useContext(LangContext)

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
`

export default function App() {
  const [lang, setLang] = useState('en')
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <style>{GLOBAL_CSS}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" />
      <Scanner />
    </LangContext.Provider>
  )
}
