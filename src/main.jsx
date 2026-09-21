import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import App from './App.jsx'
import './index.css'

try {
  inject()
} catch (e) {
  console.warn('Vercel Analytics blocked or failed to load:', e)
}

try {
  injectSpeedInsights()
} catch (e) {
  console.warn('Vercel Speed Insights blocked or failed to load:', e)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
