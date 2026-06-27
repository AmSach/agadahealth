

const DB_NAME = 'agada_vault_secure';
const DB_VERSION = 3;
const STORE_NAME = 'bookmarks_store';
const CACHE_STORE_NAME = 'catalog_cache';
const PROFILES_STORE_NAME = 'profiles_store';
const RECORD_KEY = 'all_bookmarks_cipher';

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

