import React, { useState, createContext, useContext } from 'react'
import Scanner from './pages/Scanner.jsx'

export const LangContext = createContext({ lang: 'en', setLang: () => {} })
export const useLang = () => useContext(LangContext)

const GLOBAL_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
:root {
  --void: #07090A; --deep: #0C1210; --panel: #131A14; --panelmd: #192219; --panellt: #1E281E;
  --rim: #243024; --rimlt: #304030;
  --forest: #1A4D2E; --forestmd: #266040; --forestlt: #3A8055; --forestgl: #4DA068;
  --amber: #C88820; --amberlt: #E8A838;
  --terra: #A04030; --terralt: #C85A44;
  --cream: #F0E8D4; --mist: #B0A898; --stone: #706860; --ash: #3A3830;
  --verified: #2A7848; --vbg: #091C10;
}
html, body { height: 100%; }
body { margin: 0; background: #030506; font-family: 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; color: var(--cream); }
button { cursor: pointer; border: none; outline: none; font-family: inherit; background: none; }
button:active { opacity: 0.85; }
a { color: var(--forestgl); text-decoration: none; }
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes spinR   { to { transform: rotate(-360deg); } }
@keyframes fadeUp  { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
@keyframes scanDown { 0%,100% { top:4%; opacity:0; } 6% { opacity:1; } 94% { opacity:1; } 100% { top:92%; opacity:0; } }
@keyframes popIn   { from { opacity:0; transform:scale(0.4); } to { opacity:1; transform:scale(1); } }
@keyframes btnGlow { 0%,100% { opacity:0.7; } 50% { opacity:1; } }
@keyframes slideIn { from { opacity:0; transform:translateX(32px); } to { opacity:1; transform:translateX(0); } }
@keyframes slideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-32px); } }
@keyframes pulse   { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
`

export default function App() {
  const [lang, setLang] = useState('en')
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <style>{GLOBAL_CSS}</style>
      <Scanner />
    </LangContext.Provider>
  )
}
