// Study Vault — MEGA SDK Wrapper (mega.js)
// Uses megajs library for MEGA cloud storage integration

const MEGAJS_CDN = 'https://unpkg.com/megajs/dist/main.browser-es.js';
const SESSION_KEY = 'sv_mega_session';
const REMEMBER_KEY = 'sv_mega_remember';
const VAULT_FOLDER_NAME = 'StudyVault';

let _Storage = null;
let _megaStorage = null;
let _vaultFolder = null;

// ---- Load megajs from CDN ----
async function loadMegaJS() {
  if (_Storage) return _Storage;
  try {
    const mod = await import(MEGAJS_CDN);
    _Storage = mod.Storage;
    return _Storage;
  } catch (err) {
    throw new Error(`Failed to load MEGA SDK: ${err.message}. Check your internet connection.`);
  }
}

// ---- Login with email/password ----
export async function login(email, password, remember = false) {
  const Storage = await loadMegaJS();

  return new Promise((resolve, reject) => {
    const storage = new Storage({ email, password }, (err) => {
      if (err) return reject(new Error(getMegaError(err)));
    });

    const timeout = setTimeout(() => {
      reject(new Error('Login timed out. Please check your credentials and try again.'));
    }, 30000);

    storage.on('ready', async () => {
      clearTimeout(timeout);
      _megaStorage = storage;

      // Save session
      try {
        const sessionData = JSON.stringify({
          sid: storage.sid,
          name: storage.name || email,
          email,
          ts: Date.now()
        });
        sessionStorage.setItem(SESSION_KEY, sessionData);
        if (remember) localStorage.setItem(REMEMBER_KEY, sessionData);
      } catch (_) {}

      try {
        _vaultFolder = await ensureVaultFolder();
      } catch (e) {
        console.warn('Could not create/find StudyVault folder:', e);
      }

      resolve(storage);
    });

    storage.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(getMegaError(err)));
    });
  });
}

// ---- Restore session from storage ----
export async function restoreSession() {
  const sessionStr = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY);
  if (!sessionStr) return null;

  try {
    const { sid } = JSON.parse(sessionStr);
    if (!sid) return null;

    const Storage = await loadMegaJS();
    return new Promise((resolve) => {
      const storage = new Storage({ sid }, (err) => {
        if (err) { clearSession(); resolve(null); }
      });

      const timeout = setTimeout(() => resolve(null), 15000);

      storage.on('ready', async () => {
        clearTimeout(timeout);
        _megaStorage = storage;
        try { _vaultFolder = await ensureVaultFolder(); } catch (_) {}
        resolve(storage);
      });

      storage.on('error', () => {
        clearTimeout(timeout);
        clearSession();
        resolve(null);
      });
    });
  } catch (_) {
    clearSession();
    return null;
  }
}

// ---- Logout ----
export function logout() {
  clearSession();
  _megaStorage = null;
  _vaultFolder = null;
  window.location.href = 'index.html';
}

// ---- Get active storage instance ----
export function getStorage() { return _megaStorage; }

// ---- Get vault root folder ----
export function getVaultFolder() { return _vaultFolder; }

// ---- Get user info ----
export function getUserInfo() {
  const sessionStr = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY);
  if (!sessionStr) return null;
  try { return JSON.parse(sessionStr); } catch (_) { return null; }
}

// ---- Check if logged in ----
export function isLoggedIn() {
  return !!(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY));
}

// ---- Clear session ----
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

// ---- Ensure StudyVault folder exists ----
async function ensureVaultFolder() {
  if (!_megaStorage) throw new Error('Not logged in');
  const root = _megaStorage.root;

  // Look for existing StudyVault folder
  for (const child of (root.children || [])) {
    if (child.name === VAULT_FOLDER_NAME && child.directory) {
      return child;
    }
  }

  // Create it
  return new Promise((resolve, reject) => {
    root.mkdir(VAULT_FOLDER_NAME, (err, folder) => {
      if (err) reject(err);
      else resolve(folder);
    });
  });
}

// ---- Get storage quota info ----
export async function getQuotaInfo() {
  if (!_megaStorage) return null;
  try {
    return {
      used: _megaStorage.storageUsed || 0,
      total: _megaStorage.storageCapacity || (20 * 1024 * 1024 * 1024), // 20GB default
    };
  } catch (_) {
    return { used: 0, total: 20 * 1024 * 1024 * 1024 };
  }
}

// ---- Translate MEGA errors ----
function getMegaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('enoent') || msg.includes('invalid') || msg.includes('credentials')) {
    return 'Invalid email or password. Please check and try again.';
  }
  if (msg.includes('etoomany')) return 'Too many login attempts. Please wait a few minutes.';
  if (msg.includes('eoverquota')) return 'Your MEGA account has exceeded its storage quota.';
  if (msg.includes('eaccess')) return 'Access denied. Please re-login.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Network error. Check your internet connection.';
  return err?.message || 'An unexpected error occurred. Please try again.';
}
