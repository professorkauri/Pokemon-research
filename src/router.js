// src/router.js
// Simple router with hash + query-string support.
// Route handlers are called as handler(params, query).

import { HomePage } from './pages/HomePage.js';
import { AdminPage } from './pages/AdminPage.js';
import { PokemonBrowsePage } from './pages/PokemonBrowsePage.js';
import { PokemonDetailPage } from './pages/PokemonDetailPage.js';
import { GamesPage } from './pages/GamesPage.js';
import { GameDetailPage } from './pages/GameDetailPage.js';

// --------- Route table ---------
const routes = [
  { pattern: '/home', handler: HomePage },
  { pattern: '/admin', handler: AdminPage },
  { pattern: '/pokemon', handler: PokemonBrowsePage },
  { pattern: '/pokemon/:id', handler: PokemonDetailPage },
  { pattern: '/games', handler: GamesPage },
  { pattern: '/games/:id', handler: GameDetailPage },
];

// Where to mount pages
const APP_ROOT_ID = 'app';
const DEFAULT_HASH = '#/home';

// --------- Utilities ---------
function compile(pattern) {
  // Convert '/pokemon/:id' -> /^\/pokemon\/([^/]+)$/
  const parts = pattern.split('/').filter(Boolean);
  const keys = [];
  const re = new RegExp(
    '^/' +
      parts
        .map((p) => {
          if (p.startsWith(':')) {
            keys.push(p.slice(1));
            return '([^/]+)';
          }
          return p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        })
        .join('/') +
      '$'
  );
  return { re, keys };
}

const compiled = routes.map((r) => ({ ...r, ...compile(r.pattern) }));

/**
 * Parse current URL into { path, query }.
 * - Primary router source is the hash (e.g. '#/pokemon?tab=stats')
 * - If the hash has no query, we also merge in window.location.search (?q=...),
 *   with the hash query taking priority if both exist.
 */
function parseLocation() {
  let raw = window.location.hash || '';
  if (!raw || raw === '#') raw = DEFAULT_HASH;

  const [hashPath, hashQueryString = ''] = raw.split('?');
  const path = hashPath.startsWith('#') ? hashPath.slice(1) : hashPath;

  // Parse hash query (if any)
  const hashQS = new URLSearchParams(hashQueryString);

  // Parse real search query (?foo=bar) as a fallback / merge
  const searchString = window.location.search.startsWith('?')
    ? window.location.search.slice(1)
    : '';
  const searchQS = new URLSearchParams(searchString);

  // Merge: hash query wins over real search params if keys collide
  const merged = {};
  for (const [k, v] of searchQS.entries()) merged[k] = v;
  for (const [k, v] of hashQS.entries()) merged[k] = v;

  return { path, query: merged };
}

function matchRoute(path) {
  for (const r of compiled) {
    const m = r.re.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] || '')));
      return { handler: r.handler, params };
    }
  }
  return null;
}

function mount(el) {
  const root = document.getElementById(APP_ROOT_ID) || document.body;
  while (root.firstChild) root.removeChild(root.firstChild);
  if (el instanceof Node) root.appendChild(el);
  else if (typeof el === 'string') root.innerHTML = el;
}

function buildHash(path, query) {
  const q = new URLSearchParams(query || {});
  const qs = q.toString();
  return '#' + path + (qs ? `?${qs}` : '');
}

// --------- Rendering ---------
export function renderCurrentRoute() {
  if (!window.location.hash || window.location.hash === '#') {
    window.location.replace(DEFAULT_HASH);
    return;
  }

  const { path, query } = parseLocation();
  const hit = matchRoute(path);

  if (!hit) {
    mount('Not found.');
    return;
  }

  try {
    const view = hit.handler(hit.params, query);
    mount(view);
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (err) {
    console.error('Route render error:', err);
    mount('Something went wrong rendering this page.');
  }
}

// --------- Public API ---------
/**
 * Navigate to a path+query. If `replace` is true, use history.replaceState
 * and force a render (since no hashchange event will fire).
 */
export function navigate(path, query = null, { replace = false } = {}) {
  const nextHash = buildHash(path, query);

  if (replace) {
    const url = new URL(window.location.href);
    url.hash = nextHash;
    history.replaceState(null, '', url);
    renderCurrentRoute();
    return;
  }

  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash; // will trigger 'hashchange'
  } else {
    // Same hash (e.g., only query logical change to same string) → force render
    renderCurrentRoute();
  }
}

/**
 * Update only the query of the current route (keeps the same path).
 * `patch` can be an object to merge or a function(prev) => next.
 */
export function updateQuery(patch, { replace = false } = {}) {
  const { path, query } = parseLocation();
  const nextQuery =
    typeof patch === 'function' ? patch({ ...query }) : { ...query, ...patch };
  navigate(path, nextQuery, { replace });
}

// --------- Init & link interception ---------
export function initRouter() {
  if (!window.location.hash || window.location.hash === '#') {
    window.location.replace(DEFAULT_HASH);
    // After replace, we’re already at the default; render immediately.
    renderCurrentRoute();
    return;
  }

  window.addEventListener('hashchange', renderCurrentRoute, { passive: true });
  // Catch navigation that changes only window.location.search (via History API)
  window.addEventListener('popstate', renderCurrentRoute, { passive: true });

  renderCurrentRoute();
}

// Intercept in-app anchor links (e.g., <a href="#/pokemon?tab=stats">)
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  e.preventDefault();
  const url = new URL(a.getAttribute('href'), window.location.origin);
  const hash = url.hash || DEFAULT_HASH;

  // Parse so we can navigate consistently (and support { replace } later if needed)
  const [hPath, hQS = ''] = hash.split('?');
  const path = hPath.startsWith('#') ? hPath.slice(1) : hPath;
  const query = Object.fromEntries(new URLSearchParams(hQS).entries());

  navigate(path, query);
});
