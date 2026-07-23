// Study Vault — IndexedDB Cache (cache.js)
// Caches recently opened files and the search index for offline access

const DB_NAME = 'StudyVaultCache';
const DB_VERSION = 1;
const STORE_FILES = 'cachedFiles';
const STORE_INDEX = 'searchIndex';
const STORE_PREFS = 'prefs';
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100 MB max cached files
const MAX_CACHED_FILES = 20;

let _db = null;

// ---- Open DB ----
async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('size', 'size');
      }

      if (!db.objectStoreNames.contains(STORE_INDEX)) {
        db.createObjectStore(STORE_INDEX, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// ---- Helper: Run transaction ----
async function runTx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// File Cache
// ============================================================

// ---- Cache a file buffer ----
export async function cacheFile(id, name, buffer, size) {
  try {
    // Evict old files if needed
    await evictIfNeeded(size);

    await runTx(STORE_FILES, 'readwrite', (store) =>
      store.put({
        id,
        name,
        buffer,
        size: size || buffer.byteLength,
        timestamp: Date.now(),
      })
    );
  } catch (err) {
    console.warn('[Cache] Failed to cache file:', err);
  }
}

// ---- Get cached file ----
export async function getCachedFile(id) {
  try {
    return await runTx(STORE_FILES, 'readonly', (store) => store.get(id));
  } catch (_) {
    return null;
  }
}

// ---- Remove cached file ----
export async function removeCachedFile(id) {
  try {
    await runTx(STORE_FILES, 'readwrite', (store) => store.delete(id));
  } catch (_) {}
}

// ---- Get all cached file IDs ----
export async function getCachedFileIds() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (_) {
    return [];
  }
}

// ---- Evict oldest files if over quota ----
async function evictIfNeeded(newFileSize = 0) {
  try {
    const db = await openDB();
    const all = await new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const totalSize = all.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalCount = all.length;

    // Sort by timestamp (oldest first)
    all.sort((a, b) => a.timestamp - b.timestamp);

    let currentSize = totalSize;
    let i = 0;

    while (i < all.length && (currentSize + newFileSize > MAX_CACHE_SIZE || totalCount - i >= MAX_CACHED_FILES)) {
      await removeCachedFile(all[i].id);
      currentSize -= (all[i].size || 0);
      i++;
    }
  } catch (_) {}
}

// ============================================================
// Search Index
// ============================================================

// ---- Save search index ----
export async function saveSearchIndex(nodes) {
  try {
    await runTx(STORE_INDEX, 'readwrite', (store) =>
      store.put({ key: 'nodes', data: nodes, ts: Date.now() })
    );
  } catch (err) {
    console.warn('[Cache] Failed to save search index:', err);
  }
}

// ---- Load search index ----
export async function loadSearchIndex() {
  try {
    const entry = await runTx(STORE_INDEX, 'readonly', (store) => store.get('nodes'));
    return entry?.data || [];
  } catch (_) {
    return [];
  }
}

// ---- Clear search index ----
export async function clearSearchIndex() {
  try {
    await runTx(STORE_INDEX, 'readwrite', (store) => store.delete('nodes'));
  } catch (_) {}
}

// ============================================================
// Preferences
// ============================================================

// ---- Save a preference ----
export async function savePref(key, value) {
  try {
    await runTx(STORE_PREFS, 'readwrite', (store) => store.put({ key, value }));
  } catch (_) {}
}

// ---- Load a preference ----
export async function loadPref(key, defaultValue = null) {
  try {
    const entry = await runTx(STORE_PREFS, 'readonly', (store) => store.get(key));
    return entry !== undefined ? entry?.value : defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

// ---- Upload queue (offline pending uploads) ----
export async function addToUploadQueue(item) {
  try {
    const queue = await loadUploadQueue();
    queue.push({ ...item, queuedAt: Date.now() });
    await runTx(STORE_PREFS, 'readwrite', (store) => store.put({ key: 'uploadQueue', value: queue }));
  } catch (_) {}
}

export async function loadUploadQueue() {
  return (await loadPref('uploadQueue', [])) || [];
}

export async function clearUploadQueue() {
  await savePref('uploadQueue', []);
}

// ---- Clear all cache (on logout) ----
export async function clearAllCache() {
  try {
    const db = await openDB();
    const storeNames = [STORE_FILES, STORE_INDEX, STORE_PREFS];
    for (const name of storeNames) {
      await new Promise((resolve) => {
        const tx = db.transaction(name, 'readwrite');
        const req = tx.objectStore(name).clear();
        req.onsuccess = resolve;
        req.onerror = resolve;
      });
    }
  } catch (_) {}
}
