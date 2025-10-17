// Auto-load a sidecar CSS file that matches the module filename.
//
// Example:
//  import { useSidecarCSS } from '../utils/css.js';
//  useSidecarCSS(import.meta.url);
//
// /src/pages/PokemonDetailPage.js -> /styles/pages/pokemon-detail.css
// /src/modules/Card.js            -> /styles/modules/card.css
export function useSidecarCSS(moduleUrl) {
  const path = new URL(moduleUrl, location.href).pathname;
  const guess = path
    .replace('/src/pages/',   '/styles/pages/')
    .replace('/src/modules/', '/styles/modules/')
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '')
    .replace(/\.js$/, '.css')
    .toLowerCase();

  ensureStyle(guess);
}

function ensureStyle(href) {
  if (document.querySelector(`link[data-href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.href = href;
  link.onerror = () => link.remove(); // silently ignore if file not present
  document.head.appendChild(link);
}
