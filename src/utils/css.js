// utils/css.js
// Loads a sidecar CSS file alongside a JS module, working in Vite dev & prod (GH Pages).
// Convention: put CSS files in `public/styles/pages/` or `public/styles/modules/`.
// Example sidecars:
//   /public/styles/pages/game-detail-page.css
//   /public/styles/modules/card.css
//
// Usage in a module:
//   import { useSidecarCSS } from '../utils/css.js';
//   useSidecarCSS(import.meta.url);

export function useSidecarCSS(moduleUrl) {
  const url = new URL(moduleUrl, location.href);
  // 1) Get the chunk's base name (strip extension and Vite hash suffix)
  const file = url.pathname.split('/').pop() || '';
  const noExt = file.replace(/\.js$/i, '');
  const base = stripViteHash(noExt); // e.g. GameDetailPage-abc123 -> GameDetailPage

  // 2) Convert to kebab-case (fixes leading-dash issues)
  const kebab = toKebab(base); // GameDetailPage -> game-detail-page

  // 3) Build absolute hrefs using Vite base (handles /<repo>/ on GH Pages)
  const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
  const pagesHref   = joinUrl(BASE, `styles/pages/${kebab}.css`);
  const modulesHref = joinUrl(BASE, `styles/modules/${kebab}.css`);

  // 4) Try pages first, then modules (silently ignore 404s)
  ensureStyle(pagesHref);
  ensureStyle(modulesHref);
}

function stripViteHash(name) {
  // Removes a trailing "-[hash]" segment that Vite/Rollup add to chunk names.
  // Matches common 8+ hex char hashes: e.g., FooBar-abc12345 -> FooBar
  return name.replace(/-[0-9a-f]{8,}$/i, '');
}

function toKebab(str) {
  // Insert dashes on lower/number -> Upper boundaries, then normalize.
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function ensureStyle(href) {
  if (!href) return;
  if (document.querySelector(`link[data-href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.href = href;
  // If it 404s, remove quietly (we try both pages & modules)
  link.onerror = () => link.remove();
  document.head.appendChild(link);
}

function joinUrl(base, path) {
  if (!base.endsWith('/')) base += '/';
  return base + path.replace(/^\/+/, '');
}
