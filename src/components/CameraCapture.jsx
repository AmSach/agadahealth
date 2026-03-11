/**
 * CameraCapture.jsx
 * 
 * Handles image capture via mobile camera or file upload.
 * 
 * Mobile: Uses the native camera API via <input capture="environment">
 *   — opens the rear camera directly on iOS and Android
 *   — no permission dialog required (browser handles it)
 *   — works in Safari, Chrome, Firefox on mobile
 * 
 * Desktop: Falls back to file picker (upload from disk)
 * 
 * Privacy: No camera feed is ever shown or stored.
 * The captured JPEG is immediately passed to the parent for processing.
 */

import React, { useRef, useState, useCallback } from 'react'

export default function CameraCapture({ onImageCaptured }) {
  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileSelected = useCallback((file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, HEIC).')
      return
    }

    // Validate file size (max 15MB before compression)
    if (file.size > 15 * 1024 * 1024) {
      alert('Image is too large. Please use an image under 15MB.')
      return
    }

    onImageCaptured(file)
  }, [onImageCaptured])

  const handleCameraInput = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
    // Reset input so the same file can be re-selected after error
    e.target.value = ''
  }, [handleFileSelected])

  // Drag and drop support (desktop)
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelected(file)
  }, [handleFileSelected])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  return (
    <div className="w-full">
      {/* Primary: Camera button */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        className="w-full bg-agada-green text-white py-5 px-6 rounded-2xl font-bold text-xl
          hover:bg-agada-green-dark active:scale-95 transition-all shadow-card-hover
          flex items-center justify-center gap-3"
        aria-label="Open camera to scan medicine"
      >
        <CameraIcon />
        <span>Scan Medicine</span>
      </button>

      {/* Hidden camera input — capture="environment" opens rear camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraInput}
        className="hidden"
        aria-hidden="true"
      />

      {/* Secondary: Upload from gallery */}
      <div
        className={`mt-3 border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer
          transition-all duration-200
          ${isDragOver 
            ? 'border-agada-green bg-green-50' 
            : 'border-gray-300 bg-white hover:border-agada-green hover:bg-green-50'}`}
        onClick={() => uploadInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        aria-label="Upload medicine photo from gallery"
        onKeyDown={(e) => e.key === 'Enter' && uploadInputRef.current?.click()}
      >
        <div className="text-3xl mb-2">🖼️</div>
        <p className="text-sm font-semibold text-gray-600">Upload from Gallery</p>
        <p className="text-xs text-gray-400 mt-1">or drag & drop a photo here</p>
        <p className="text-xs text-gray-300 mt-1">JPG, PNG, HEIC · up to 15MB</p>
      </div>

      {/* Hidden upload input — no capture attribute = opens file picker */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleCameraInput}
        className="hidden"
        aria-hidden="true"
      />

      {/* Tips */}
      <div className="mt-4 bg-white rounded-xl p-3 border border-gray-100">
        <p className="text-xs font-semibold text-gray-600 mb-1">📸 For best results:</p>
        <ul className="text-xs text-gray-500 space-y-0.5">
          <li>• Ensure the brand name and dosage are clearly visible</li>
          <li>• Hold the camera steady and use good lighting</li>
          <li>• Photograph the front face of the strip/box</li>
        </ul>
      </div>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
    </svg>
  )
}
