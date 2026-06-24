// src/wasm/image_processor.worker.js
// Dedicated Web Worker for off-thread WebAssembly image pre-processing and focus analytics

let wasmInstance = null;

self.onmessage = async function(e) {
  const { type } = e.data;
  
  if (type === 'init') {
    const { wasmBytes } = e.data;
    try {
      const { instance } = await WebAssembly.instantiate(wasmBytes, {
        env: {
          abort: (msg, file, line, col) => {
            console.error(`Wasm Worker aborted at ${file}:${line}:${col} - msg: ${msg}`);
          }
        }
      });
      wasmInstance = instance;
      self.postMessage({ type: 'initialized', success: true });
    } catch (err) {
      self.postMessage({ type: 'initialized', success: false, error: err.message });
    }
  } else if (type === 'process') {
    if (!wasmInstance) {
      self.postMessage({ type: 'error', error: 'Wasm not initialized in worker' });
      return;
    }
    
    const { filterType, width, height, data } = e.data;
    
    // Get WASM exports
    const exports = wasmInstance.exports;
    const bufferPtr = exports.getBufferPtr();
    const bufferSize = exports.getBufferSize();
    
    if (data.length > bufferSize) {
      self.postMessage({ type: 'error', error: 'Image size exceeds WebAssembly memory limit.' });
      return;
    }
    
    // Copy image data to WASM linear memory
    const wasmMemory = new Uint8Array(exports.memory.buffer);
    wasmMemory.set(data, bufferPtr);
    
    // Execute filter
    exports.processImage(width, height, filterType);
    
    // Calculate focus metric
    let focusMetric = 0;
    if (exports.computeFocusMetric) {
      focusMetric = exports.computeFocusMetric(width, height);
    }
    
    // Detect bounding box of the medicine strip
    const packedCoords = exports.detectBoundingBox(width, height);
    let cropCoords = null;
    if (packedCoords !== 0n) {
      const minY = Number((packedCoords >> 48n) & 0xFFFFn);
      const minX = Number((packedCoords >> 32n) & 0xFFFFn);
      const maxY = Number((packedCoords >> 16n) & 0xFFFFn);
      const maxX = Number(packedCoords & 0xFFFFn);
      
      cropCoords = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    }
    
    // Extract output buffer
    const outputBuffer = new Uint8Array(exports.memory.buffer, bufferPtr, data.length);
    const outputCopy = new Uint8Array(outputBuffer); // Make a copy to transfer ownership
    
    self.postMessage({
      type: 'processed',
      data: outputCopy,
      width,
      height,
      cropCoords,
      focusMetric
    }, [outputCopy.buffer]); // Transfer buffer for 0-copy performance
  }
};
