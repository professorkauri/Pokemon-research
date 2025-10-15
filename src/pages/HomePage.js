import { useSidecarCSS } from '../utils/css.js';
import { renderResults } from '../modules/Results.js';
import { listPokemon, listGames } from '../state/data-store.js';

useSidecarCSS(import.meta.url);

export function HomePage() {
  const wrap = document.createElement('div');
  wrap.className = 'home';

  const h = document.createElement('h1');
  h.textContent = 'Welcome';
  wrap.appendChild(h);

  const bar = document.createElement('div');
  bar.className = 'search-bar';
  const input = document.createElement('input');
  input.type = 'text'; input.placeholder = 'Search…';
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.textContent = 'Search';
  bar.appendChild(input); bar.appendChild(btn);

  const results = document.createElement('div');
  wrap.appendChild(bar);
  wrap.appendChild(results);

  const data = { pokemon: listPokemon(), games: listGames() };

  function doSearch() {
    results.innerHTML = '';
    const q = input.value || '';
    if (!q.trim()) return;
    results.appendChild(renderResults({ data, query: q }));
  }
  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') doSearch(); });

  return wrap;
}
