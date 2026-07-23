// Study Vault — Search Module (search.js)

import { getAllNodes } from './storage.js';
import { savePref, loadPref } from './localdb.js';

let _searchIndex = [];
let _lastIndexed = 0;
const INDEX_TTL = 3 * 60 * 1000; // 3 minutes

// ---- Build/refresh search index ----
export async function buildSearchIndex(force = false) {
  const now = Date.now();
  if (!force && _searchIndex.length > 0 && (now - _lastIndexed) < INDEX_TTL) {
    return _searchIndex;
  }
  try {
    const nodes = await getAllNodes();
    _searchIndex = nodes;
    _lastIndexed = now;
    return nodes;
  } catch (err) {
    console.warn('[Search] Index build failed:', err);
    return _searchIndex;
  }
}

// ---- Load index from storage (on startup) ----
export async function loadIndexFromCache() {
  // Build fresh from local DB — always fast and current
  try {
    await buildSearchIndex(true);
  } catch (_) {}
}

// ---- Perform search ----
export function search(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const results = [];

  for (const node of _searchIndex) {
    const name = (node.name || '').toLowerCase();
    const path = (node.path || '').toLowerCase();

    let score = 0;
    let allMatch = true;

    for (const term of terms) {
      if (name === term)            { score += 100; }
      else if (name.startsWith(term)) { score += 60;  }
      else if (name.includes(term))   { score += 30;  }
      else if (path.includes(term))   { score += 10;  }
      else { allMatch = false; break; }
    }

    if (allMatch && score > 0) results.push({ ...node, score });
  }

  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return b.score - a.score;
  });

  return results.slice(0, 60);
}

// ---- Highlight matching text ----
export function highlight(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const escaped = escapeRegex(query.trim());
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="highlight">$1</mark>');
}

// ---- Debounce ----
export function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
