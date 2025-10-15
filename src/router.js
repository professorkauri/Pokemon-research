import { HomePage } from './pages/HomePage.js';
import { AdminPage } from './pages/AdminPage.js';
import { PokemonBrowsePage } from './pages/PokemonBrowsePage.js';
import { PokemonDetailPage } from './pages/PokemonDetailPage.js';
import { GamesPage } from './pages/GamesPage.js';
import { GameDetailPage } from './pages/GameDetailPage.js';

function parseQueryFromHash() {
  const h = location.hash || '';
  const i = h.indexOf('?');
  if (i < 0) return {};
  return Object.fromEntries(new URLSearchParams(h.slice(i + 1)));
}

export function initRouter(mount) {
  const routes = [
    { re: /^#\/?$/, render: HomePage },
    { re: /^#\/home\/?$/, render: HomePage },
    { re: /^#\/admin\/?$/, render: AdminPage },
    { re: /^#\/pokemon\/?$/, render: PokemonBrowsePage },
    { re: /^#\/pokemon\/([^\/#?]+)\/?$/, render: (m,q)=>PokemonDetailPage({ id: m[1], query: q }) },
    { re: /^#\/games\/?$/, render: GamesPage },
    { re: /^#\/games\/([^\/#?]+)\/?$/, render: (m,q)=>GameDetailPage({ id: m[1], query: q }) },
  ];

  function render() {
    const hash = location.hash || '#/';
    const query = parseQueryFromHash();
    for (const r of routes) {
      const m = hash.match(r.re);
      if (m) {
        mount.innerHTML = '';
        const el = r.render.length ? r.render(m, query) : r.render();
        if (el instanceof Node) mount.appendChild(el);
        else if (typeof el === 'string') mount.innerHTML = el;
        // Move focus to main content for a11y
        mount.setAttribute('tabindex', '-1');
        mount.focus({ preventScroll: true });
        return;
      }
    }
    mount.textContent = 'Not found.';
  }

  window.addEventListener('hashchange', render);
  render();
}
