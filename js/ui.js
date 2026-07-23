// Study Vault — UI Module (ui.js)
// No MEGA. No login. Local IndexedDB storage.

import { listFolder, createFolder, renameNode, moveNode, deleteNode,
         getAllFolders, getRecentFiles, getAllNodes, formatSize, formatDate,
         getExtension, getNodeById, getVaultFolder, getQuotaInfo, getUserInfo,
         triggerDownload } from './storage.js';
import { openPreview, closePreview } from './preview.js';
import { buildSearchIndex, search, highlight, debounce } from './search.js';
import { startUploads, setUploadTarget, setupDropzone } from './upload.js';
import { clearAllData } from './localdb.js';

// ---- App State ----
const state = {
  currentView: 'home',
  currentFolder: null,
  currentFolderStack: [],
  viewMode: localStorage.getItem('sv_viewmode') || 'grid',
  theme: localStorage.getItem('sv_theme') || 'dark',
  selectedIds: new Set(),
  selectMode: false,
};

// ---- Init App ----
export async function initApp() {
  applyTheme(state.theme);
  bindNavigation();
  bindHeader();
  bindModals();
  bindPreviewOverlay();
  bindUploadSheet();
  bindContextMenu();
  setupSearchInput();

  state.currentFolder = getVaultFolder();
  state.currentFolderStack = [{ id: state.currentFolder?.id, name: 'StudyVault', node: state.currentFolder }];

  buildSearchIndex(true).catch(() => {});
  await showView('home');
}

// ---- Navigation ----
function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'upload') { openUploadSheet(); return; }
      showView(view);
    });
  });
}

// ---- Switch Views ----
export async function showView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewName}`)?.classList.add('active');
  document.getElementById('fab-new-folder')?.classList.toggle('hidden', viewName !== 'folders');

  if (viewName === 'home') await renderHome();
  else if (viewName === 'folders') await renderFolders();
  else if (viewName === 'search') renderSearchPlaceholder();
  else if (viewName === 'settings') renderSettings();
}

// ============================================================
// HOME VIEW
// ============================================================
async function renderHome() {
  const c = document.getElementById('view-home');
  if (!c) return;

  c.innerHTML = `<div class="stats-grid">${Array(4).fill('<div class="stat-card skeleton" style="height:90px"></div>').join('')}</div>
    <div class="section-header"><div class="section-title">Recent Files</div></div>
    <div class="file-grid">${Array(6).fill('<div class="skeleton" style="height:140px;border-radius:12px"></div>').join('')}</div>`;

  try {
    const [recent, quotaInfo, allNodes] = await Promise.all([
      getRecentFiles(12), getQuotaInfo(), getAllNodes()
    ]);

    const folderCount = allNodes.filter(n => n.type === 'folder').length;
    const fileCount   = allNodes.filter(n => n.type === 'file').length;

    c.innerHTML = `
      <!-- Storage bar -->
      <div class="storage-bar">
        <div class="storage-bar-label">
          <span>💾 Local Storage</span>
          <span>${formatSize(quotaInfo.used)} used on this device</span>
        </div>
        <div class="storage-progress">
          <div class="storage-fill" style="width:${Math.min((quotaInfo.used/(500*1024*1024))*100,100)}%"></div>
        </div>
      </div>
      <!-- Stats -->
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon">📁</div><div class="stat-value">${folderCount}</div><div class="stat-label">Folders</div></div>
        <div class="stat-card"><div class="stat-icon">📄</div><div class="stat-value">${fileCount}</div><div class="stat-label">Files</div></div>
        <div class="stat-card"><div class="stat-icon">💾</div><div class="stat-value">${formatSize(quotaInfo.used)}</div><div class="stat-label">Used</div></div>
        <div class="stat-card"><div class="stat-icon">🔒</div><div class="stat-value" style="font-size:13px">Private</div><div class="stat-label">On Device</div></div>
      </div>
      <!-- Recent -->
      <div class="section-header">
        <div class="section-title">Recent Files</div>
        <button class="btn btn-ghost btn-sm" onclick="window.AppUI.showView('folders')">See all →</button>
      </div>
      ${recent.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📚</div><h3>No files yet</h3><p>Tap ⬆️ Upload to add your first study file</p></div>`
        : `<div class="${state.viewMode === 'grid' ? 'file-grid' : 'file-list'}">${recent.map(f => renderFileItem(f)).join('')}</div>`
      }`;
    attachFileItemListeners(c);
  } catch (err) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${esc(err.message)}</p></div>`;
  }
}

// ============================================================
// FOLDERS VIEW
// ============================================================
async function renderFolders(folder = null) {
  const c = document.getElementById('view-folders');
  if (!c) return;

  const target = folder || state.currentFolder || getVaultFolder();
  state.currentFolder = target;

  c.innerHTML = `<div class="skeleton" style="height:36px;border-radius:8px;margin-bottom:16px"></div>
    <div class="file-grid">${Array(6).fill('<div class="skeleton" style="height:140px;border-radius:12px"></div>').join('')}</div>`;

  try {
    const { folders, files } = await listFolder(target);
    const all = [...folders, ...files];

    c.innerHTML = `
      <div class="breadcrumb" id="folder-breadcrumb">${renderBreadcrumb()}</div>
      <div class="multiselect-bar hidden" id="multiselect-bar">
        <span class="multiselect-count" id="multiselect-count">0 selected</span>
        <div class="multiselect-actions">
          <button class="btn-icon" title="Download" onclick="window.AppUI.bulkDownload()">⬇️</button>
          <button class="btn-icon" title="Move" onclick="window.AppUI.openMoveModal()">📁</button>
          <button class="btn-icon" title="Delete" onclick="window.AppUI.openDeleteModal()">🗑️</button>
          <button class="btn-icon" title="Cancel" onclick="window.AppUI.exitSelectMode()">✕</button>
        </div>
      </div>
      <div class="file-toolbar">
        <div class="file-toolbar-left"><span class="file-count">${all.length} item${all.length !== 1 ? 's' : ''}</span></div>
        <div class="file-toolbar-right">
          <button class="btn-icon" title="Toggle view" onclick="window.AppUI.toggleViewMode()">${state.viewMode === 'grid' ? '☰' : '⊞'}</button>
          ${all.length > 0 ? `<button class="btn-icon" onclick="window.AppUI.enterSelectMode()">☑️</button>` : ''}
        </div>
      </div>
      ${all.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📁</div><h3>Empty folder</h3><p>Tap + to create a folder or ⬆️ to upload files</p></div>`
        : `<div id="file-container" class="${state.viewMode === 'grid' ? 'file-grid' : 'file-list'}">${all.map(item => renderFileItem(item, true)).join('')}</div>`
      }`;

    attachFileItemListeners(c);
    attachBreadcrumbListeners();
  } catch (err) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${esc(err.message)}</p></div>`;
  }
}

function renderBreadcrumb() {
  return state.currentFolderStack.map((item, i) => {
    const isLast = i === state.currentFolderStack.length - 1;
    return `${i > 0 ? '<span class="breadcrumb-sep">›</span>' : ''}
      <span class="breadcrumb-item ${isLast ? 'current' : ''}" data-crumb-idx="${i}">
        ${i === 0 ? '📚 ' : ''}${esc(item.name)}
      </span>`;
  }).join('');
}

function attachBreadcrumbListeners() {
  document.querySelectorAll('.breadcrumb-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.crumbIdx, 10);
      if (isNaN(idx) || idx === state.currentFolderStack.length - 1) return;
      state.currentFolderStack = state.currentFolderStack.slice(0, idx + 1);
      state.currentFolder = state.currentFolderStack[idx].node;
      renderFolders(state.currentFolder);
    });
  });
}

// ============================================================
// FILE ITEM RENDERING
// ============================================================
function renderFileItem(item, withCtx = true) {
  const isFolder = item.type === 'folder';
  const ext = item.ext || getExtension(item.name);
  const iconClass = fileIconClass(ext, isFolder);
  const emoji = isFolder ? '📁' : fileEmoji(ext);
  const sel = state.selectedIds.has(item.id);

  if (state.viewMode === 'grid') {
    return `<div class="file-card ${sel?'selected':''}" data-id="${item.id}" data-type="${item.type}"
        data-name="${escAttr(item.name)}" data-size="${item.size||0}" data-ts="${item.timestamp||0}">
      <div class="file-card-checkbox">${sel?'✓':''}</div>
      <div class="file-card-icon"><div class="file-icon ${iconClass}">${emoji}</div></div>
      <div class="file-card-name">${esc(item.name)}</div>
      <div class="file-card-meta">${isFolder ? '' : formatSize(item.size)}</div>
    </div>`;
  } else {
    return `<div class="file-row ${sel?'selected':''}" data-id="${item.id}" data-type="${item.type}"
        data-name="${escAttr(item.name)}" data-size="${item.size||0}" data-ts="${item.timestamp||0}">
      <div class="file-icon ${iconClass}">${emoji}</div>
      <div class="file-row-info">
        <div class="file-row-name">${esc(item.name)}</div>
        <div class="file-row-meta">${isFolder ? 'Folder' : formatDate(item.timestamp)}</div>
      </div>
      <div class="file-row-size">${isFolder ? '' : formatSize(item.size)}</div>
      <div class="file-row-actions">
        <button class="btn-icon ctx-trigger" data-id="${item.id}" style="font-size:18px">⋯</button>
      </div>
    </div>`;
  }
}

function attachFileItemListeners(container) {
  container.querySelectorAll('[data-id]').forEach(el => {
    const id   = el.dataset.id;
    const type = el.dataset.type;

    // Long press → select
    let pressTimer;
    el.addEventListener('pointerdown', () => { pressTimer = setTimeout(() => enterSelectMode(id), 500); });
    el.addEventListener('pointerup',   () => clearTimeout(pressTimer));
    el.addEventListener('pointerleave',() => clearTimeout(pressTimer));

    el.addEventListener('click', e => {
      if (e.target.classList.contains('ctx-trigger')) return;
      if (state.selectMode) { toggleSelect(id); return; }

      if (type === 'folder') {
        const node = getNodeById(id);
        if (node) navigateToFolder(node);
      } else {
        const node = getNodeById(id);
        if (node) openPreview({ id, name: el.dataset.name, size: +el.dataset.size, timestamp: +el.dataset.ts, node });
      }
    });

    el.querySelector('.ctx-trigger')?.addEventListener('click', e => {
      e.stopPropagation();
      showContextMenu(e, id, type, el.dataset.name);
    });
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e, id, type, el.dataset.name);
    });
  });
}

function navigateToFolder(folderNode) {
  state.currentFolderStack.push({ id: folderNode.id, name: folderNode.name, node: folderNode });
  state.currentFolder = folderNode;
  if (state.currentView !== 'folders') showView('folders');
  else renderFolders(folderNode);
}

// ============================================================
// SEARCH VIEW
// ============================================================
function renderSearchPlaceholder() {
  const c = document.getElementById('view-search');
  if (!c || c.innerHTML.includes('empty-state')) {
    if (c) c.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Search your files</h3><p>Type in the search bar above</p></div>`;
  }
}

export function executeSearch(query) {
  const c = document.getElementById('view-search');
  if (!c) return;
  const q = query.trim();
  if (!q) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Search your files</h3><p>Type in the search bar above</p></div>`;
    return;
  }

  const results = search(q);
  if (!results.length) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><h3>No results</h3><p>No files match "<strong>${esc(q)}</strong>"</p></div>`;
    return;
  }

  c.innerHTML = `<div class="search-query-display">${results.length} result${results.length!==1?'s':''} for <strong>"${esc(q)}"</strong></div>
    <div class="file-list">${results.map(r => {
      const isFolder = r.type==='folder';
      const ext = r.ext||'';
      const iconClass = fileIconClass(ext, isFolder);
      const pathParts = (r.path||'').split(' / ');
      const parentPath = pathParts.slice(0,-1).join(' › ');
      return `<div class="file-row" data-id="${r.id}" data-type="${r.type}"
          data-name="${escAttr(r.name)}" data-size="${r.size||0}" data-ts="${r.timestamp||0}">
        <div class="file-icon ${iconClass}">${isFolder?'📁':fileEmoji(ext)}</div>
        <div class="file-row-info">
          <div class="file-row-name">${highlight(r.name,q)}</div>
          ${parentPath?`<div class="search-result-path">📁 ${esc(parentPath)}</div>`:''}
        </div>
        <div class="file-row-size">${isFolder?'Folder':formatSize(r.size)}</div>
      </div>`;
    }).join('')}</div>`;
  attachFileItemListeners(c);
}

function setupSearchInput() {
  const input = document.getElementById('header-search');
  if (!input) return;
  const go = debounce(q => {
    if (state.currentView !== 'search') showView('search');
    executeSearch(q);
  }, 200);
  input.addEventListener('input', e => { if (e.target.value) go(e.target.value); else if (state.currentView==='search') executeSearch(''); });
  input.addEventListener('keydown', e => {
    if (e.key==='Enter') { if (state.currentView!=='search') showView('search'); executeSearch(input.value); }
    if (e.key==='Escape') { input.value=''; if (state.currentView==='search') showView('home'); }
  });
}

// ============================================================
// SETTINGS VIEW
// ============================================================
function renderSettings() {
  const c = document.getElementById('view-settings');
  if (!c) return;

  c.innerHTML = `
    <div class="section-title" style="margin-bottom:20px;font-size:20px">Settings</div>

    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>
      <div class="settings-item">
        <div class="settings-item-left"><div class="settings-item-icon">🌙</div>
          <div><div class="settings-item-label">Dark Mode</div><div class="settings-item-sub">Switch theme</div></div>
        </div>
        <label class="toggle"><input type="checkbox" id="dark-mode-toggle" ${state.theme==='dark'?'checked':''}><span class="toggle-slider"></span></label>
      </div>
      <div class="settings-item">
        <div class="settings-item-left"><div class="settings-item-icon">⊞</div>
          <div><div class="settings-item-label">Grid View</div><div class="settings-item-sub">Show files as grid cards</div></div>
        </div>
        <label class="toggle"><input type="checkbox" id="grid-view-toggle" ${state.viewMode==='grid'?'checked':''}><span class="toggle-slider"></span></label>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Storage</div>
      <div class="settings-item">
        <div class="settings-item-left"><div class="settings-item-icon">💾</div>
          <div><div class="settings-item-label">Local Device Storage</div><div class="settings-item-sub">Files stored in your browser (IndexedDB)</div></div>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
      <div class="settings-item" id="settings-clear" style="cursor:pointer">
        <div class="settings-item-left"><div class="settings-item-icon" style="color:var(--danger)">🗑️</div>
          <div><div class="settings-item-label" style="color:var(--danger)">Clear All Data</div>
          <div class="settings-item-sub">Delete all files and folders permanently</div></div>
        </div>
        <span style="color:var(--text-tertiary)">›</span>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">About</div>
      <div class="settings-item">
        <div class="settings-item-left"><div class="settings-item-icon">📚</div>
          <div><div class="settings-item-label">Study Vault</div>
          <div class="settings-item-sub">Version 2.0 · Local-first · No login required</div></div>
        </div>
      </div>
    </div>`;

  document.getElementById('dark-mode-toggle')?.addEventListener('change', e => applyTheme(e.target.checked?'dark':'light'));
  document.getElementById('grid-view-toggle')?.addEventListener('change', e => {
    state.viewMode = e.target.checked ? 'grid' : 'list';
    localStorage.setItem('sv_viewmode', state.viewMode);
  });
  document.getElementById('settings-clear')?.addEventListener('click', async () => {
    if (confirm('⚠️ This will permanently delete ALL your files and folders. Are you sure?')) {
      if (confirm('This CANNOT be undone. Delete everything?')) {
        await clearAllData();
        showToast('All data cleared', 'success');
        await showView('home');
      }
    }
  });
}

// ============================================================
// THEME
// ============================================================
export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sv_theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ============================================================
// VIEW MODE
// ============================================================
export function toggleViewMode() {
  state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
  localStorage.setItem('sv_viewmode', state.viewMode);
  if (state.currentView === 'folders') renderFolders(state.currentFolder);
  else if (state.currentView === 'home') renderHome();
}

// ============================================================
// SELECT MODE
// ============================================================
function enterSelectMode(initialId = null) {
  state.selectMode = true;
  state.selectedIds.clear();
  if (initialId) state.selectedIds.add(initialId);
  refreshSelectUI();
  if (state.currentView === 'folders') renderFolders(state.currentFolder);
}

export function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  refreshSelectUI();
  if (state.currentView === 'folders') renderFolders(state.currentFolder);
}

function toggleSelect(id) {
  state.selectedIds.has(id) ? state.selectedIds.delete(id) : state.selectedIds.add(id);
  refreshSelectUI();
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.toggle('selected', state.selectedIds.has(id));
    const cb = el.querySelector('.file-card-checkbox');
    if (cb) cb.textContent = state.selectedIds.has(id) ? '✓' : '';
  }
}

function refreshSelectUI() {
  document.getElementById('multiselect-bar')?.classList.toggle('hidden', !state.selectMode || state.selectedIds.size === 0);
  const cnt = document.getElementById('multiselect-count');
  if (cnt) cnt.textContent = `${state.selectedIds.size} selected`;
}

export async function bulkDownload() {
  for (const id of state.selectedIds) {
    const node = getNodeById(id);
    if (node && node.type !== 'folder') await triggerDownload(id).catch(() => {});
  }
  exitSelectMode();
}

// ============================================================
// MODALS
// ============================================================
function bindModals() {
  document.getElementById('fab-new-folder')?.addEventListener('click', openNewFolderModal);
  document.getElementById('new-folder-cancel')?.addEventListener('click', closeModal);
  document.getElementById('new-folder-create')?.addEventListener('click', handleCreateFolder);
  document.getElementById('new-folder-input')?.addEventListener('keydown', e => { if (e.key==='Enter') handleCreateFolder(); });
  document.getElementById('rename-cancel')?.addEventListener('click', closeModal);
  document.getElementById('rename-save')?.addEventListener('click', handleRename);
  document.getElementById('rename-input')?.addEventListener('keydown', e => { if (e.key==='Enter') handleRename(); });
  document.getElementById('delete-cancel')?.addEventListener('click', closeModal);
  document.getElementById('delete-confirm')?.addEventListener('click', handleDelete);
  document.getElementById('move-cancel')?.addEventListener('click', closeModal);
  document.getElementById('move-confirm')?.addEventListener('click', handleMove);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

let _ctx = {};

function openNewFolderModal() {
  _ctx = { action: 'new-folder' };
  showModal('new-folder-modal');
  const inp = document.getElementById('new-folder-input');
  inp.value = ''; inp.focus();
}

function openRenameModal(id, name) {
  _ctx = { action: 'rename', id };
  showModal('rename-modal');
  const inp = document.getElementById('rename-input');
  inp.value = name; inp.focus(); inp.select();
}

function openDeleteModal_inner(ids) {
  _ctx = { action: 'delete', ids };
  const msg = document.getElementById('delete-msg');
  if (msg) msg.textContent = `Delete ${ids.length} item${ids.length!==1?'s':''}? This cannot be undone.`;
  showModal('delete-modal');
}

export function openMoveModal(ids = null) {
  _ctx = { action: 'move', ids: ids || [...state.selectedIds], selectedFolderId: null };
  const tree = document.getElementById('move-folder-tree');
  if (tree) {
    getAllFolders().then(folders => {
      tree.innerHTML = folders.map(f => `
        <div class="folder-tree-item folder-tree-indent-${Math.min(f.depth,3)}" data-folder-id="${f.id}"
             style="padding-left:${Math.max(f.depth*20,12)}px">
          📁 ${esc(f.name)}
        </div>`).join('');
      tree.querySelectorAll('.folder-tree-item').forEach(item => {
        item.addEventListener('click', () => {
          tree.querySelectorAll('.folder-tree-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          _ctx.selectedFolderId = item.dataset.folderId;
        });
      });
    });
  }
  showModal('move-modal');
}

export function openDeleteModal() { openDeleteModal_inner([...state.selectedIds]); }

function showModal(id) {
  document.getElementById('modal-overlay')?.classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  _ctx = {};
}

async function handleCreateFolder() {
  const inp = document.getElementById('new-folder-input');
  const name = inp?.value?.trim();
  if (!name) { inp?.focus(); return; }
  const btn = document.getElementById('new-folder-create');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    await createFolder(name, state.currentFolder);
    closeModal();
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
    showToast(`Folder "${name}" created`, 'success');
  } catch (err) { showToast(err.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Create'; } }
}

async function handleRename() {
  const inp = document.getElementById('rename-input');
  const name = inp?.value?.trim();
  if (!name || !_ctx.id) return;
  try {
    await renameNode(_ctx.id, name);
    closeModal();
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
    showToast('Renamed successfully', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleDelete() {
  const ids = _ctx.ids || [];
  closeModal();
  let ok = 0;
  for (const id of ids) {
    try { await deleteNode(id); ok++; }
    catch (err) { showToast(`Delete failed: ${err.message}`, 'error'); }
  }
  if (ok > 0) {
    showToast(`${ok} item${ok!==1?'s':''} deleted`, 'success');
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
  }
  exitSelectMode();
}

async function handleMove() {
  const targetId = _ctx.selectedFolderId;
  if (!targetId) { showToast('Select a destination folder', 'warning'); return; }
  const ids = _ctx.ids || [];
  closeModal();
  let ok = 0;
  for (const id of ids) {
    try { await moveNode(id, targetId); ok++; }
    catch (err) { showToast(`Move failed: ${err.message}`, 'error'); }
  }
  if (ok > 0) {
    showToast(`${ok} item${ok!==1?'s':''} moved`, 'success');
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
  }
  exitSelectMode();
}

// ============================================================
// CONTEXT MENU
// ============================================================
function bindContextMenu() {
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('scroll', hideContextMenu, true);
}

function showContextMenu(event, id, type, name) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.innerHTML = `
    ${type==='file' ? `<div class="ctx-item" data-action="preview">👁️ Preview</div>` : ''}
    ${type==='file' ? `<div class="ctx-item" data-action="download">⬇️ Download</div>` : ''}
    ${type==='folder' ? `<div class="ctx-item" data-action="open">📂 Open</div>` : ''}
    <div class="ctx-item" data-action="rename">✏️ Rename</div>
    <div class="ctx-item" data-action="move">📁 Move to…</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item danger" data-action="delete">🗑️ Delete</div>`;

  const x = Math.min(event.clientX, window.innerWidth - 200);
  const y = Math.min(event.clientY, window.innerHeight - 200);
  menu.style.left = `${x}px`; menu.style.top = `${y}px`;
  menu.classList.remove('hidden');

  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      handleCtxAction(item.dataset.action, id, type, name);
      hideContextMenu();
    });
  });
}

function hideContextMenu() {
  document.getElementById('context-menu')?.classList.add('hidden');
}

function handleCtxAction(action, id, type, name) {
  const node = getNodeById(id);
  switch (action) {
    case 'preview':  if (node) openPreview({ id, name, size: node.size, timestamp: node.timestamp, node }); break;
    case 'download': triggerDownload(id).catch(e => showToast(e.message, 'error')); break;
    case 'open':     if (node && node.type==='folder') navigateToFolder(node); break;
    case 'rename':   openRenameModal(id, name); break;
    case 'move':     openMoveModal([id]); break;
    case 'delete':   openDeleteModal_inner([id]); break;
  }
}

// ============================================================
// UPLOAD SHEET
// ============================================================
function bindUploadSheet() {
  document.getElementById('upload-sheet-close')?.addEventListener('click', closeUploadSheet);
  document.getElementById('upload-sheet-overlay')?.addEventListener('click', closeUploadSheet);
  document.getElementById('upload-start-btn')?.addEventListener('click', startUploads);

  const dropzone  = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  if (dropzone && fileInput) setupDropzone(dropzone, fileInput);
}

export function openUploadSheet() {
  document.getElementById('upload-sheet-overlay')?.classList.remove('hidden');
  document.getElementById('upload-sheet')?.classList.remove('hidden');
  setUploadTarget(state.currentFolder, async () => {
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
    closeUploadSheet();
  });
}

function closeUploadSheet() {
  document.getElementById('upload-sheet-overlay')?.classList.add('hidden');
  document.getElementById('upload-sheet')?.classList.add('hidden');
}

// ============================================================
// PREVIEW OVERLAY
// ============================================================
function bindPreviewOverlay() {
  document.getElementById('preview-close-btn')?.addEventListener('click', closePreview);
  document.getElementById('preview-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('preview-overlay')) closePreview();
  });
}

// ============================================================
// HEADER
// ============================================================
function bindHeader() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('logo-home')?.addEventListener('click', () => showView('home'));
}

// ============================================================
// TOAST
// ============================================================
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type]||'💬'}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('leaving'); toast.addEventListener('animationend', () => toast.remove()); }, duration);
}

// ============================================================
// HELPERS
// ============================================================
export function fileIconClass(ext, isFolder = false) {
  if (isFolder) return 'file-icon-folder';
  if (['pdf'].includes(ext)) return 'file-icon-pdf';
  if (['jpg','jpeg','png','webp','gif','svg','bmp'].includes(ext)) return 'file-icon-image';
  if (['doc','docx','ppt','pptx','xls','xlsx','odt'].includes(ext)) return 'file-icon-doc';
  if (['java','c','cpp','py','js','ts','html','css','rb','go','rs','sh','sql','json','xml','yaml','md','ipynb'].includes(ext)) return 'file-icon-code';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'file-icon-zip';
  return 'file-icon-txt';
}

export function fileEmoji(ext) {
  const map = {
    pdf:'📄', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', webp:'🖼️', gif:'🖼️', svg:'🖼️',
    doc:'📝', docx:'📝', ppt:'📊', pptx:'📊', xls:'📈', xlsx:'📈',
    py:'🐍', js:'💛', ts:'💛', html:'🌐', css:'🎨', java:'⚙️', c:'⚙️', cpp:'⚙️',
    sql:'🗄️', json:'📋', xml:'📋', yaml:'📋', md:'📋', ipynb:'📓',
    zip:'🗜️', rar:'🗜️', '7z':'🗜️',
  };
  return map[ext] || '📄';
}

function esc(str) {
  return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escAttr(str) { return String(str||'').replace(/"/g,'&quot;'); }

// ---- Expose to inline onclick handlers ----
window.AppUI = {
  showView, toggleViewMode,
  enterSelectMode: (id) => enterSelectMode(id),
  exitSelectMode, bulkDownload, openMoveModal, openDeleteModal,
  showToast,
};
