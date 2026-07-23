// Study Vault — File Preview Module (preview.js)

import { getFileBuffer, triggerDownload } from './storage.js';

const TYPE_IMAGE = new Set(['jpg','jpeg','png','webp','gif','svg','bmp','ico']);
const TYPE_PDF   = new Set(['pdf']);
const TYPE_CODE  = new Set(['java','c','cpp','py','js','ts','jsx','tsx','html','css','php','rb','go','rs','swift','kt','sh','sql','json','xml','yaml','yml','toml','ini','md','markdown','txt','csv','log','env']);
const TYPE_ARCHIVE = new Set(['zip','rar','7z','tar','gz','bz2']);

// ---- Open preview ----
export async function openPreview(fileObj) {
  const overlay  = document.getElementById('preview-overlay');
  const fileEl   = document.getElementById('preview-filename');
  const body     = document.getElementById('preview-body');
  const sizeEl   = document.getElementById('preview-size');
  const dateEl   = document.getElementById('preview-date');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  fileEl.textContent = fileObj.name;
  if (sizeEl) sizeEl.textContent = formatSize(fileObj.size);
  if (dateEl) dateEl.textContent = formatDate(fileObj.timestamp);

  body.innerHTML = `<div style="display:flex;align-items:center;gap:12px;color:var(--text-tertiary);font-size:14px">
    <div class="spinner" style="border-color:rgba(255,255,255,.15);border-top-color:var(--accent)"></div>
    Loading preview…
  </div>`;

  document.getElementById('preview-download-btn')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch(e => showToastGlobal(e.message, 'error'));
  }, { once: true });

  const ext = getExtension(fileObj.name);

  try {
    if (TYPE_IMAGE.has(ext))   await previewImage(fileObj, body, ext);
    else if (TYPE_PDF.has(ext)) await previewPDF(fileObj, body);
    else if (TYPE_CODE.has(ext)) await previewCode(fileObj, body, ext);
    else if (TYPE_ARCHIVE.has(ext)) showArchiveInfo(fileObj, body, ext);
    else showUnsupported(fileObj, body, ext);
  } catch (err) {
    body.innerHTML = `<div class="preview-unsupported">
      <div class="preview-unsupported-icon">⚠️</div>
      <p style="color:var(--danger)">Preview failed: ${escHtml(err.message)}</p>
      <button class="btn btn-primary" id="preview-dl-err">⬇️ Download instead</button>
    </div>`;
    document.getElementById('preview-dl-err')?.addEventListener('click', () => {
      triggerDownload(fileObj.id).catch(() => {});
    }, { once: true });
  }
}

// ---- Close preview ----
export function closePreview() {
  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.classList.add('hidden');

  // Revoke blob URLs
  document.querySelectorAll('#preview-body iframe, #preview-body img').forEach(el => {
    if (el.src?.startsWith('blob:')) URL.revokeObjectURL(el.src);
  });

  const body = document.getElementById('preview-body');
  if (body) body.innerHTML = '';
}

// ---- Image ----
async function previewImage(fileObj, body, ext) {
  const buf = await getFileBuffer(fileObj.id);
  const mimeMap = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', svg:'image/svg+xml', bmp:'image/bmp', ico:'image/x-icon' };
  const blob = new Blob([buf], { type: mimeMap[ext] || 'image/jpeg' });
  const url  = URL.createObjectURL(blob);
  body.innerHTML = `<img class="preview-img" src="${url}" alt="${escHtml(fileObj.name)}" />`;
}

// ---- PDF ----
async function previewPDF(fileObj, body) {
  const buf  = await getFileBuffer(fileObj.id);
  const blob = new Blob([buf], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  body.innerHTML = `<iframe class="preview-iframe" src="${url}#toolbar=1"></iframe>`;
}

// ---- Code / Text ----
async function previewCode(fileObj, body, ext) {
  const buf  = await getFileBuffer(fileObj.id);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);

  const langMap = {
    py:'python', js:'javascript', ts:'typescript', jsx:'jsx', tsx:'tsx',
    html:'html', css:'css', java:'java', c:'c', cpp:'cpp',
    php:'php', rb:'ruby', go:'go', rs:'rust', swift:'swift', kt:'kotlin',
    sh:'bash', sql:'sql', json:'json', xml:'xml', yaml:'yaml', yml:'yaml',
    md:'markdown', txt:'none', csv:'none', log:'none',
  };
  const lang = langMap[ext] || 'none';

  body.innerHTML = `<div class="preview-code-wrap">
    <pre><code class="language-${lang}">${escHtml(text)}</code></pre>
  </div>`;

  loadPrism().then(() => { if (window.Prism) Prism.highlightAll(); });
}

// ---- Archive info ----
function showArchiveInfo(fileObj, body, ext) {
  body.innerHTML = `<div class="preview-unsupported">
    <div class="preview-unsupported-icon">🗜️</div>
    <h3 style="color:var(--text-primary);margin-top:12px">${escHtml(fileObj.name)}</h3>
    <p>${ext.toUpperCase()} archive · ${formatSize(fileObj.size)}</p>
    <p style="font-size:13px;margin-top:8px;color:var(--text-tertiary)">Archive preview not supported. Download to extract.</p>
    <button class="btn btn-primary" id="preview-dl-arc" style="margin-top:16px">⬇️ Download Archive</button>
  </div>`;
  document.getElementById('preview-dl-arc')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch(() => {});
  }, { once: true });
}

// ---- Unsupported ----
function showUnsupported(fileObj, body, ext) {
  body.innerHTML = `<div class="preview-unsupported">
    <div class="preview-unsupported-icon">📄</div>
    <h3 style="color:var(--text-primary);margin-top:12px">${escHtml(fileObj.name)}</h3>
    <p>Preview not available for .${ext || '?'} files</p>
    <button class="btn btn-primary" id="preview-dl-uns" style="margin-top:16px">⬇️ Download File</button>
  </div>`;
  document.getElementById('preview-dl-uns')?.addEventListener('click', () => {
    triggerDownload(fileObj.id).catch(() => {});
  }, { once: true });
}

// ---- Load Prism.js syntax highlighter ----
let _prismLoading = null;
function loadPrism() {
  if (window.Prism) return Promise.resolve();
  if (_prismLoading) return _prismLoading;
  _prismLoading = new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
    document.head.appendChild(link);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js';
    s.onload = () => {
      const al = document.createElement('script');
      al.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js';
      al.onload = resolve;
      document.head.appendChild(al);
    };
    document.head.appendChild(s);
  });
  return _prismLoading;
}

// ---- Helpers ----
function getExtension(f) {
  if (!f) return '';
  const p = f.toLowerCase().split('.');
  return p.length > 1 ? p.pop() : '';
}
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes)/Math.log(1024));
  return `${(bytes/Math.pow(1024,i)).toFixed(i>0?1:0)} ${s[i]}`;
}
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}
function escHtml(str) {
  return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showToastGlobal(msg, type) {
  if (window.AppUI?.showToast) window.AppUI.showToast(msg, type);
}
