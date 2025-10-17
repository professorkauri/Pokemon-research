import { getPokemonById, listGames } from '../state/data-store.js';
import { DexEntryListForPokemon } from '../modules/DexEntry.js';
import './-pokemon-detail-page.css';
import { lazyBg, PKMN_IMG } from '../utils/images.js';
import { setTypeData } from '../utils/types.js';
import { renderResults } from '../modules/Results.js';
import { listPokemon } from '../state/data-store.js';
import { parseAndQuery } from '../utils/search.js';


export function PokemonDetailPage({ id }) {
  const p = getPokemonById(id);
  const el = document.createElement('div');
  el.className = 'pokemon-detail';

  if (!p) { el.textContent = 'Pokémon not found.'; return el; }

  setTypeData(el, p);

  const top = document.createElement('div');
  top.className = 'pkmn_stats';

  const img = document.createElement('div');
  img.className = 'img-preview';
  lazyBg(img, PKMN_IMG(p.id));
  top.appendChild(img);

  const info = document.createElement('div');
  info.className = 'subsection';
  info.innerHTML = `
    <h2>${p.name || '(Unnamed)'}${p.form ? ` <span class="muted">• ${p.form}</span>` : ''}</h2>
    <div class="row muted">
      <span class="pill">#${p.id}</span>
      ${p.type1 ? `<span class="pill" data-type1="${p.type1.toLowerCase()}">${p.type1}</span>` : ''}
      ${p.type2 ? `<span class="pill" data-type2="${p.type2.toLowerCase()}">${p.type2}</span>` : ''}
    </div>
    <div class="field-grid">
      <div class="field"><label>Species</label><div>${p.species || '—'}</div></div>
      <div class="field"><label>Evolution</label><div>${p.evolution || '—'}</div></div>
      <div class="field"><label>HP</label><div>${p.hp ?? '—'}</div></div>
      <div class="field"><label>Attack</label><div>${p.attack ?? '—'}</div></div>
      <div class="field"><label>Defence</label><div>${p.defense ?? '—'}</div></div>
      <div class="field"><label>Sp. Attack</label><div>${p.spAtk ?? '—'}</div></div>
      <div class="field"><label>Sp. Defence</label><div>${p.spDef ?? '—'}</div></div>
      <div class="field"><label>Speed</label><div>${p.speed ?? '—'}</div></div>
    </div>
  `;
  top.appendChild(info);
  el.appendChild(top);

  // Pokédex entries
  const dexWrap = document.createElement('div');
  dexWrap.className = 'subsection';
  dexWrap.innerHTML = `<h3>Pokédex Entries</h3>`;
  dexWrap.appendChild(DexEntryListForPokemon(p, listGames(), { terms: [] }));
  el.appendChild(dexWrap);

  // Related (search by this Pokémon's name, excluding itself)
  const relatedWrap = document.createElement('div');
  relatedWrap.className = 'subsection';
  relatedWrap.innerHTML = `<h3>Related mentions</h3>`;
  const relatedMount = document.createElement('div');
  relatedWrap.appendChild(relatedMount);
  el.appendChild(relatedWrap);

  // run compact search
  const q = p.name ? p.name : '';
  if (q.trim()) {
    // reuse data from store
    const data = { pokemon: listPokemon(), games: listGames() };
    const res = renderResults({ data, query: q, options: { maxLinesPerGame: 25 } });

    // remove this Pokémon from the Pokémon results in-place
    [...res.querySelectorAll('.result.clickable')].forEach(card => {
      const pill = card.querySelector('.pill');
      if (pill && pill.textContent?.replace('#','').trim() === String(p.id)) card.remove();
    });

    relatedMount.appendChild(res);
  }

  return el;
}
