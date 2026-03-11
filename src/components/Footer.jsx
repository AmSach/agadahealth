/**
 * Footer.jsx
 */

import React from 'react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-agada-navy text-gray-300 mt-auto">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Top: brand */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-agada-green rounded-md flex items-center justify-center text-sm font-black text-white">
            अ
          </div>
          <div>
            <span className="font-bold text-white">Agada</span>
            <span className="text-xs text-gray-400 ml-2">· Sanskrit for "Free from disease"</span>
          </div>
        </div>

        {/* Government sources */}
        <p className="text-xs text-gray-400 mb-2">
          Data sourced from: CDSCO (cdscoonline.gov.in) · Jan Aushadhi/BPPI (janaushadhi.gov.in) · NPPA (nppaindia.nic.in)
        </p>
        <p className="text-xs text-gray-400 mb-3">
          Built with: React 18 · Vite · Supabase · Google Gemini 1.5 Flash · Vercel
        </p>

        {/* Links */}
        <div className="flex flex-wrap gap-3 text-xs mb-3">
          <Link to="/about" className="hover:text-white transition-colors">About</Link>
          <Link to="/how-it-works" className="hover:text-white transition-colors">How it works</Link>
          <Link to="/disclaimer" className="hover:text-white transition-colors">Medical Disclaimer</Link>
          <a href="https://github.com/agada-health/agada" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
            GitHub ↗
          </a>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-500 border-t border-gray-700 pt-3">
          Agada is an information tool only. It does not provide medical advice, diagnoses, or prescriptions. 
          Always consult a licensed pharmacist or doctor before changing medication. 
          CDSCO verification is real-time against publicly available government data.
        </p>

        <p className="text-xs text-gray-600 mt-2">
          Team Agada · Open Innovation 2026 · India Innovates
        </p>
      </div>
    </footer>
  )
}
