import React, { useEffect, useRef, useState } from 'react'
import { initWasm } from '../services/wasmService.js'

export default function ARScanner({ onCapture, onCancel, t }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  
  const [error, setError] = useState(null)
  const [statusText, setStatusText] = useState('Initializing camera...')
  const [stabilityScore, setStabilityScore] = useState(0) // 0 to 100 for progress ring
  const [wasmInstance, setWasmInstance] = useState(null)
  const [filterMode, setFilterMode] = useState(0) // 0 = none, 1 = binarization, 2 = edges

  // Tracking refs for requestAnimationFrame loop
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const lastCoordsRef = useRef(null) // For smoothing coordinates (EMA)
  const stableFramesCountRef = useRef(0)

  // Initialize WASM and camera stream
  useEffect(() => {
    let active = true

    async function startScanner() {
      try {
        const instance = await initWasm()
        if (!active) return
        if (!instance) throw new Error("Failed to load Wasm computer vision module.")
        setWasmInstance(instance)

        // Request back-facing environment camera
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!active) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute('playsinline', true)
          videoRef.current.play().catch(err => console.error("Video play failed:", err))
        }

        setStatusText('Align medicine strip in guide box...')
      } catch (err) {
        console.error("AR Scanner init error:", err)
        setError(err.message || 'Unable to access environment camera.')
      }
    }

    startScanner()

    return () => {
      active = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Start the frame analysis loop once video starts playing
  const handleCanPlay = () => {
    if (animFrameRef.current) return
    animFrameRef.current = requestAnimationFrame(analyzeFrame)
  }

  // Smooth bounding box coordinates using Exponential Moving Average (EMA)
  const smoothCoords = (newCoords) => {
    if (!lastCoordsRef.current) {
      lastCoordsRef.current = newCoords
      return newCoords
    }
    const alpha = 0.35 // smoothing factor
    const old = lastCoordsRef.current
    const smoothed = {
      minX: old.minX + alpha * (newCoords.minX - old.minX),
      minY: old.minY + alpha * (newCoords.minY - old.minY),
      maxX: old.maxX + alpha * (newCoords.maxX - old.maxX),
      maxY: old.maxY + alpha * (newCoords.maxY - old.maxY),
    }
    smoothed.w = smoothed.maxX - smoothed.minX
    smoothed.h = smoothed.maxY - smoothed.minY
    lastCoordsRef.current = smoothed
    return smoothed
  }

  // Master frame processing and CV analysis loop
  const analyzeFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.paused || video.ended || !wasmInstance) {
      animFrameRef.current = requestAnimationFrame(analyzeFrame)
      return
    }

    const exports = wasmInstance.exports
    const width = video.videoWidth
    const height = video.videoHeight

    if (width === 0 || height === 0) {
      animFrameRef.current = requestAnimationFrame(analyzeFrame)
      return
    }

    // Set canvas dimensions to match the incoming camera aspect
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = canvas.getContext('2d')
    
    // 1. Draw raw frame or Wasm filtered output
    ctx.drawImage(video, 0, 0, width, height)
    const imgData = ctx.getImageData(0, 0, width, height)
    const data = imgData.data

    // Copy JS RGBA buffer into WASM linear memory
    const bufferPtr = exports.getBufferPtr()
    const bufferSize = exports.getBufferSize()

    if (data.length <= bufferSize) {
      const wasmMemory = new Uint8Array(exports.memory.buffer)
      wasmMemory.set(data, bufferPtr)

      // Evaluate motion blur/focus metric in WASM
      const focusScore = exports.computeFocusMetric(width, height)

      // Process Wasm image binarization or Sobel filter if active
      if (filterMode > 0) {
        exports.processImage(width, height, filterMode)
        const outputBuffer = wasmMemory.subarray(bufferPtr, bufferPtr + data.length)
        const outputImgData = new ImageData(new Uint8ClampedArray(outputBuffer), width, height)
        ctx.putImageData(outputImgData, 0, 0)
      }

      // Detect strip coordinates in WASM
      const packedCoords = exports.detectBoundingBox(width, height)
      let cropCoords = null

      if (packedCoords !== 0n) {
        const minY = Number((packedCoords >> 48n) & 0xFFFFn)
        const minX = Number((packedCoords >> 32n) & 0xFFFFn)
        const maxY = Number((packedCoords >> 16n) & 0xFFFFn)
        const maxX = Number(packedCoords & 0xFFFFn)
        cropCoords = smoothCoords({ minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY })
      } else {
        lastCoordsRef.current = null
      }

      // Draw AR Guide overlay indicators
      drawGuides(ctx, width, height, cropCoords, focusScore)
    }

    animFrameRef.current = requestAnimationFrame(analyzeFrame)
  }

  // Draw AR Neon overlays and check auto-trigger thresholds
  const drawGuides = (ctx, width, height, cropCoords, focusScore) => {
    // Focus metric configuration: variance > 10.0 is generally in focus
    const MIN_FOCUS = 8.5
    const isFocused = focusScore > MIN_FOCUS

    // Guide center rectangle reference
    const guideW = Math.round(width * 0.7)
    const guideH = Math.round(height * 0.45)
    const guideX = Math.round((width - guideW) / 2)
    const guideY = Math.round((height - guideH) / 2)

    // Draw central target frame
    ctx.strokeStyle = isFocused ? '#10B981' : 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 4
    ctx.setLineDash([15, 10])
    ctx.strokeRect(guideX, guideY, guideW, guideH)
    ctx.setLineDash([])

    // Check if a bounding box is detected
    if (cropCoords && cropCoords.w > 80 && cropCoords.h > 80) {
      // Draw neon bounding box around medicine strip
      ctx.strokeStyle = isFocused ? '#10B981' : '#F59E0B'
      ctx.lineWidth = 3
      ctx.shadowBlur = 12
      ctx.shadowColor = isFocused ? '#10B981' : '#F59E0B'
      ctx.strokeRect(cropCoords.minX, cropCoords.minY, cropCoords.w, cropCoords.h)
      ctx.shadowBlur = 0 // reset shadow

      // Size check: strip should occupy a reasonable portion of the target area
      const isInside = cropCoords.minX > guideX - 40 && 
                       cropCoords.maxX < guideX + guideW + 40 &&
                       cropCoords.minY > guideY - 40 &&
                       cropCoords.maxY < guideY + guideH + 40
      
      const isGoodSize = cropCoords.w > width * 0.4

      if (!isFocused) {
        setStatusText('Focusing... hold steady')
        stableFramesCountRef.current = Math.max(0, stableFramesCountRef.current - 1)
      } else if (!isGoodSize) {
        setStatusText('Move camera closer to medicine strip')
        stableFramesCountRef.current = Math.max(0, stableFramesCountRef.current - 1)
      } else if (!isInside) {
        setStatusText('Align strip inside the target box')
        stableFramesCountRef.current = Math.max(0, stableFramesCountRef.current - 1)
      } else {
        setStatusText('Capturing... hold completely still')
        stableFramesCountRef.current += 1
      }
    } else {
      setStatusText('Align medicine strip in guide box...')
      stableFramesCountRef.current = Math.max(0, stableFramesCountRef.current - 1)
    }

    // Set stability score progress (e.g. requires 8 consecutive frames for auto-capture)
    const thresholdFrames = 8
    const progress = Math.min(100, Math.round((stableFramesCountRef.current / thresholdFrames) * 100))
    setStabilityScore(progress)

    // Trigger auto-capture when stable criteria is met
    if (stableFramesCountRef.current >= thresholdFrames) {
      triggerCapture(cropCoords)
    }
  }

  // Trigger frame extraction and capture
  const triggerCapture = (cropCoords) => {
    // Cancel loop
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = null

    // Extract captured frame
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    // Stop streams
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }

    let finalCanvas = canvas
    
    // Crop if a valid coordinates box is available
    if (cropCoords && cropCoords.w > 100 && cropCoords.h > 100) {
      const cropCanvas = document.createElement('canvas')
      cropCanvas.width = cropCoords.w
      cropCanvas.height = cropCoords.h
      const cropCtx = cropCanvas.getContext('2d')
      
      // Draw cropped section from main canvas
      cropCtx.drawImage(canvas, cropCoords.minX, cropCoords.minY, cropCoords.w, cropCoords.h, 0, 0, cropCoords.w, cropCoords.h)
      finalCanvas = cropCanvas
    }

    const base64 = finalCanvas.toDataURL('image/jpeg', 0.7).split(',')[1]
    onCapture(base64)
  }

  const handleManualCapture = () => {
    triggerCapture(lastCoordsRef.current)
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', color: '#fff', padding: 24, textAlign: 'center' }}>
        <span style={{ fontSize: 40, marginBottom: 12 }}>📷</span>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Camera Access Failed</div>
        <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>{error}</p>
        <button onClick={onCancel} style={{ background: '#fff', color: 'var(--navy)', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          Use Manual Upload
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden', minHeight: '80vh' }}>
      
      {/* Video stream container */}
      <video ref={videoRef} onCanPlay={handleCanPlay} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
      
      {/* Canvas overlays */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 2 }} />

      {/* Interface Guides overlay */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)', padding: '24px 18px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        
        {/* Status text banner */}
        <div style={{ 
          background: 'rgba(26,43,74,0.75)', 
          backdropFilter: 'blur(8px)',
          borderRadius: 20, 
          padding: '8px 16px', 
          color: '#fff', 
          fontSize: 12.5, 
          fontWeight: 600,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          textAlign: 'center'
        }}>
          {statusText}
        </div>

        {/* Dynamic auto-capture progress indicator */}
        {stabilityScore > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 140, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${stabilityScore}%`, height: '100%', background: '#10B981', transition: 'width 0.15s ease' }} />
            </div>
            <span style={{ color: '#10B981', fontSize: 11, fontWeight: 700 }}>{stabilityScore}%</span>
          </div>
        )}

        {/* Control toolbar */}
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 8 }}>
          
          {/* Cancel */}
          <button onClick={onCancel} style={{ flex: 1, height: 46, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600 }}>
            Cancel
          </button>

          {/* Manual Shutter Button */}
          <button onClick={handleManualCapture} style={{ 
            width: 62, 
            height: 62, 
            borderRadius: '50%', 
            background: '#fff', 
            border: '4px solid rgba(255,255,255,0.35)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            cursor: 'pointer'
          }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--green)' }} />
          </button>

          {/* Filter options toggle */}
          <button onClick={() => setFilterMode(m => (m + 1) % 3)} style={{ 
            flex: 1, 
            height: 46, 
            background: filterMode > 0 ? 'var(--greenlt)' : 'rgba(255,255,255,0.1)', 
            border: `1.5px solid ${filterMode > 0 ? 'var(--green)' : 'rgba(255,255,255,0.15)'}`, 
            borderRadius: 12, 
            color: filterMode > 0 ? 'var(--greendk)' : '#fff', 
            fontSize: 12, 
            fontWeight: 600 
          }}>
            {filterMode === 0 ? 'No CV Filter' : (filterMode === 1 ? 'CV: Binary' : 'CV: Edges')}
          </button>

        </div>
      </div>

    </div>
  )
}
