import { renderResults } from '../modules/Results.js';
import { listPokemon, listGames } from '../state/data-store.js';


// Home page with URL-synced search (?q=...)
export function HomePage(_match, query = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'home';

  const h = document.createElement('h1');
  h.textContent = 'Welcome';
  wrap.appendChild(h);

  // --- Search bar ---
  const bar = document.createElement('div');
  bar.className = 'search-bar';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search Pokémon, games, or Pokédex text…';
  input.setAttribute('aria-label', 'Search');

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Search';

  bar.appendChild(input);
  bar.appendChild(btn);
  wrap.appendChild(bar);

  // --- Results container ---
  const results = document.createElement('div');
  results.className = 'results';
  wrap.appendChild(results);

  // --- Data snapshot for search ---
  const data = { pokemon: listPokemon(), games: listGames() };

  // --- Helpers for URL <-> state sync ---
  function setHashParam(key, value) {
    const h = location.hash || '#/';
    const [path, qstr] = h.split('?');
    const params = new URLSearchParams(qstr || '');
    if (value && String(value).trim()) params.set(key, value.trim());
    else params.delete(key);
    const next = params.toString() ? `${path}?${params}` : path;
    if (next !== h) location.hash = next;
  }

  function doSearch(options = { skipUrl: false }) {
    const q = String(input.value || '');
    // Keep URL in sync (and let router re-render) when not skipping
    if (!options.skipUrl) {
      if (!q.trim()) {
        // Clear URL param and UI
        setHashParam('q', '');
        results.innerHTML = '';
        return;
      }
      setHashParam('q', q);
      return; // Router will re-render HomePage with the parsed query
    }

    // Direct render path (used on initial load from URL)
    results.innerHTML = '';
    if (!q.trim()) return;
    results.appendChild(renderResults({ data, query: q }));
  }

  // Wire up events
  btn.addEventListener('click', () => doSearch({ skipUrl: false }));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch({ skipUrl: false }); });

  // --- Initial state from router query (parsed centrally in router) ---
  const initialQ = query?.q || query?.search || '';
  if (initialQ) {
    input.value = initialQ;
    doSearch({ skipUrl: true });
  }

  return wrap;
}
