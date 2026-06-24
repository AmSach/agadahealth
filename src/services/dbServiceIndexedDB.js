// src/services/dbServiceIndexedDB.js
// Transactional IndexedDB Vault Service for high-capacity client-side encrypted bookmarks

const DB_NAME = 'agada_vault_secure';
const STORE_NAME = 'bookmarks_store';
const RECORD_KEY = 'all_bookmarks_cipher';

/**
 * Opens a connection to the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Saves the encrypted bookmarks ciphertext string to IndexedDB.
 * @param {string} cipherText - The salt:iv:ciphertext string.
 * @returns {Promise<boolean>}
 */
export async function saveSecureLogs(cipherText) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(cipherText, RECORD_KEY);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves the encrypted bookmarks ciphertext from IndexedDB.
 * @returns {Promise<string|null>}
 */
export async function getSecureLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(RECORD_KEY);
    
    request.onsuccess = (e) => resolve(e.target.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Clears the secure logs entry from IndexedDB.
 * @returns {Promise<boolean>}
 */
export async function clearSecureLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(RECORD_KEY);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}
