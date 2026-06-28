import React, { useState, createContext, useContext } from 'react'
import Scanner from './pages/Scanner.jsx'
import DoodleCanvas from './components/DoodleCanvas.jsx'
import PillPet from './components/PillPet.jsx'
import PrivacyPolicy from './pages/PrivacyPolicy.jsx'
import Terms from './pages/Terms.jsx'
import Documentation from './pages/Documentation.jsx'

export const LangContext = createContext({ lang: 'en', setLang: () => {} })
export const useLang = () => useContext(LangContext)
export const PageContext = createContext({ setPage: () => {} })
export const useSetPage = () => useContext(PageContext).setPage

export default function App() {
  const [lang, setLang] = useState('en')
  const [page, setPage] = useState('home')

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <PageContext.Provider value={{ setPage }}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" />
        <div className="app-container" style={{ position: 'relative' }}>
          
          <div className="spiral-binder">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="spiral-ring"></div>
            ))}
          </div>

          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 45,
            width: 2,
            background: 'rgba(229, 57, 70, 0.22)',
            zIndex: 99,
            pointerEvents: 'none'
          }} />

          <div className="notebook-clip"></div>

          <div className="coffee-stain" style={{ top: '150px', right: '40px', transform: 'rotate(12deg) scale(0.9)', pointerEvents: 'none' }}></div>
          <div className="coffee-stain" style={{ bottom: '120px', left: '60px', transform: 'rotate(-40deg) scale(0.7)', pointerEvents: 'none' }}></div>

          <DoodleCanvas />
          <PillPet />

          {page === 'home'    && <Scanner />}
          {page === 'privacy' && <PrivacyPolicy onBack={() => setPage('home')} />}
          {page === 'terms'   && <Terms onBack={() => setPage('home')} />}
          {page === 'docs'    && <Documentation onBack={() => setPage('home')} />}
        </div>
      </PageContext.Provider>
    </LangContext.Provider>
  )
}
