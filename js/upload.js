// Study Vault — Upload Module (upload.js)
// No circular imports. Uses window.AppUI.showToast for notifications.

// ---- Allowed extensions ----
const ALLOWED_EXT = new Set([
  // Documents
  'pdf','doc','docx','ppt','pptx','xls','xlsx','odt','ods','odp','rtf','csv',
  // Images
  'jpg','jpeg','png','webp','gif','svg','bmp','ico','tiff',
  // Code & Text
  'txt','md','markdown','html','css','js','ts','jsx','tsx','json','xml','yaml',
  'yml','toml','ini','env','py','java','c','cpp','h','hpp','rb','go','rs',
  'swift','kt','php','sh','bash','sql','r','m','scala','cs','vb','lua','ipynb',
  // Archives
  'zip','rar','7z','tar','gz','bz2',
]);

const BLOCKED_EXT = new Set([
  'mp4','avi','mov','wmv','mkv','flv','webm','m4v','3gp',  // video
  'mp3','wav','ogg','aac','m4a','flac','wma','opus',        // audio
  'exe','msi','dmg','apk','deb','rpm','bat','cmd',           // executables
]);

const BLOCKED_MIME = ['video/', 'audio/'];

// ---- Validate file ----
export function validateFile(file) {
  const ext  = (file.name.split('.').pop() || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (BLOCKED_MIME.some(p => mime.startsWith(p))) {
    return { ok: false, reason: `Videos and audio not allowed: ${file.name}` };
  }
  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, reason: `File type .${ext} is not allowed: ${file.name}` };
  }
  return { ok: true };
}

// ---- State ----
let _queue = [];
let _uploading = false;
let _targetFolder = null;
let _onComplete = null;

export function setUploadTarget(folder, onComplete) {
  _targetFolder = folder;
  _onComplete = onComplete;
}

// ---- Queue files ----
export function queueFiles(files) {
  const valid = [];
  for (const file of files) {
    const r = validateFile(file);
    if (r.ok) {
      valid.push({
        id: `upl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        file, status: 'pending', progress: 0, error: null,
      });
    } else {
      _toast(r.reason, 'error');
    }
  }
  _queue.push(...valid);
  _renderQueue();
  // Enable start button
  const btn = document.getElementById('upload-start-btn');
  if (btn) btn.disabled = _queue.filter(i => i.status === 'pending').length === 0;
  return valid;
}

// ---- Start uploads ----
export async function startUploads() {
  if (_uploading) return;
  _uploading = true;

  // Dynamically import uploadFile to avoid top-level circular deps
  const { uploadFile } = await import('./storage.js');

  const pending = _queue.filter(i => i.status === 'pending');

  for (const item of pending) {
    item.status = 'uploading';
    _renderQueueItem(item);

    try {
      await uploadFile(item.file, _targetFolder, (pct) => {
        item.progress = pct;
        _renderQueueItem(item);
      });
      item.status = 'done';
      item.progress = 100;
      _renderQueueItem(item);
    } catch (err) {
      item.status = 'error';
      item.error = err.message;
      _renderQueueItem(item);
      _toast(`Failed: ${item.file.name}`, 'error');
    }
  }

  _uploading = false;

  const doneCount = _queue.filter(i => i.status === 'done').length;
  const allSettled = _queue.every(i => i.status === 'done' || i.status === 'error');

  if (allSettled) {
    if (doneCount > 0) {
      _toast(`${doneCount} file${doneCount > 1 ? 's' : ''} uploaded!`, 'success');
      if (_onComplete) _onComplete();
    }
    setTimeout(() => { _queue = []; _renderQueue(); }, 1500);
  }
}

// ---- Setup dropzone ----
export function setupDropzone(dropzoneEl, fileInputEl) {
  dropzoneEl.addEventListener('dragover', e => {
    e.preventDefault();
    dropzoneEl.classList.add('drag-over');
  });
  dropzoneEl.addEventListener('dragleave', () => dropzoneEl.classList.remove('drag-over'));
  dropzoneEl.addEventListener('drop', e => {
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

// ---- Render queue ----
function _renderQueue() {
  const container = document.getElementById('upload-queue');
  if (!container) return;
  if (!_queue.length) { container.innerHTML = ''; return; }
  container.innerHTML = _queue.map(item => _itemHTML(item)).join('');

  const btn = document.getElementById('upload-start-btn');
  if (btn) btn.disabled = _uploading || !_queue.some(i => i.status === 'pending');
}

function _renderQueueItem(item) {
  const existing = document.getElementById(`uq-${item.id}`);
  const html = _itemHTML(item);
  if (existing) existing.outerHTML = html;
  else _renderQueue();

  const btn = document.getElementById('upload-start-btn');
  if (btn) btn.disabled = _uploading || !_queue.some(i => i.status === 'pending');
}

function _itemHTML(item) {
  const { id, file, status, progress, error } = item;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const emoji = _emoji(ext);
  const size = _fmtSize(file.size);

  let statusText = '';
  let progressBar = '';

  if (status === 'pending')   statusText = `Ready · ${size}`;
  if (status === 'uploading') {
    statusText = `Uploading ${progress}%`;
    progressBar = `<div class="progress-bar upload-item-progress"><div class="progress-fill" style="width:${progress}%"></div></div>`;
  }
  if (status === 'done')  statusText = `✓ Uploaded`;
  if (status === 'error') statusText = `✗ ${error || 'Failed'}`;

  const color = status === 'error' ? 'var(--danger)' : status === 'done' ? 'var(--success)' : 'var(--text-tertiary)';

  return `<div class="upload-item" id="uq-${id}">
    <div class="upload-item-icon"><div class="file-icon">${emoji}</div></div>
    <div class="upload-item-info">
      <div class="upload-item-name">${_esc(file.name)}</div>
      <div class="upload-item-status" style="color:${color}">${statusText}</div>
      ${progressBar}
    </div>
  </div>`;
}

// ---- Helpers ----
function _toast(msg, type) {
  if (window.AppUI?.showToast) window.AppUI.showToast(msg, type);
  else console.log(`[Toast ${type}] ${msg}`);
}

function _fmtSize(bytes) {
  if (!bytes) return '0 B';
  const s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes)/Math.log(1024));
  return `${(bytes/Math.pow(1024,i)).toFixed(i>0?1:0)} ${s[i]}`;
}

function _esc(str) {
  return String(str||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _emoji(ext) {
  const map = {
    pdf:'📄', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', webp:'🖼️', gif:'🖼️', svg:'🖼️',
    doc:'📝', docx:'📝', ppt:'📊', pptx:'📊', xls:'📈', xlsx:'📈',
    py:'🐍', js:'💛', ts:'💛', html:'🌐', css:'🎨', java:'⚙️', c:'⚙️', cpp:'⚙️',
    zip:'🗜️', rar:'🗜️', '7z':'🗜️', tar:'🗜️', gz:'🗜️',
    json:'📋', xml:'📋', md:'📋', sql:'🗄️', ipynb:'📓',
  };
  return map[ext] || '📄';
}
