// Study Vault — File Preview Module (preview.js)

import { getFileBuffer } from './storage.js';
import { triggerDownload } from './storage.js';
import { cacheFile, getCachedFile } from './cache.js';
import { showToast } from './ui.js';

const GOOGLE_DOCS_VIEWER = 'https://docs.google.com/viewer?embedded=true&url=';

// ---- File type groups ----
const TYPE_IMAGE = new Set(['jpg','jpeg','png','webp','gif','svg','bmp','ico']);
const TYPE_PDF = new Set(['pdf']);
const TYPE_CODE = new Set(['java','c','cpp','py','js','ts','jsx','tsx','html','css','php','rb','go','rs','swift','kt','sh','sql','json','xml','yaml','yml','toml','ini','md','markdown','txt','csv','log','env','gitignore']);
const TYPE_GOOGLE_VIEW = new Set(['doc','docx','ppt','pptx','xls','xlsx','odt','ods','odp']);
const TYPE_ARCHIVE = new Set(['zip','rar','7z','tar','gz','bz2']);

// ---- Open preview ----
export async function openPreview(fileObj) {
  const overlay = document.getElementById('preview-overlay');
  const filenameEl = document.getElementById('preview-filename');
  const body = document.getElementById('preview-body');
  const sizeEl = document.getElementById('preview-size');
  const dateEl = document.getElementById('preview-date');

  if (!overlay) return;

  // Show overlay with loading state
  overlay.classList.remove('hidden');
  filenameEl.textContent = fileObj.name;
  if (sizeEl) sizeEl.textContent = formatSize(fileObj.size);
  if (dateEl) dateEl.textContent = formatDate(fileObj.timestamp);

  body.innerHTML = `<div style="color:var(--text-tertiary);display:flex;align-items:center;gap:12px;font-size:14px;">
    <div class="spinner" style="border-color:rgba(255,255,255,0.2);border-top-color:white;"></div>
    Loading preview…
  </div>`;

  document.getElementById('preview-download-btn')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch((e) => showToast(e.message, 'error'));
  }, { once: true });

  const ext = getExtension(fileObj.name);

  try {
    if (TYPE_IMAGE.has(ext)) {
      await previewImage(fileObj, body);
    } else if (TYPE_PDF.has(ext)) {
      await previewPDF(fileObj, body);
    } else if (TYPE_CODE.has(ext)) {
      await previewCode(fileObj, body, ext);
    } else if (TYPE_GOOGLE_VIEW.has(ext)) {
      await previewWithGoogleDocs(fileObj, body);
    } else if (TYPE_ARCHIVE.has(ext)) {
      showArchiveInfo(fileObj, body);
    } else {
      showUnsupported(fileObj, body);
    }

    // Cache recently opened file (up to 10 MB)
    if (fileObj.size && fileObj.size <= 10 * 1024 * 1024) {
      getCachedFile(fileObj.id).then((cached) => {
        if (!cached) {
          getFileBuffer(fileObj.id).then((buf) => {
            cacheFile(fileObj.id, fileObj.name, buf, fileObj.size);
          }).catch(() => {});
        }
      });
    }
  } catch (err) {
    body.innerHTML = `<div class="preview-unsupported">
      <div class="preview-unsupported-icon">⚠️</div>
      <p style="color:var(--danger)">Failed to load preview: ${escapeHtml(err.message)}</p>
      <button class="btn btn-primary" onclick="document.dispatchEvent(new CustomEvent('download-preview'))">Download instead</button>
    </div>`;
    document.addEventListener('download-preview', () => triggerDownload(fileObj.id), { once: true });
  }
}

// ---- Close preview ----
export function closePreview() {
  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.classList.add('hidden');

  // Revoke any blob URLs
  const iframe = document.querySelector('#preview-body iframe');
  const img = document.querySelector('#preview-body img');
  if (iframe?.src?.startsWith('blob:')) URL.revokeObjectURL(iframe.src);
  if (img?.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);

  // Clear body
  const body = document.getElementById('preview-body');
  if (body) body.innerHTML = '';
}

// ---- Image Preview ----
async function previewImage(fileObj, body) {
  const buf = await getOrDownload(fileObj);
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp' };
  const ext = getExtension(fileObj.name);
  const mime = mimeMap[ext] || 'image/jpeg';
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);

  body.innerHTML = `<img class="preview-img" src="${url}" alt="${escapeHtml(fileObj.name)}" />`;
}

// ---- PDF Preview ----
async function previewPDF(fileObj, body) {
  // Try native blob first, then fallback
  try {
    const buf = await getOrDownload(fileObj);
    const blob = new Blob([buf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    body.innerHTML = `<iframe class="preview-iframe" src="${url}#toolbar=1"></iframe>`;
  } catch (_) {
    // Show download option
    showUnsupported(fileObj, body, 'PDF preview unavailable. Please download to view.');
  }
}

// ---- Code / Text Preview ----
async function previewCode(fileObj, body, ext) {
  const buf = await getOrDownload(fileObj);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);

  // Determine Prism language
  const langMap = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
    html: 'html', css: 'css', java: 'java', c: 'c', cpp: 'cpp',
    php: 'php', rb: 'ruby', go: 'go', rs: 'rust', swift: 'swift',
    sh: 'bash', sql: 'sql', json: 'json', xml: 'xml', yaml: 'yaml',
    yml: 'yaml', md: 'markdown', kt: 'kotlin',
  };
  const lang = langMap[ext] || 'none';

  body.innerHTML = `
    <div class="preview-code-wrap">
      <pre><code class="language-${lang}">${escapeHtml(text)}</code></pre>
    </div>
  `;

  // Load Prism.js for syntax highlighting
  loadPrism().then(() => {
    if (window.Prism) Prism.highlightAll();
  });
}

// ---- Google Docs Viewer (for Office files) ----
async function previewWithGoogleDocs(fileObj, body) {
  // For MEGA files, we need a temporary link — try buffer download approach
  // Fallback: show a message
  body.innerHTML = `
    <div class="preview-unsupported">
      <div class="preview-unsupported-icon">📄</div>
      <p>Office file preview requires Google Docs Viewer.</p>
      <p style="font-size:13px;margin-top:8px;color:var(--text-tertiary)">Download the file to open it in your local Office app.</p>
      <button class="btn btn-primary" id="preview-dl-btn" style="margin-top:16px">⬇️ Download File</button>
    </div>
  `;
  document.getElementById('preview-dl-btn')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch((e) => showToast(e.message, 'error'));
  }, { once: true });
}

// ---- Archive info ----
function showArchiveInfo(fileObj, body) {
  const ext = getExtension(fileObj.name).toUpperCase();
  body.innerHTML = `
    <div class="preview-unsupported">
      <div class="preview-unsupported-icon">🗜️</div>
      <h3 style="color:var(--text-primary);margin-top:12px">${escapeHtml(fileObj.name)}</h3>
      <p>${ext} archive · ${formatSize(fileObj.size)}</p>
      <p style="font-size:13px;margin-top:8px;color:var(--text-tertiary)">Archive preview is not supported. Download to extract.</p>
      <button class="btn btn-primary" id="preview-dl-btn" style="margin-top:16px">⬇️ Download Archive</button>
    </div>
  `;
  document.getElementById('preview-dl-btn')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch((e) => showToast(e.message, 'error'));
  }, { once: true });
}

// ---- Unsupported fallback ----
function showUnsupported(fileObj, body, msg = null) {
  const ext = getExtension(fileObj.name).toUpperCase();
  body.innerHTML = `
    <div class="preview-unsupported">
      <div class="preview-unsupported-icon">📄</div>
      <h3 style="color:var(--text-primary);margin-top:12px">${escapeHtml(fileObj.name)}</h3>
      <p>${msg || `Preview not available for .${ext} files`}</p>
      <button class="btn btn-primary" id="preview-dl-btn" style="margin-top:16px">⬇️ Download File</button>
    </div>
  `;
  document.getElementById('preview-dl-btn')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch((e) => showToast(e.message, 'error'));
  }, { once: true });
}

// ---- Get buffer (from cache or MEGA) ----
async function getOrDownload(fileObj) {
  const cached = await getCachedFile(fileObj.id);
  if (cached?.buffer) return cached.buffer;
  return getFileBuffer(fileObj.id);
}

// ---- Load Prism.js from CDN ----
let prismLoading = null;
function loadPrism() {
  if (window.Prism) return Promise.resolve();
  if (prismLoading) return prismLoading;

  prismLoading = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js';
    script.onload = () => {
      const autoloader = document.createElement('script');
      autoloader.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js';
      autoloader.onload = resolve;
      document.head.appendChild(autoloader);
    };
    document.head.appendChild(script);
  });

  return prismLoading;
}

// ---- Helpers ----
function getExtension(filename) {
  if (!filename) return '';
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
