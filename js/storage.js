// Study Vault — Storage Module (storage.js)
// Pure local IndexedDB storage. No cloud. No login required.

import {
  initDB, ensureRoot, getNode as dbGetNode, getChildren,
  createNode, updateNode, deleteNodeById,
  saveFileData, getFileData,
  getAllNodesFlat, getTotalSize,
  ROOT_ID
} from './localdb.js';

// ---- In-memory node cache (for sync getNodeById) ----
const _cache = new Map();
let _rootNode = null;

// ---- Init (called once on app start) ----
export async function initStorage() {
  await initDB();
  _rootNode = await ensureRoot();
  _cache.set(ROOT_ID, { ..._rootNode, directory: true, childCount: 0, ext: '' });
  return _rootNode;
}

// ---- Sync getters ----
export function getVaultFolder() {
  return _rootNode || { id: ROOT_ID, name: 'StudyVault', type: 'folder', directory: true };
}

export function getNodeById(id) {
  return _cache.get(id) || null;
}

export async function getQuotaInfo() {
  const used = await getTotalSize();
  return { used, total: null, unlimited: true };
}

export function getUserInfo() {
  return { name: 'Study Vault', email: 'Stored on this device' };
}

// ---- List folder contents ----
export async function listFolder(folder = null) {
  const parentId = folder?.id || ROOT_ID;
  const children = await getChildren(parentId);

  const folders = [];
  const files = [];

  for (const node of children) {
    if (node.type === 'folder') {
      const sub = await getChildren(node.id);
      const enriched = { ...node, directory: true, childCount: sub.length, ext: '' };
      folders.push(enriched);
      _cache.set(node.id, enriched);
    } else {
      const enriched = { ...node, directory: false, ext: getExtension(node.name) };
      files.push(enriched);
      _cache.set(node.id, enriched);
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files };
}

// ---- Create folder ----
export async function createFolder(name, parent = null) {
  const parentId = parent?.id || ROOT_ID;
  const clean = sanitizeName(name);
  if (!clean) throw new Error('Invalid folder name');

  const children = await getChildren(parentId);
  if (children.find(c => c.type === 'folder' && c.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`Folder "${clean}" already exists here`);
  }

  const node = await createNode(clean, 'folder', parentId);
  const enriched = { ...node, directory: true, childCount: 0, ext: '' };
  _cache.set(node.id, enriched);
  return enriched;
}

// ---- Rename node ----
export async function renameNode(id, newName) {
  const clean = sanitizeName(newName);
  if (!clean) throw new Error('Invalid name');
  const updated = await updateNode(id, { name: clean });
  const cached = _cache.get(id);
  if (cached) _cache.set(id, { ...cached, name: clean });
  return updated;
}

// ---- Move node ----
export async function moveNode(id, targetFolderId) {
  if (id === ROOT_ID) throw new Error('Cannot move the root folder');
  const updated = await updateNode(id, { parentId: targetFolderId });
  const cached = _cache.get(id);
  if (cached) _cache.set(id, { ...cached, parentId: targetFolderId });
  return updated;
}

// ---- Delete node ----
export async function deleteNode(id) {
  if (id === ROOT_ID) throw new Error('Cannot delete root folder');
  await deleteNodeById(id);
  _cache.delete(id);
  return true;
}

// ---- Upload file ----
export async function uploadFile(file, folder = null, onProgress = null) {
  const parentId = folder?.id || ROOT_ID;

  const buffer = await readFileWithProgress(file, (pct, loaded, total) => {
    if (onProgress) onProgress(Math.min(pct, 95), loaded, total);
  });

  const node = await createNode(file.name, 'file', parentId, {
    size: file.size,
    mimeType: file.type || getMimeFromName(file.name),
  });

  await saveFileData(node.id, buffer);
  if (onProgress) onProgress(100, file.size, file.size);

  const enriched = { ...node, directory: false, ext: getExtension(file.name) };
  _cache.set(node.id, enriched);
  return enriched;
}

// ---- Get file buffer (for preview) ----
export async function getFileBuffer(id) {
  const buf = await getFileData(id);
  if (!buf) throw new Error('File data not found on this device');
  return buf;
}

// ---- Download file to device ----
export async function triggerDownload(id) {
  const node = await dbGetNode(id);
  if (!node) throw new Error('File not found');

  const buffer = await getFileBuffer(id);
  const blob = new Blob([buffer], { type: node.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = node.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- Get all nodes for search ----
export async function getAllNodes() {
  const all = await getAllNodesFlat();
  const nodeMap = {};
  for (const n of all) {
    nodeMap[n.id] = n;
    _cache.set(n.id, { ...n, directory: n.type === 'folder', ext: getExtension(n.name) });
  }

  function getPath(nodeId) {
    const parts = [];
    let cur = nodeMap[nodeId];
    while (cur && cur.parentId && cur.parentId !== ROOT_ID) {
      parts.unshift(cur.name);
      cur = nodeMap[cur.parentId];
    }
    if (cur) parts.unshift(cur.name);
    return parts.join(' / ');
  }

  return all.map(n => ({
    id: n.id, name: n.name, type: n.type,
    path: getPath(n.id),
    parentId: n.parentId,
    size: n.size || 0,
    timestamp: n.timestamp,
    ext: n.type === 'file' ? getExtension(n.name) : '',
  }));
}

// ---- Get recent files ----
export async function getRecentFiles(limit = 10) {
  const all = await getAllNodes();
  return all
    .filter(n => n.type === 'file')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
}

// ---- Get all folders (flat list, for move modal) ----
export async function getAllFolders(parentId = ROOT_ID, depth = 0) {
  const results = [];
  if (depth === 0) results.push({ id: ROOT_ID, name: 'StudyVault', depth: 0 });
  const children = await getChildren(parentId);
  for (const child of children) {
    if (child.type === 'folder') {
      results.push({ id: child.id, name: child.name, depth: depth + 1 });
      results.push(...(await getAllFolders(child.id, depth + 1)));
    }
  }
  return results;
}

// ---- Get folder breadcrumb path ----
export async function getFolderPath(node) {
  const path = [{ id: node.id, name: node.name, node }];
  let cur = node;
  while (cur.parentId && cur.parentId !== ROOT_ID) {
    const parent = await dbGetNode(cur.parentId);
    if (!parent) break;
    path.unshift({ id: parent.id, name: parent.name, node: parent });
    cur = parent;
  }
  path.unshift({ id: ROOT_ID, name: 'StudyVault', node: getVaultFolder() });
  return path;
}

// ---- Helpers ----
function readFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 90), e.loaded, e.total);
      }
    };
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function getExtension(filename) {
  if (!filename) return '';
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function sanitizeName(name) {
  return String(name || '').trim().replace(/[\/\\:*?"<>|]/g, '').slice(0, 255);
}

function getMimeFromName(name) {
  const ext = getExtension(name);
  const map = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    svg: 'image/svg+xml', txt: 'text/plain', md: 'text/markdown',
    html: 'text/html', css: 'text/css', js: 'text/javascript',
    json: 'application/json', xml: 'application/xml',
    zip: 'application/zip', py: 'text/x-python',
  };
  return map[ext] || 'application/octet-stream';
}

export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

export function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}
