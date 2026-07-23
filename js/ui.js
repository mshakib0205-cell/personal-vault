// Study Vault — UI Module (ui.js)
// View management, rendering, dark mode, grid/list, toasts

import { listFolder, createFolder, renameNode, moveNode, deleteNode, getAllFolders, getFolderPath, getRecentFiles, formatSize, formatDate, getExtension, getNodeById } from './storage.js';
import { openPreview, closePreview } from './preview.js';
import { triggerDownload } from './storage.js';
import { buildSearchIndex, search, highlight, debounce } from './search.js';
import { getVaultFolder } from './mega.js';
import { getQuotaInfo, getUserInfo } from './mega.js';
import { startUploads, setUploadTarget, setupDropzone, queueFiles } from './upload.js';
import { clearAllCache } from './cache.js';

// ---- App State ----
const state = {
  currentView: 'home',
  currentFolder: null,      // MEGA node object
  currentFolderStack: [],   // breadcrumb stack [{id, name, node}]
  viewMode: localStorage.getItem('sv_viewmode') || 'grid',
  theme: localStorage.getItem('sv_theme') || 'dark',
  selectedIds: new Set(),
  selectMode: false,
  searchQuery: '',
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

  // Load vault root
  state.currentFolder = getVaultFolder();
  state.currentFolderStack = [{
    id: state.currentFolder?.nodeId,
    name: 'StudyVault',
    node: state.currentFolder,
  }];

  // Build search index in background
  buildSearchIndex(true).catch(() => {});

  // Navigate to home
  await showView('home');
}

// ---- Navigation ----
function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'upload') {
        openUploadSheet();
        return;
      }
      showView(view);
    });
  });
}

// ---- Switch Views ----
export async function showView(viewName) {
  state.currentView = viewName;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Hide all views
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));

  // Show target
  const el = document.getElementById(`view-${viewName}`);
  if (el) el.classList.add('active');

  // Show/hide FAB
  const fab = document.getElementById('fab-new-folder');
  if (fab) fab.classList.toggle('hidden', viewName !== 'folders');

  // Render view content
  if (viewName === 'home') await renderHome();
  else if (viewName === 'folders') await renderFolders();
  else if (viewName === 'search') renderSearchView();
  else if (viewName === 'settings') renderSettings();
}

// ====================================================
// HOME VIEW
// ====================================================
async function renderHome() {
  const container = document.getElementById('view-home');
  if (!container) return;

  // Show skeleton
  container.innerHTML = `
    <div class="stats-grid">
      ${Array(4).fill('<div class="stat-card skeleton" style="height:90px"></div>').join('')}
    </div>
    <div class="section-header"><div class="section-title">Recent Files</div></div>
    <div class="file-grid">${Array(6).fill('<div class="skeleton" style="height:140px;border-radius:12px"></div>').join('')}</div>
  `;

  try {
    const recent = getRecentFiles(12);
    const quotaInfo = await getQuotaInfo();
    const userInfo = getUserInfo();
    const allNodes = getAllNodesFlat();
    const folderCount = allNodes.filter(n => n.type === 'folder').length;
    const fileCount = allNodes.filter(n => n.type === 'file').length;
    const usedPct = quotaInfo ? Math.round((quotaInfo.used / quotaInfo.total) * 100) : 0;

    container.innerHTML = `
      <!-- Storage Bar -->
      <div class="storage-bar">
        <div class="storage-bar-label">
          <span>☁️ MEGA Storage</span>
          <span>${formatSize(quotaInfo?.used || 0)} of ${formatSize(quotaInfo?.total || 20*1024*1024*1024)} used</span>
        </div>
        <div class="storage-progress"><div class="storage-fill" style="width:${usedPct}%"></div></div>
      </div>

      <!-- Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📁</div>
          <div class="stat-value">${folderCount}</div>
          <div class="stat-label">Folders</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📄</div>
          <div class="stat-value">${fileCount}</div>
          <div class="stat-label">Files</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💾</div>
          <div class="stat-value">${formatSize(quotaInfo?.used || 0)}</div>
          <div class="stat-label">Used</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">👤</div>
          <div class="stat-value" style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml((userInfo?.name || userInfo?.email || 'You').split('@')[0])}</div>
          <div class="stat-label">Account</div>
        </div>
      </div>

      <!-- Recent Files -->
      <div class="section-header">
        <div class="section-title">Recent Files</div>
        <button class="btn btn-ghost btn-sm" onclick="window.AppUI.showView('folders')">See all →</button>
      </div>

      ${recent.length === 0
        ? `<div class="empty-state">
            <div class="empty-state-icon">📚</div>
            <h3>No files yet</h3>
            <p>Upload your first study file to get started</p>
          </div>`
        : `<div class="${state.viewMode === 'grid' ? 'file-grid' : 'file-list'}">
            ${recent.map((f) => renderFileItem(f, false)).join('')}
          </div>`
      }
    `;

    attachFileItemListeners(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error loading</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ====================================================
// FOLDERS VIEW
// ====================================================
async function renderFolders(folder = null) {
  const container = document.getElementById('view-folders');
  if (!container) return;

  const targetFolder = folder || state.currentFolder || getVaultFolder();
  state.currentFolder = targetFolder;

  // Show skeleton
  container.innerHTML = `<div class="skeleton" style="height:40px;margin-bottom:16px;border-radius:8px"></div>
    <div class="file-grid">${Array(6).fill('<div class="skeleton" style="height:140px;border-radius:12px"></div>').join('')}</div>`;

  try {
    const { folders, files } = await listFolder(targetFolder);
    const allItems = [...folders, ...files];

    container.innerHTML = `
      <!-- Breadcrumb -->
      <div class="breadcrumb" id="folder-breadcrumb">
        ${renderBreadcrumb()}
      </div>

      <!-- Multi-select bar -->
      <div class="multiselect-bar hidden" id="multiselect-bar">
        <span class="multiselect-count" id="multiselect-count">0 selected</span>
        <div class="multiselect-actions">
          <button class="btn-icon" title="Download selected" id="ms-download" onclick="window.AppUI.bulkDownload()">⬇️</button>
          <button class="btn-icon" title="Move selected" id="ms-move" onclick="window.AppUI.openMoveModal()">📁</button>
          <button class="btn-icon" title="Delete selected" id="ms-delete" onclick="window.AppUI.openDeleteModal()">🗑️</button>
          <button class="btn-icon" title="Cancel" onclick="window.AppUI.exitSelectMode()">✕</button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="file-toolbar">
        <div class="file-toolbar-left">
          <span class="file-count">${allItems.length} item${allItems.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="file-toolbar-right">
          <button class="btn-icon" title="Toggle view" onclick="window.AppUI.toggleViewMode()" id="view-toggle-btn">
            ${state.viewMode === 'grid' ? '☰' : '⊞'}
          </button>
          ${allItems.length > 0 ? `<button class="btn-icon" title="Select all" onclick="window.AppUI.enterSelectMode()">☑️</button>` : ''}
        </div>
      </div>

      <!-- Content -->
      ${allItems.length === 0
        ? `<div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <h3>Empty folder</h3>
            <p>Tap + to create a folder or ⬆️ to upload files</p>
          </div>`
        : `<div id="file-container" class="${state.viewMode === 'grid' ? 'file-grid' : 'file-list'} ${state.selectMode ? 'select-mode' : ''}">
            ${allItems.map((item) => renderFileItem(item, true)).join('')}
          </div>`
      }
    `;

    attachFileItemListeners(container);
    attachBreadcrumbListeners();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ---- Render Breadcrumb ----
function renderBreadcrumb() {
  return state.currentFolderStack.map((item, i) => {
    const isLast = i === state.currentFolderStack.length - 1;
    return `
      ${i > 0 ? '<span class="breadcrumb-sep">›</span>' : ''}
      <span class="breadcrumb-item ${isLast ? 'current' : ''}" data-crumb-idx="${i}">
        ${i === 0 ? '📚 ' : ''}${escapeHtml(item.name)}
      </span>
    `;
  }).join('');
}

function attachBreadcrumbListeners() {
  document.querySelectorAll('.breadcrumb-item').forEach((el) => {
    const idx = parseInt(el.dataset.crumbIdx, 10);
    if (isNaN(idx)) return;
    el.addEventListener('click', () => {
      if (idx === state.currentFolderStack.length - 1) return; // already here
      state.currentFolderStack = state.currentFolderStack.slice(0, idx + 1);
      state.currentFolder = state.currentFolderStack[idx].node;
      renderFolders(state.currentFolder);
    });
  });
}

// ====================================================
// FILE ITEM RENDERING
// ====================================================
function renderFileItem(item, withContext = true) {
  const isFolder = item.type === 'folder';
  const ext = item.ext || getExtension(item.name);
  const iconClass = getFileIconClass(ext, isFolder);
  const emoji = isFolder ? '📁' : getFileEmoji(ext);
  const selected = state.selectedIds.has(item.id);

  if (state.viewMode === 'grid') {
    return `
      <div class="file-card ${selected ? 'selected' : ''}" data-id="${item.id}" data-type="${item.type}"
           data-name="${escapeAttr(item.name)}" data-size="${item.size || 0}" data-ts="${item.timestamp || 0}">
        <div class="file-card-checkbox">${selected ? '✓' : ''}</div>
        <div class="file-card-icon">
          <div class="file-icon ${iconClass}">${emoji}</div>
        </div>
        <div class="file-card-name">${escapeHtml(item.name)}</div>
        <div class="file-card-meta">${isFolder ? '' : formatSize(item.size)}</div>
      </div>
    `;
  } else {
    return `
      <div class="file-row ${selected ? 'selected' : ''}" data-id="${item.id}" data-type="${item.type}"
           data-name="${escapeAttr(item.name)}" data-size="${item.size || 0}" data-ts="${item.timestamp || 0}">
        <div class="file-icon ${iconClass}">${emoji}</div>
        <div class="file-row-info">
          <div class="file-row-name">${escapeHtml(item.name)}</div>
          <div class="file-row-meta">${isFolder ? 'Folder' : formatDate(item.timestamp)}</div>
        </div>
        <div class="file-row-size">${isFolder ? '' : formatSize(item.size)}</div>
        <div class="file-row-actions">
          <button class="btn-icon ctx-trigger" data-id="${item.id}" title="More options" 
                  style="font-size:18px">⋯</button>
        </div>
      </div>
    `;
  }
}

// ---- Attach click listeners to file items ----
function attachFileItemListeners(container) {
  container.querySelectorAll('[data-id]').forEach((el) => {
    const id = el.dataset.id;
    const type = el.dataset.type;

    // Long press → select mode
    let pressTimer;
    el.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => enterSelectMode(id), 500);
    });
    el.addEventListener('pointerup', () => clearTimeout(pressTimer));
    el.addEventListener('pointerleave', () => clearTimeout(pressTimer));

    // Click
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('ctx-trigger')) return;
      if (e.target.classList.contains('file-card-checkbox')) return;

      if (state.selectMode) {
        toggleSelect(id);
        return;
      }

      if (type === 'folder') {
        const node = getNodeById(id);
        if (node) navigateToFolder(node);
      } else {
        const node = getNodeById(id);
        if (node) {
          const name = el.dataset.name;
          const size = parseInt(el.dataset.size || '0');
          const ts = parseInt(el.dataset.ts || '0');
          openPreview({ id, name, size, timestamp: ts, node });
        }
      }
    });

    // Context menu trigger
    const ctxBtn = el.querySelector('.ctx-trigger');
    if (ctxBtn) {
      ctxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(e, id, type, el.dataset.name);
      });
    }

    // Right-click context
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, id, type, el.dataset.name);
    });
  });
}

// ---- Navigate into folder ----
function navigateToFolder(folderNode) {
  state.currentFolderStack.push({ id: folderNode.nodeId, name: folderNode.name, node: folderNode });
  state.currentFolder = folderNode;
  if (state.currentView !== 'folders') showView('folders');
  else renderFolders(folderNode);
}

// ====================================================
// SEARCH VIEW
// ====================================================
function renderSearchView() {}

export function executeSearch(query) {
  const container = document.getElementById('view-search');
  if (!container) return;

  const q = query.trim();
  state.searchQuery = q;

  if (!q) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Search your files</h3><p>Type in the search bar above</p></div>`;
    return;
  }

  const results = search(q);

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😕</div><h3>No results</h3><p>No files or folders match "<strong>${escapeHtml(q)}</strong>"</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="search-query-display">${results.length} result${results.length !== 1 ? 's' : ''} for <strong>"${escapeHtml(q)}"</strong></div>
    <div class="file-list">
      ${results.map((r) => {
        const isFolder = r.type === 'folder';
        const ext = r.ext || '';
        const iconClass = getFileIconClass(ext, isFolder);
        const emoji = isFolder ? '📁' : getFileEmoji(ext);
        const pathParts = (r.path || '').split(' / ');
        const parentPath = pathParts.slice(0, -1).join(' › ');

        return `
          <div class="file-row" data-id="${r.id}" data-type="${r.type}" data-name="${escapeAttr(r.name)}" data-size="${r.size || 0}" data-ts="${r.timestamp || 0}">
            <div class="file-icon ${iconClass}">${emoji}</div>
            <div class="file-row-info">
              <div class="file-row-name">${highlight(r.name, q)}</div>
              ${parentPath ? `<div class="search-result-path">📁 ${escapeHtml(parentPath)}</div>` : ''}
            </div>
            <div class="file-row-size">${isFolder ? 'Folder' : formatSize(r.size)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  attachFileItemListeners(container);
}

// ---- Setup search input ----
function setupSearchInput() {
  const input = document.getElementById('header-search');
  if (!input) return;

  const debouncedSearch = debounce((q) => {
    if (state.currentView !== 'search') showView('search');
    executeSearch(q);
  }, 200);

  input.addEventListener('input', (e) => {
    const q = e.target.value;
    if (q.length > 0) debouncedSearch(q);
    else if (state.currentView === 'search') {
      executeSearch('');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (state.currentView !== 'search') showView('search');
      executeSearch(input.value);
    }
    if (e.key === 'Escape') {
      input.value = '';
      if (state.currentView === 'search') showView('home');
    }
  });
}

// ====================================================
// SETTINGS VIEW
// ====================================================
function renderSettings() {
  const container = document.getElementById('view-settings');
  if (!container) return;

  const userInfo = getUserInfo();

  container.innerHTML = `
    <div class="section-title" style="margin-bottom:20px;font-size:20px">Settings</div>

    <!-- Account -->
    <div class="settings-section">
      <div class="settings-section-title">Account</div>
      <div class="settings-item">
        <div class="settings-item-left">
          <div class="settings-item-icon">👤</div>
          <div>
            <div class="settings-item-label">${escapeHtml(userInfo?.name || 'MEGA User')}</div>
            <div class="settings-item-sub">${escapeHtml(userInfo?.email || '')}</div>
          </div>
        </div>
      </div>
      <div class="settings-item" id="settings-logout" style="cursor:pointer">
        <div class="settings-item-left">
          <div class="settings-item-icon">🚪</div>
          <div class="settings-item-label" style="color:var(--danger)">Sign Out</div>
        </div>
        <span style="color:var(--text-tertiary)">›</span>
      </div>
    </div>

    <!-- Appearance -->
    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>
      <div class="settings-item">
        <div class="settings-item-left">
          <div class="settings-item-icon">🌙</div>
          <div>
            <div class="settings-item-label">Dark Mode</div>
            <div class="settings-item-sub">Switch between dark and light theme</div>
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="dark-mode-toggle" ${state.theme === 'dark' ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-item">
        <div class="settings-item-left">
          <div class="settings-item-icon">⊞</div>
          <div>
            <div class="settings-item-label">Grid View</div>
            <div class="settings-item-sub">Show files as grid cards</div>
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="grid-view-toggle" ${state.viewMode === 'grid' ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Storage -->
    <div class="settings-section">
      <div class="settings-section-title">Storage</div>
      <div class="settings-item">
        <div class="settings-item-left">
          <div class="settings-item-icon">☁️</div>
          <div>
            <div class="settings-item-label">MEGA Cloud Storage</div>
            <div class="settings-item-sub">20 GB free • mega.nz</div>
          </div>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
      <div class="settings-item" id="settings-clear-cache" style="cursor:pointer">
        <div class="settings-item-left">
          <div class="settings-item-icon">🗑️</div>
          <div>
            <div class="settings-item-label">Clear Offline Cache</div>
            <div class="settings-item-sub">Free up local storage</div>
          </div>
        </div>
        <span style="color:var(--text-tertiary)">›</span>
      </div>
    </div>

    <!-- About -->
    <div class="settings-section">
      <div class="settings-section-title">About</div>
      <div class="settings-item">
        <div class="settings-item-left">
          <div class="settings-item-icon">📚</div>
          <div>
            <div class="settings-item-label">Study Vault</div>
            <div class="settings-item-sub">Version 1.0 • Personal Study File Manager</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind settings actions
  document.getElementById('dark-mode-toggle')?.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    applyTheme(theme);
  });

  document.getElementById('grid-view-toggle')?.addEventListener('change', (e) => {
    state.viewMode = e.target.checked ? 'grid' : 'list';
    localStorage.setItem('sv_viewmode', state.viewMode);
  });

  document.getElementById('settings-logout')?.addEventListener('click', () => {
    if (confirm('Sign out of Study Vault?')) {
      clearAllCache().finally(() => {
        import('./mega.js').then(({ logout }) => logout());
      });
    }
  });

  document.getElementById('settings-clear-cache')?.addEventListener('click', async () => {
    await clearAllCache();
    showToast('Offline cache cleared', 'success');
  });
}

// ====================================================
// THEME
// ====================================================
export function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sv_theme', theme);
}

// ====================================================
// VIEW MODE
// ====================================================
export function toggleViewMode() {
  state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
  localStorage.setItem('sv_viewmode', state.viewMode);
  if (state.currentView === 'folders') renderFolders(state.currentFolder);
  else if (state.currentView === 'home') renderHome();
}

// ====================================================
// SELECT MODE
// ====================================================
function enterSelectMode(initialId = null) {
  state.selectMode = true;
  state.selectedIds.clear();
  if (initialId) state.selectedIds.add(initialId);
  refreshSelectUI();
}

export function exitSelectMode() {
  state.selectMode = false;
  state.selectedIds.clear();
  refreshSelectUI();
  if (state.currentView === 'folders') renderFolders(state.currentFolder);
}

function toggleSelect(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  refreshSelectUI();

  // Update individual card
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.toggle('selected', state.selectedIds.has(id));
    const cb = el.querySelector('.file-card-checkbox');
    if (cb) cb.textContent = state.selectedIds.has(id) ? '✓' : '';
  }
}

function refreshSelectUI() {
  const bar = document.getElementById('multiselect-bar');
  const countEl = document.getElementById('multiselect-count');
  const container = document.getElementById('file-container');

  if (bar) bar.classList.toggle('hidden', !state.selectMode || state.selectedIds.size === 0);
  if (countEl) countEl.textContent = `${state.selectedIds.size} selected`;
  if (container) container.classList.toggle('select-mode', state.selectMode);
}

export async function bulkDownload() {
  for (const id of state.selectedIds) {
    const node = getNodeById(id);
    if (node && !node.directory) {
      await triggerDownload(id).catch(() => {});
    }
  }
  exitSelectMode();
}

// ====================================================
// MODALS
// ====================================================
function bindModals() {
  // New Folder
  document.getElementById('fab-new-folder')?.addEventListener('click', openNewFolderModal);
  document.getElementById('new-folder-cancel')?.addEventListener('click', closeModal);
  document.getElementById('new-folder-create')?.addEventListener('click', handleCreateFolder);
  document.getElementById('new-folder-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateFolder();
  });

  // Rename
  document.getElementById('rename-cancel')?.addEventListener('click', closeModal);
  document.getElementById('rename-save')?.addEventListener('click', handleRename);
  document.getElementById('rename-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRename();
  });

  // Delete confirm
  document.getElementById('delete-cancel')?.addEventListener('click', closeModal);
  document.getElementById('delete-confirm')?.addEventListener('click', handleDelete);

  // Move
  document.getElementById('move-cancel')?.addEventListener('click', closeModal);
  document.getElementById('move-confirm')?.addEventListener('click', handleMove);

  // Close modal on overlay click
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

let _modalContext = {};

function openNewFolderModal() {
  _modalContext = { action: 'new-folder' };
  showModal('new-folder-modal');
  document.getElementById('new-folder-input').value = '';
  document.getElementById('new-folder-input').focus();
}

function openRenameModal(id, currentName) {
  _modalContext = { action: 'rename', id };
  showModal('rename-modal');
  const input = document.getElementById('rename-input');
  input.value = currentName;
  input.focus();
  input.select();
}

function openDeleteModal(ids = null) {
  _modalContext = { action: 'delete', ids: ids || [...state.selectedIds] };
  const count = _modalContext.ids.length;
  const msg = document.getElementById('delete-msg');
  if (msg) msg.textContent = `Delete ${count} item${count !== 1 ? 's' : ''}? This cannot be undone.`;
  showModal('delete-modal');
}

export function openMoveModal(ids = null) {
  _modalContext = { action: 'move', ids: ids || [...state.selectedIds], selectedFolderId: null };
  const tree = document.getElementById('move-folder-tree');
  if (tree) {
    const folders = getAllFolders();
    tree.innerHTML = folders.map((f) => `
      <div class="folder-tree-item folder-tree-indent-${Math.min(f.depth, 3)}" data-folder-id="${f.id}"
           style="padding-left:${Math.max(f.depth * 20, 12)}px">
        📁 ${escapeHtml(f.name)}
      </div>
    `).join('');
    tree.querySelectorAll('.folder-tree-item').forEach((item) => {
      item.addEventListener('click', () => {
        tree.querySelectorAll('.folder-tree-item').forEach((i) => i.classList.remove('selected'));
        item.classList.add('selected');
        _modalContext.selectedFolderId = item.dataset.folderId;
      });
    });
  }
  showModal('move-modal');
}

export function openDeleteModal_exposed() { openDeleteModal(); }

function showModal(id) {
  document.getElementById('modal-overlay')?.classList.remove('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  _modalContext = {};
}

async function handleCreateFolder() {
  const input = document.getElementById('new-folder-input');
  const name = input?.value?.trim();
  if (!name) { input.focus(); return; }

  const btn = document.getElementById('new-folder-create');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  try {
    await createFolder(name, state.currentFolder);
    closeModal();
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
    showToast(`Folder "${name}" created`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create'; }
  }
}

async function handleRename() {
  const input = document.getElementById('rename-input');
  const name = input?.value?.trim();
  if (!name || !_modalContext.id) return;

  try {
    await renameNode(_modalContext.id, name);
    closeModal();
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
    showToast('Renamed successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDelete() {
  const ids = _modalContext.ids || [];
  closeModal();

  let successCount = 0;
  for (const id of ids) {
    try {
      await deleteNode(id);
      successCount++;
    } catch (err) {
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  }

  if (successCount > 0) {
    showToast(`${successCount} item${successCount !== 1 ? 's' : ''} deleted`, 'success');
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
  }
  exitSelectMode();
}

async function handleMove() {
  const targetId = _modalContext.selectedFolderId;
  if (!targetId) { showToast('Please select a destination folder', 'warning'); return; }

  const ids = _modalContext.ids || [];
  closeModal();

  let successCount = 0;
  for (const id of ids) {
    try {
      await moveNode(id, targetId);
      successCount++;
    } catch (err) {
      showToast(`Failed to move: ${err.message}`, 'error');
    }
  }

  if (successCount > 0) {
    showToast(`${successCount} item${successCount !== 1 ? 's' : ''} moved`, 'success');
    await renderFolders(state.currentFolder);
    await buildSearchIndex(true);
  }
  exitSelectMode();
}

// ====================================================
// CONTEXT MENU
// ====================================================
function bindContextMenu() {
  document.addEventListener('click', () => hideContextMenu());
  document.addEventListener('scroll', () => hideContextMenu());
}

function showContextMenu(event, id, type, name) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  menu.dataset.id = id;
  menu.dataset.type = type;
  menu.dataset.name = name;

  menu.innerHTML = `
    ${type === 'file' ? `<div class="ctx-item" data-action="preview">👁️ Preview</div>` : ''}
    ${type === 'file' ? `<div class="ctx-item" data-action="download">⬇️ Download</div>` : ''}
    ${type === 'folder' ? `<div class="ctx-item" data-action="open">📂 Open</div>` : ''}
    <div class="ctx-item" data-action="rename">✏️ Rename</div>
    <div class="ctx-item" data-action="move">📁 Move to…</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item danger" data-action="delete">🗑️ Delete</div>
  `;

  // Position
  const x = Math.min(event.clientX, window.innerWidth - 200);
  const y = Math.min(event.clientY, window.innerHeight - 200);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove('hidden');

  // Actions
  menu.querySelectorAll('.ctx-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleContextAction(item.dataset.action, id, type, name);
      hideContextMenu();
    });
  });
}

function hideContextMenu() {
  document.getElementById('context-menu')?.classList.add('hidden');
}

function handleContextAction(action, id, type, name) {
  const node = getNodeById(id);
  switch (action) {
    case 'preview':
      if (node) openPreview({ id, name, size: node.size, timestamp: node.timestamp, node });
      break;
    case 'download':
      triggerDownload(id).catch((e) => showToast(e.message, 'error'));
      break;
    case 'open':
      if (node && node.directory) navigateToFolder(node);
      break;
    case 'rename':
      openRenameModal(id, name);
      break;
    case 'move':
      openMoveModal([id]);
      break;
    case 'delete':
      openDeleteModal([id]);
      break;
  }
}

// ====================================================
// UPLOAD SHEET
// ====================================================
function bindUploadSheet() {
  const closeBtn = document.getElementById('upload-sheet-close');
  const overlay = document.getElementById('upload-sheet-overlay');
  const startBtn = document.getElementById('upload-start-btn');
  const fileInput = document.getElementById('file-input');
  const dropzone = document.getElementById('dropzone');

  overlay?.addEventListener('click', closeUploadSheet);
  closeBtn?.addEventListener('click', closeUploadSheet);
  startBtn?.addEventListener('click', () => {
    startUploads();
  });

  if (dropzone && fileInput) {
    setupDropzone(dropzone, fileInput);
  }
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

// ====================================================
// PREVIEW OVERLAY
// ====================================================
function bindPreviewOverlay() {
  document.getElementById('preview-close-btn')?.addEventListener('click', closePreview);
  document.getElementById('preview-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('preview-overlay')) closePreview();
  });
}

// ====================================================
// HEADER
// ====================================================
function bindHeader() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  });
}

// ====================================================
// TOAST NOTIFICATIONS
// ====================================================
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ====================================================
// HELPERS
// ====================================================
function getAllNodesFlat() {
  try {
    const { getAllNodes } = window.__storageModule || {};
    if (getAllNodes) return getAllNodes();
  } catch (_) {}
  return [];
}

export function getFileIconClass(ext, isFolder = false) {
  if (isFolder) return 'file-icon-folder';
  if (['pdf'].includes(ext)) return 'file-icon-pdf';
  if (['jpg','jpeg','png','webp','gif','svg','bmp','ico'].includes(ext)) return 'file-icon-image';
  if (['doc','docx','ppt','pptx','xls','xlsx','odt','ods','odp'].includes(ext)) return 'file-icon-doc';
  if (['java','c','cpp','py','js','ts','jsx','tsx','html','css','rb','go','rs','sh','sql','json','xml','yaml','yml','md','ipynb','kt'].includes(ext)) return 'file-icon-code';
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return 'file-icon-zip';
  return 'file-icon-txt';
}

export function getFileEmoji(ext) {
  if (['pdf'].includes(ext)) return '📄';
  if (['jpg','jpeg','png','webp','gif','svg'].includes(ext)) return '🖼️';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['ppt','pptx'].includes(ext)) return '📊';
  if (['xls','xlsx'].includes(ext)) return '📈';
  if (['java','c','cpp'].includes(ext)) return '⚙️';
  if (['py'].includes(ext)) return '🐍';
  if (['js','ts','jsx','tsx'].includes(ext)) return '💛';
  if (['html'].includes(ext)) return '🌐';
  if (['css'].includes(ext)) return '🎨';
  if (['sql'].includes(ext)) return '🗄️';
  if (['json','xml','yaml'].includes(ext)) return '📋';
  if (['md'].includes(ext)) return '📋';
  if (['zip','rar','7z'].includes(ext)) return '🗜️';
  if (['ipynb'].includes(ext)) return '📓';
  return '📄';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}

// Expose to global for inline onclick handlers
window.AppUI = {
  showView,
  toggleViewMode,
  enterSelectMode,
  exitSelectMode,
  bulkDownload,
  openMoveModal,
  openDeleteModal: openDeleteModal_exposed,
};
