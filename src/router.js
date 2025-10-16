// src/router.js
// Simple hash router with query-string support.
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
          return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  return { re, keys };
}

const compiled = routes.map((r) => ({ ...r, ...compile(r.pattern) }));

function parseLocation() {
  // Ensure we always have a hash
  let raw = window.location.hash || '';
  if (!raw || raw === '#') raw = DEFAULT_HASH;

  const [hashPath, queryString = ''] = raw.split('?');

  // Normalise path: remove leading '#'
  const path = hashPath.startsWith('#') ? hashPath.slice(1) : hashPath;

  // Parse query params
  const qs = new URLSearchParams(queryString);
  const query = Object.fromEntries(qs.entries());

  return { path, query };
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
  // Clear
  while (root.firstChild) root.removeChild(root.firstChild);
  // Append
  if (el instanceof Node) root.appendChild(el);
  else if (typeof el === 'string') root.innerHTML = el;
}

// Build a new hash with optional query object
function buildHash(path, query) {
  const q = new URLSearchParams(query || {});
  const qs = q.toString();
  return '#' + path + (qs ? `?${qs}` : '');
}

// --------- Public API ---------
export function navigate(path, query = null) {
  const next = buildHash(path, query);
  if (window.location.hash !== next) {
    window.location.hash = next;
  } else {
    // If same hash, force a re-render
    renderCurrentRoute();
  }
}

export function renderCurrentRoute() {
  // Redirect empty hash -> default
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

  // Call the page: handler(params, query)
  try {
    const view = hit.handler(hit.params, query);
    mount(view);
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (err) {
    console.error('Route render error:', err);
    mount('Something went wrong rendering this page.');
  }
}

export function initRouter() {
  // Normalise initial hash, then render
  if (!window.location.hash || window.location.hash === '#') {
    window.location.replace(DEFAULT_HASH);
    return;
  }
  window.addEventListener('hashchange', renderCurrentRoute, { passive: true });
  renderCurrentRoute();
}

// Optional: intercept <a href="#/path"> clicks to stay SPA-friendly.
// You can remove this if you don't use in-app anchor links.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  // Allow new tab / modifiers
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  e.preventDefault();
  const url = new URL(a.getAttribute('href'), window.location.origin);
  // url.hash gives "#/path?..."
  const hash = url.hash || DEFAULT_HASH;
  if (hash !== window.location.hash) {
    window.location.hash = hash;
  } else {
    renderCurrentRoute();
  }
});
