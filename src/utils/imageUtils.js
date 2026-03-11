/**
 * imageUtils.js
 * 
 * Client-side image processing utilities.
 * All processing happens in the browser — no server involved.
 * 
 * compressImage: Reduces file size before sending to Gemini API.
 *   Target: under 1MB for fast upload on 4G connections.
 *   Uses canvas-based compression — no external libraries.
 * 
 * imageToBase64: Converts File/Blob to base64 string for Gemini API.
 */

/**
 * Compress an image file using canvas.
 * 
 * @param {File} file - Source image file
 * @param {Object} options
 * @param {number} options.maxWidthOrHeight - Max dimension in pixels (default: 1200)
 * @param {number} options.maxSizeMB - Max file size in MB (default: 0.9)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.85)
 * @returns {Promise<Blob>} Compressed image blob
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidthOrHeight = 1200,
    maxSizeMB = 0.9,
    quality = 0.85,
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img
      if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
        if (width > height) {
          height = Math.round((height / width) * maxWidthOrHeight)
          width = maxWidthOrHeight
        } else {
          width = Math.round((width / height) * maxWidthOrHeight)
          height = maxWidthOrHeight
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      // White background for PNG→JPEG conversion
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      // Try progressively lower quality until under maxSizeMB
      let currentQuality = quality
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas compression failed'))
              return
            }
            if (blob.size <= maxSizeMB * 1024 * 1024 || currentQuality <= 0.3) {
              resolve(blob)
            } else {
              currentQuality -= 0.1
              tryCompress()
            }
          },
          'image/jpeg',
          currentQuality
        )
      }

      tryCompress()
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      // If compression fails, return original file
      resolve(file)
    }

    img.src = url
  })
}

/**
 * Convert a File or Blob to a base64 string (without data: prefix).
 * 
 * @param {File|Blob} fileOrBlob
 * @returns {Promise<string>} Base64 encoded string
 */
export function imageToBase64(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result is "data:image/jpeg;base64,<data>"
      // We need just the base64 part after the comma
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(fileOrBlob)
  })
}

/**
 * Get the MIME type from a File object.
 * Falls back to 'image/jpeg' for unknown types.
 * 
 * @param {File} file
 * @returns {string} MIME type
 */
export function getMimeType(file) {
  const type = file.type
  if (type && type.startsWith('image/')) return type
  
  // Infer from extension for HEIC files (iOS)
  const ext = file.name?.split('.').pop()?.toLowerCase()
  const mimeMap = {
    heic: 'image/heic',
    heif: 'image/heif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  }
  return mimeMap[ext] || 'image/jpeg'
}
