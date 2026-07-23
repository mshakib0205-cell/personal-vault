// Study Vault — Search Module (search.js)

import { getAllNodes } from './storage.js';
import { saveSearchIndex, loadSearchIndex } from './cache.js';

let _searchIndex = [];
let _lastIndexed = 0;
const INDEX_TTL = 5 * 60 * 1000; // 5 minutes

// ---- Build/refresh search index ----
export async function buildSearchIndex(force = false) {
  const now = Date.now();
  if (!force && _searchIndex.length > 0 && (now - _lastIndexed) < INDEX_TTL) {
    return _searchIndex;
  }

  try {
    const nodes = getAllNodes();
    _searchIndex = nodes;
    _lastIndexed = now;

    // Persist to IndexedDB for offline search
    await saveSearchIndex(nodes);
    return nodes;
  } catch (err) {
    // Try loading from cache
    if (_searchIndex.length === 0) {
      _searchIndex = await loadSearchIndex();
    }
    return _searchIndex;
  }
}

// ---- Load index from cache (on startup) ----
export async function loadIndexFromCache() {
  try {
    const cached = await loadSearchIndex();
    if (cached?.length > 0) {
      _searchIndex = cached;
    }
  } catch (_) {}
}

// ---- Perform search ----
export function search(query) {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  const results = [];

  for (const node of _searchIndex) {
    const name = (node.name || '').toLowerCase();
    const path = (node.path || '').toLowerCase();

    // Score: how well does this node match?
    let score = 0;
    let allMatch = true;

    for (const term of terms) {
      if (name === term) { score += 100; }
      else if (name.startsWith(term)) { score += 60; }
      else if (name.includes(term)) { score += 30; }
      else if (path.includes(term)) { score += 10; }
      else { allMatch = false; break; }
    }

    if (allMatch && score > 0) {
      results.push({ ...node, score });
    }
  }

  // Sort: folders first, then by score desc
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return b.score - a.score;
  });

  return results.slice(0, 60); // max 60 results
}

// ---- Highlight matching text ----
export function highlight(text, query) {
  if (!query || !text) return escapeHtml(text);
  const q = query.trim();
  const escaped = escapeRegex(q);
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

// ---- Helpers ----
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
