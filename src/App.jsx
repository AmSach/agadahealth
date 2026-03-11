import React from 'react'
import Scanner from './pages/Scanner.jsx'

const styles = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #F8F5F0; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
  button { cursor: pointer; border: none; outline: none; }
  button:active { transform: scale(0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .slide-up { animation: slideUp 0.35s ease-out both; }
  .fade-in { animation: fadeIn 0.25s ease-out both; }
`

export default function App() {
  return (
    <>
      <style>{styles}</style>
      <Scanner />
    </>
  )
}
