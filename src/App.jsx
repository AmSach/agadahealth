import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import LoadingSpinner from './components/LoadingSpinner.jsx'

// Code-split routes for optimal loading performance
const ScannerPage = React.lazy(() => import('./pages/ScannerPage.jsx'))
const AboutPage = React.lazy(() => import('./pages/AboutPage.jsx'))
const HowItWorksPage = React.lazy(() => import('./pages/HowItWorksPage.jsx'))
const DisclaimerPage = React.lazy(() => import('./pages/DisclaimerPage.jsx'))

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-agada-cream flex flex-col">
          <Header />
          <main className="flex-1">
            <Suspense fallback={<LoadingSpinner message="Loading..." />}>
              <Routes>
                <Route path="/" element={<ScannerPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/disclaimer" element={<DisclaimerPage />} />
                {/* Catch-all */}
                <Route path="*" element={<ScannerPage />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
