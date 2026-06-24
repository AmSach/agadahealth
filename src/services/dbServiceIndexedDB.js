// src/services/dbServiceIndexedDB.js
// Transactional IndexedDB Vault Service for high-capacity client-side encrypted bookmarks and catalog caches

const DB_NAME = 'agada_vault_secure';
const DB_VERSION = 3;
const STORE_NAME = 'bookmarks_store';
const CACHE_STORE_NAME = 'catalog_cache';
const PROFILES_STORE_NAME = 'profiles_store';
const RECORD_KEY = 'all_bookmarks_cipher';

/**
 * Opens a connection to the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PROFILES_STORE_NAME)) {
        db.createObjectStore(PROFILES_STORE_NAME);
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
 * Clears the secure bookmarks logs entry from IndexedDB.
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

/**
 * Caches a raw CSV database catalog text locally.
 * @param {string} key - e.g. "cdsco" or "jan_aushadhi"
 * @param {string} text - The CSV string
 * @returns {Promise<boolean>}
 */
export async function cacheCSVDatabase(key, text) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CACHE_STORE_NAME);
    const request = store.put(text, key);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves a cached CSV database catalog text from IndexedDB.
 * @param {string} key - e.g. "cdsco" or "jan_aushadhi"
 * @returns {Promise<string|null>}
 */
export async function getCachedCSVDatabase(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
    const store = tx.objectStore(CACHE_STORE_NAME);
    const request = store.get(key);
    
    request.onsuccess = (e) => resolve(e.target.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Saves encrypted profile data.
 * @param {string} profileId
 * @param {string} cipherText - salt:iv:ciphertext
 * @returns {Promise<boolean>}
 */
export async function saveEncryptedProfile(profileId, cipherText) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PROFILES_STORE_NAME);
    const request = store.put(cipherText, profileId);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves encrypted profile data.
 * @param {string} profileId
 * @returns {Promise<string|null>}
 */
export async function getEncryptedProfile(profileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE_NAME, 'readonly');
    const store = tx.objectStore(PROFILES_STORE_NAME);
    const request = store.get(profileId);
    
    request.onsuccess = (e) => resolve(e.target.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves all profile IDs currently stored.
 * @returns {Promise<string[]>}
 */
export async function listProfileIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE_NAME, 'readonly');
    const store = tx.objectStore(PROFILES_STORE_NAME);
    const request = store.getAllKeys();
    
    request.onsuccess = (e) => resolve(e.target.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Deletes a profile record.
 * @param {string} profileId
 * @returns {Promise<boolean>}
 */
export async function deleteProfile(profileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PROFILES_STORE_NAME);
    const request = store.delete(profileId);
    
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

