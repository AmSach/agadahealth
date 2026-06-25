// src/services/wasmService.js
// Client-side WebAssembly Image Pre-processing Manager

let wasmInstance = null;

/**
 * Initializes the AssemblyScript WebAssembly module.
 */
export async function initWasm() {
  if (wasmInstance) return wasmInstance;
  try {
    // Fetch and compile the WASM binary from the public directory
    const response = await fetch('/image_processor.wasm');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: {
        abort: (msg, file, line, col) => {
          console.error(`Wasm aborted at ${file}:${line}:${col} - msg: ${msg}`);
        }
      }
    });
    wasmInstance = instance;
    return wasmInstance;
  } catch (err) {
    console.error("Failed to initialize WebAssembly image processor:", err);
    return null;
  }
}

/**
 * Processes an image using the WASM module.
 * @param {File|Blob|string} imageSource - The source file, blob, or object URL of the image.
 * @param {number} filterType - 1 = Adaptive Binarization, 2 = Sobel Edge Detection, 3 = Contrast Stretching
 * @returns {Promise<{ base64: string, width: number, height: number, cropCoords: any }>}
 */
export async function processImageWasm(imageSource, filterType = 1) {
  const instance = await initWasm();
  if (!instance) {
    throw new Error("WebAssembly module is not initialized.");
  }

  // Load the image into an Image object
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
    
    img.onload = () => {
      try {
        if (typeof imageSource !== 'string') {
          URL.revokeObjectURL(objectUrl);
        }

        // Keep dimensions within WASM bounds (max 2048x2048)
        let { width, height } = img;
        const MAX_DIM = 1200; // Optimal speed / resolution trade-off
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height / width) * MAX_DIM);
            width = MAX_DIM;
          } else {
            width = Math.round((width / height) * MAX_DIM);
            height = MAX_DIM;
          }
        }

        // Draw onto temporary canvas to retrieve RGBA pixel buffer
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data; // Uint8ClampedArray representing RGBA

        // Get WASM exports
        const exports = instance.exports;
        const bufferPtr = exports.getBufferPtr();
        const bufferSize = exports.getBufferSize();

        // Ensure data fits in WASM memory
        if (data.length > bufferSize) {
          reject(new Error("Image size exceeds WebAssembly memory limit."));
          return;
        }

        // Copy JS image data to WASM linear memory
        const wasmMemory = new Uint8Array(exports.memory.buffer);
        wasmMemory.set(data, bufferPtr);

        // Execute WASM filter (in-place modification of WASM memory)
        exports.processImage(width, height, filterType);

        // Detect bounding box of the medicine strip
        const packedCoords = exports.detectBoundingBox(width, height);
        let cropCoords = null;
        if (packedCoords !== 0n) {
          // Unpack coordinates from 64-bit integer
          // format: (minY << 48) | (minX << 32) | (maxY << 16) | maxX
          const minY = Number((packedCoords >> 48n) & 0xFFFFn);
          const minX = Number((packedCoords >> 32n) & 0xFFFFn);
          const maxY = Number((packedCoords >> 16n) & 0xFFFFn);
          const maxX = Number(packedCoords & 0xFFFFn);
          
          cropCoords = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
        }

        // Copy results back from WASM memory to Canvas
        const outputBuffer = wasmMemory.subarray(bufferPtr, bufferPtr + data.length);
        const outputImgData = new ImageData(new Uint8ClampedArray(outputBuffer), width, height);
        
        // If crop coordinates are valid, crop the canvas to just the medicine strip
        let finalCanvas = canvas;
        if (cropCoords && cropCoords.w > 50 && cropCoords.h > 50) {
          finalCanvas = document.createElement('canvas');
          finalCanvas.width = cropCoords.w;
          finalCanvas.height = cropCoords.h;
          const cropCtx = finalCanvas.getContext('2d');
          
          // Put the processed image data first, then crop
          ctx.putImageData(outputImgData, 0, 0);
          cropCtx.drawImage(canvas, cropCoords.minX, cropCoords.minY, cropCoords.w, cropCoords.h, 0, 0, cropCoords.w, cropCoords.h);
        } else {
          ctx.putImageData(outputImgData, 0, 0);
        }

        // Convert cropped/processed canvas to ultra-compact JPEG (aggressive compression for network payload)
        // Compression ratio 0.65 for high readability of text, but extremely small kilobyte footprints.
        const base64 = finalCanvas.toDataURL('image/jpeg', 0.65).split(',')[1];
        
        resolve({
          base64,
          width: finalCanvas.width,
          height: finalCanvas.height,
          cropCoords
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      if (typeof imageSource !== 'string') {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error("Failed to load image element for Wasm processing."));
    };

    img.src = objectUrl;
  });
}
