// Study Vault — Upload Module (upload.js)

import { uploadFile } from './storage.js';
import { getFileIcon, getFileTypeLabel, showToast } from './ui.js';

// ---- Allowed file types ----
const ALLOWED_MIME = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text / Code
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-csrc',
  'text/x-cppsrc',
  'text/x-php',
  'text/markdown',
  'text/xml',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-python',
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  // OpenDocument
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

const ALLOWED_EXT = new Set([
  // Code
  'java', 'c', 'cpp', 'py', 'html', 'css', 'js', 'ts', 'jsx', 'tsx',
  'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'r', 'm', 'sh',
  'sql', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'env',
  'md', 'markdown', 'tex', 'ipynb',
  // Docs
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'ods', 'odp',
  'txt', 'rtf', 'csv',
  // Images
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'tiff', 'ico',
  // Archives
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
]);

const BLOCKED_MIME_PREFIXES = ['video/', 'audio/'];
const BLOCKED_EXT = new Set([
  'mp4', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'webm', 'm4v', '3gp',
  'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma',
  'exe', 'msi', 'dmg', 'apk', 'deb', 'rpm',
]);

// ---- Validate file ----
export function validateFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = (file.type || '').toLowerCase();

  // Block videos and audio
  if (BLOCKED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return { ok: false, reason: `Videos and audio files are not allowed (${file.name})` };
  }
  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, reason: `File type ".${ext}" is not allowed (${file.name})` };
  }

  // Allow by MIME or extension
  if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
    return { ok: true };
  }

  // For unknown types, allow with warning (study-related files vary widely)
  // Only block known bad types
  return { ok: true, warning: `File type ".${ext}" may not preview in the app` };
}

// ---- Upload queue state ----
let uploadQueue = [];
let isUploading = false;
let currentFolder = null;
let onUploadComplete = null;

export function setUploadTarget(folder, callback) {
  currentFolder = folder;
  onUploadComplete = callback;
}

// ---- Add files to queue ----
export function queueFiles(files) {
  const validated = [];
  const errors = [];

  for (const file of files) {
    const result = validateFile(file);
    if (result.ok) {
      validated.push({
        id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending', // pending | uploading | done | error
        progress: 0,
        error: null,
      });
    } else {
      errors.push(result.reason);
    }
  }

  if (errors.length > 0) {
    showToast(errors[0], 'error');
  }

  uploadQueue.push(...validated);
  renderUploadQueue();
  return validated;
}

// ---- Start uploading queue ----
export async function startUploads() {
  if (isUploading) return;
  isUploading = true;

  const pending = uploadQueue.filter((item) => item.status === 'pending');

  for (const item of pending) {
    item.status = 'uploading';
    renderUploadQueueItem(item);

    try {
      await uploadFile(item.file, currentFolder, (percent) => {
        item.progress = percent;
        renderUploadQueueItem(item);
      });
      item.status = 'done';
      item.progress = 100;
      renderUploadQueueItem(item);
    } catch (err) {
      item.status = 'error';
      item.error = err.message;
      renderUploadQueueItem(item);
      showToast(`Failed to upload ${item.file.name}`, 'error');
    }
  }

  isUploading = false;

  // Check if all done
  const allDone = uploadQueue.every((i) => i.status === 'done' || i.status === 'error');
  if (allDone) {
    const successCount = uploadQueue.filter((i) => i.status === 'done').length;
    if (successCount > 0) {
      showToast(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`, 'success');
      if (onUploadComplete) onUploadComplete();
    }
    setTimeout(() => {
      uploadQueue = [];
      renderUploadQueue();
    }, 2000);
  }
}

// ---- Clear queue ----
export function clearQueue() {
  uploadQueue = uploadQueue.filter((i) => i.status !== 'done');
  renderUploadQueue();
}

// ---- Render upload queue in DOM ----
function renderUploadQueue() {
  const container = document.getElementById('upload-queue');
  if (!container) return;

  if (uploadQueue.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = uploadQueue.map((item) => renderUploadItemHTML(item)).join('');
}

function renderUploadQueueItem(item) {
  const existing = document.getElementById(`upload-item-${item.id}`);
  if (existing) {
    existing.outerHTML = renderUploadItemHTML(item);
  }
  // Update start button
  const startBtn = document.getElementById('upload-start-btn');
  const hasPending = uploadQueue.some((i) => i.status === 'pending');
  if (startBtn) startBtn.disabled = !hasPending || isUploading;
}

function renderUploadItemHTML(item) {
  const { id, file, status, progress, error } = item;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const iconClass = getFileIconClass(ext);
  const emoji = getFileEmoji(ext);
  const size = formatFileSize(file.size);

  let statusText = '';
  let progressHtml = '';

  if (status === 'pending') statusText = `Ready • ${size}`;
  else if (status === 'uploading') {
    statusText = `Uploading ${progress}%`;
    progressHtml = `<div class="progress-bar upload-item-progress"><div class="progress-fill" style="width:${progress}%"></div></div>`;
  } else if (status === 'done') statusText = `✓ Uploaded`;
  else if (status === 'error') statusText = `✗ Failed: ${error}`;

  return `
    <div class="upload-item" id="upload-item-${id}">
      <div class="upload-item-icon">
        <div class="file-icon ${iconClass}">${emoji}</div>
      </div>
      <div class="upload-item-info">
        <div class="upload-item-name">${escapeHtml(file.name)}</div>
        <div class="upload-item-status" style="color:${status === 'error' ? 'var(--danger)' : status === 'done' ? 'var(--success)' : 'var(--text-tertiary)'}">${statusText}</div>
        ${progressHtml}
      </div>
    </div>
  `;
}

// ---- Setup dropzone ----
export function setupDropzone(dropzoneEl, fileInputEl) {
  dropzoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzoneEl.classList.add('drag-over');
  });
  dropzoneEl.addEventListener('dragleave', () => {
    dropzoneEl.classList.remove('drag-over');
  });
  dropzoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzoneEl.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) queueFiles(files);
  });
  dropzoneEl.addEventListener('click', () => fileInputEl.click());
  fileInputEl.addEventListener('change', () => {
    const files = Array.from(fileInputEl.files);
    if (files.length) queueFiles(files);
    fileInputEl.value = '';
  });
}

// ---- Helpers ----
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function getFileIconClass(ext) {
  if (['pdf'].includes(ext)) return 'file-icon-pdf';
  if (['jpg','jpeg','png','webp','gif','svg','bmp'].includes(ext)) return 'file-icon-image';
  if (['doc','docx','ppt','pptx','xls','xlsx','odt','ods','odp'].includes(ext)) return 'file-icon-doc';
  if (['java','c','cpp','py','js','ts','html','css','rb','go','rs','sh','sql','json','xml','ipynb','md'].includes(ext)) return 'file-icon-code';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'file-icon-zip';
  return 'file-icon-txt';
}

function getFileEmoji(ext) {
  if (['pdf'].includes(ext)) return '📄';
  if (['jpg','jpeg','png','webp','gif','svg'].includes(ext)) return '🖼️';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['ppt','pptx'].includes(ext)) return '📊';
  if (['xls','xlsx'].includes(ext)) return '📈';
  if (['java','c','cpp','py','js','ts','html','css'].includes(ext)) return '💻';
  if (['zip','rar','7z'].includes(ext)) return '🗜️';
  if (['md'].includes(ext)) return '📋';
  return '📄';
}
