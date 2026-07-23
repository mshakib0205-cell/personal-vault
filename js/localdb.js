// Study Vault — Local IndexedDB File System Engine (localdb.js)
// Replaces MEGA entirely. All files stored on-device.

const DB_NAME = 'StudyVaultFS';
const DB_VERSION = 1;
export const ROOT_ID = 'root';

let _db = null;

// ---- Open / Init DB ----
export async function initDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('nodes')) {
        const ns = db.createObjectStore('nodes', { keyPath: 'id' });
        ns.createIndex('parentId', 'parentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('filedata')) {
        db.createObjectStore('filedata', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('prefs')) {
        db.createObjectStore('prefs', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(new Error('Failed to open local database'));
  });
}

// ---- Ensure Root Folder ----
export async function ensureRoot() {
  const db = await initDB();
  const existing = await new Promise((res) => {
    const t = db.transaction('nodes', 'readonly');
    const r = t.objectStore('nodes').get(ROOT_ID);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
  if (!existing) {
    await new Promise((res, rej) => {
      const t = db.transaction('nodes', 'readwrite');
      const r = t.objectStore('nodes').put({
        id: ROOT_ID, name: 'StudyVault', type: 'folder',
        parentId: null, timestamp: Date.now(), size: 0
      });
      r.onsuccess = res;
      r.onerror = () => rej(r.error);
    });
  }
  return existing || { id: ROOT_ID, name: 'StudyVault', type: 'folder', parentId: null, timestamp: Date.now(), size: 0 };
}

// ---- Get single node ----
export async function getNode(id) {
  const db = await initDB();
  return new Promise((res, rej) => {
    const t = db.transaction('nodes', 'readonly');
    const r = t.objectStore('nodes').get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

// ---- Get children of a folder ----
export async function getChildren(parentId) {
  const db = await initDB();
  return new Promise((res, rej) => {
    const t = db.transaction('nodes', 'readonly');
    const idx = t.objectStore('nodes').index('parentId');
    const r = idx.getAll(parentId);
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

// ---- Create a node ----
export async function createNode(name, type, parentId, extra = {}) {
  const db = await initDB();
  const node = {
    id: genId(),
    name, type, parentId,
    timestamp: Date.now(),
    size: extra.size || 0,
    mimeType: extra.mimeType || '',
  };
  await new Promise((res, rej) => {
    const t = db.transaction('nodes', 'readwrite');
    const r = t.objectStore('nodes').add(node);
    r.onsuccess = res;
    r.onerror = () => rej(r.error);
  });
  return node;
}

// ---- Update a node ----
export async function updateNode(id, updates) {
  const existing = await getNode(id);
  if (!existing) throw new Error('Item not found');
  const updated = { ...existing, ...updates };
  const db = await initDB();
  await new Promise((res, rej) => {
    const t = db.transaction('nodes', 'readwrite');
    const r = t.objectStore('nodes').put(updated);
    r.onsuccess = res;
    r.onerror = () => rej(r.error);
  });
  return updated;
}

// ---- Delete node + children recursively ----
export async function deleteNodeById(id) {
  const children = await getChildren(id);
  for (const child of children) {
    await deleteNodeById(child.id);
  }
  const db = await initDB();
  // Delete file data
  await new Promise((res) => {
    const t = db.transaction('filedata', 'readwrite');
    const r = t.objectStore('filedata').delete(id);
    r.onsuccess = res;
    r.onerror = res; // ignore if not found
  });
  // Delete node record
  await new Promise((res, rej) => {
    const t = db.transaction('nodes', 'readwrite');
    const r = t.objectStore('nodes').delete(id);
    r.onsuccess = res;
    r.onerror = () => rej(r.error);
  });
}

// ---- Save file binary data ----
export async function saveFileData(id, buffer) {
  const db = await initDB();
  await new Promise((res, rej) => {
    const t = db.transaction('filedata', 'readwrite');
    const r = t.objectStore('filedata').put({ id, buffer });
    r.onsuccess = res;
    r.onerror = () => rej(r.error);
  });
}

// ---- Get file binary data ----
export async function getFileData(id) {
  const db = await initDB();
  return new Promise((res, rej) => {
    const t = db.transaction('filedata', 'readonly');
    const r = t.objectStore('filedata').get(id);
    r.onsuccess = () => res(r.result?.buffer || null);
    r.onerror = () => rej(r.error);
  });
}

// ---- Get ALL nodes (for search) ----
export async function getAllNodesFlat() {
  const db = await initDB();
  return new Promise((res, rej) => {
    const t = db.transaction('nodes', 'readonly');
    const r = t.objectStore('nodes').getAll();
    r.onsuccess = () => res((r.result || []).filter(n => n.id !== ROOT_ID));
    r.onerror = () => rej(r.error);
  });
}

// ---- Get total size used ----
export async function getTotalSize() {
  const nodes = await getAllNodesFlat();
  return nodes.reduce((sum, n) => sum + (n.size || 0), 0);
}

// ---- Prefs ----
export async function savePref(key, value) {
  const db = await initDB();
  await new Promise((res, rej) => {
    const t = db.transaction('prefs', 'readwrite');
    const r = t.objectStore('prefs').put({ key, value });
    r.onsuccess = res;
    r.onerror = () => rej(r.error);
  });
}

export async function loadPref(key, def = null) {
  const db = await initDB();
  return new Promise((res) => {
    const t = db.transaction('prefs', 'readonly');
    const r = t.objectStore('prefs').get(key);
    r.onsuccess = () => res(r.result?.value ?? def);
    r.onerror = () => res(def);
  });
}

// ---- Clear ALL data (factory reset) ----
export async function clearAllData() {
  const db = await initDB();
  for (const store of ['nodes', 'filedata', 'prefs']) {
    await new Promise((res) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).clear().onsuccess = res;
    });
  }
}

// ---- Helper: Generate unique ID ----
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
