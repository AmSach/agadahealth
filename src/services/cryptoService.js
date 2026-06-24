// src/services/cryptoService.js
// Client-side Zero-Knowledge Cryptographic Manager using native Web Crypto API (AES-256-GCM)

// Helper to convert ArrayBuffer to Hex string
function bufToHex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Helper to convert Hex string to ArrayBuffer
function hexToBuf(hexString) {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Derives a cryptographic key from a PIN/password and salt using PBKDF2.
 * @param {string} pin - User password or pin code.
 * @param {ArrayBuffer} salt - Cryptographic salt.
 * @returns {Promise<CryptoKey>} - AES-GCM 256-bit key.
 */
async function deriveKey(pin, salt) {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);

  // Import the raw password material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive the AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // Industry standard iterations
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a text payload using AES-256-GCM.
 * @param {string} plaintext - Raw text/JSON to encrypt.
 * @param {string} pin - User's PIN/password.
 * @returns {Promise<string>} - Ciphertext packed as saltHex:ivHex:ciphertextHex.
 */
export async function encryptData(plaintext, pin) {
  try {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(plaintext);

    // Generate random Salt (16 bytes) and Initialization Vector (12 bytes)
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key
    const key = await deriveKey(pin, salt);

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBytes
    );

    // Pack into a single string for storage
    const saltHex = bufToHex(salt);
    const ivHex = bufToHex(iv);
    const ciphertextHex = bufToHex(ciphertext);

    return `${saltHex}:${ivHex}:${ciphertextHex}`;
  } catch (err) {
    console.error("Encryption failed:", err);
    throw new Error("Zero-Knowledge Encryption failed.");
  }
}

/**
 * Decrypts a packed ciphertext string using AES-256-GCM.
 * @param {string} packedCiphertext - packed as saltHex:ivHex:ciphertextHex.
 * @param {string} pin - User's PIN/password.
 * @returns {Promise<string>} - Original plaintext.
 */
export async function decryptData(packedCiphertext, pin) {
  try {
    const parts = packedCiphertext.split(':');
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted format.");
    }

    const salt = new Uint8Array(hexToBuf(parts[0]));
    const iv = new Uint8Array(hexToBuf(parts[1]));
    const ciphertext = hexToBuf(parts[2]);

    // Derive key using the same salt and iterations
    const key = await deriveKey(pin, salt);

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error("Decryption failed:", err);
    throw new Error("Incorrect PIN or tampered cryptographic storage.");
  }
}
