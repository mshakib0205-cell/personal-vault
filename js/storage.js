// Study Vault — Storage Module (storage.js)
// All file and folder CRUD operations via megajs

import { getStorage, getVaultFolder } from './mega.js';

// ---- List folder contents ----
export async function listFolder(folder = null) {
  const vault = folder || getVaultFolder();
  if (!vault) throw new Error('Vault folder not available');

  const children = vault.children || [];
  const folders = [];
  const files = [];

  for (const node of children) {
    if (node.directory) {
      folders.push(nodeToFolder(node));
    } else {
      files.push(nodeToFile(node));
    }
  }

  // Sort: folders first, then files alphabetically
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files };
}

// ---- Get MEGA node by ID ----
export function getNodeById(nodeId) {
  const storage = getStorage();
  if (!storage) return null;
  return storage.files?.[nodeId] || null;
}

// ---- Create a new folder ----
export async function createFolder(name, parentFolder = null) {
  const parent = parentFolder || getVaultFolder();
  if (!parent) throw new Error('Parent folder not found');

  // Validate name
  const cleanName = sanitizeName(name);
  if (!cleanName) throw new Error('Invalid folder name');

  // Check for duplicate
  const existing = (parent.children || []).find(
    (c) => c.directory && c.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (existing) throw new Error(`A folder named "${cleanName}" already exists here`);

  return new Promise((resolve, reject) => {
    parent.mkdir(cleanName, (err, folder) => {
      if (err) reject(new Error(`Failed to create folder: ${err.message || err}`));
      else resolve(nodeToFolder(folder));
    });
  });
}

// ---- Rename a node (file or folder) ----
export async function renameNode(nodeId, newName) {
  const node = getNodeById(nodeId);
  if (!node) throw new Error('Item not found');

  const cleanName = sanitizeName(newName);
  if (!cleanName) throw new Error('Invalid name');

  return new Promise((resolve, reject) => {
    node.rename(cleanName, (err) => {
      if (err) reject(new Error(`Failed to rename: ${err.message || err}`));
      else resolve(node.directory ? nodeToFolder(node) : nodeToFile(node));
    });
  });
}

// ---- Move a node to a different folder ----
export async function moveNode(nodeId, targetFolderId) {
  const node = getNodeById(nodeId);
  const target = getNodeById(targetFolderId);
  if (!node) throw new Error('Item not found');
  if (!target || !target.directory) throw new Error('Target folder not found');

  return new Promise((resolve, reject) => {
    node.moveTo(target, (err) => {
      if (err) reject(new Error(`Failed to move: ${err.message || err}`));
      else resolve(true);
    });
  });
}

// ---- Delete a node ----
export async function deleteNode(nodeId, permanent = true) {
  const node = getNodeById(nodeId);
  if (!node) throw new Error('Item not found');

  return new Promise((resolve, reject) => {
    node.delete(permanent, (err) => {
      if (err) reject(new Error(`Failed to delete: ${err.message || err}`));
      else resolve(true);
    });
  });
}

// ---- Upload a file ----
export async function uploadFile(file, folder = null, onProgress = null) {
  const parent = folder || getVaultFolder();
  if (!parent) throw new Error('Target folder not found');

  // Read file as ArrayBuffer
  const buffer = await fileToBuffer(file);

  return new Promise((resolve, reject) => {
    const uploadStream = parent.upload({
      name: file.name,
      size: buffer.byteLength,
      allowUploadBuffering: true,
    }, buffer);

    uploadStream.on('progress', (data) => {
      if (onProgress) {
        const percent = Math.round((data.bytesLoaded / data.bytesTotal) * 100);
        onProgress(percent, data.bytesLoaded, data.bytesTotal);
      }
    });

    uploadStream.on('complete', (megaFile) => {
      resolve(nodeToFile(megaFile));
    });

    uploadStream.on('error', (err) => {
      reject(new Error(`Upload failed: ${err.message || err}`));
    });
  });
}

// ---- Download a file (returns Blob URL) ----
export async function downloadFile(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) throw new Error('File not found');

  const buffer = await node.downloadBuffer();
  const blob = new Blob([buffer], { type: node.attributes?.mime || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

// ---- Get downloadable buffer for preview/cache ----
export async function getFileBuffer(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) throw new Error('File not found');
  return node.downloadBuffer();
}

// ---- Trigger download to device ----
export async function triggerDownload(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) throw new Error('File not found');

  const url = await downloadFile(nodeId);
  const a = document.createElement('a');
  a.href = url;
  a.download = node.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- Get all nodes (for search index) ----
export function getAllNodes(rootFolder = null, path = '') {
  const root = rootFolder || getVaultFolder();
  if (!root) return [];

  const results = [];
  const basePath = path || root.name;

  for (const node of (root.children || [])) {
    const nodePath = basePath ? `${basePath} / ${node.name}` : node.name;

    if (node.directory) {
      results.push({
        id: node.nodeId,
        name: node.name,
        type: 'folder',
        path: nodePath,
        parentId: root.nodeId,
        timestamp: node.timestamp,
      });
      // Recurse into subfolder
      results.push(...getAllNodes(node, nodePath));
    } else {
      results.push({
        id: node.nodeId,
        name: node.name,
        type: 'file',
        path: nodePath,
        parentId: root.nodeId,
        size: node.size,
        timestamp: node.timestamp,
        ext: getExtension(node.name),
      });
    }
  }

  return results;
}

// ---- Get recent files (last N modified) ----
export function getRecentFiles(limit = 10) {
  const all = getAllNodes();
  return all
    .filter((n) => n.type === 'file')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);
}

// ---- Build folder breadcrumb path ----
export function getFolderPath(node) {
  const vault = getVaultFolder();
  const path = [];
  let current = node;

  while (current && current.nodeId !== vault?.nodeId) {
    path.unshift({ id: current.nodeId, name: current.name, node: current });
    current = current.parent;
  }

  // Add root
  if (vault) path.unshift({ id: vault.nodeId, name: 'StudyVault', node: vault });

  return path;
}

// ---- Get all folders (flat list for move picker) ----
export function getAllFolders(rootFolder = null, depth = 0) {
  const root = rootFolder || getVaultFolder();
  if (!root) return [];

  const results = [];
  if (depth === 0) {
    results.push({ id: root.nodeId, name: 'StudyVault', node: root, depth: 0 });
  }

  for (const child of (root.children || [])) {
    if (child.directory) {
      results.push({ id: child.nodeId, name: child.name, node: child, depth: depth + 1 });
      results.push(...getAllFolders(child, depth + 1));
    }
  }

  return results;
}

// ---- Helper: Convert MEGA node to folder object ----
function nodeToFolder(node) {
  return {
    id: node.nodeId,
    name: node.name,
    type: 'folder',
    directory: true,
    timestamp: node.timestamp,
    childCount: (node.children || []).length,
    node,
  };
}

// ---- Helper: Convert MEGA node to file object ----
function nodeToFile(node) {
  return {
    id: node.nodeId,
    name: node.name,
    type: 'file',
    directory: false,
    size: node.size || 0,
    timestamp: node.timestamp,
    ext: getExtension(node.name),
    node,
  };
}

// ---- Helper: Read File as ArrayBuffer ----
function fileToBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ---- Helper: Get file extension ----
export function getExtension(filename) {
  if (!filename) return '';
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

// ---- Helper: Sanitize name ----
function sanitizeName(name) {
  return String(name || '')
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '')
    .slice(0, 255);
}

// ---- Format file size ----
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

// ---- Format timestamp ----
export function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
