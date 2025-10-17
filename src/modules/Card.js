import { lazyBg, PKMN_IMG, GAME_IMG } from '../utils/images.js';
import { setTypeData } from '../utils/types.js';

function safe(s) { return String(s ?? ''); }

export function PokemonCard(p, { onOpen } = {}) {
  const card = document.createElement('div');
  card.className = 'card';
  setTypeData(card, p);
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => onOpen?.(p));

  const img = document.createElement('div');
  img.className = 'img';
  lazyBg(img, PKMN_IMG(p.id));
  card.appendChild(img);

  const title = document.createElement('div');
  title.className = 'column';
  title.innerHTML = `<strong>${safe(p.name || '(Unnamed)')}</strong>${p.form ? ` <span class="muted">${safe(p.form)}</span>` : ''}`;
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'row muted';
  meta.innerHTML = pillTypes(p);
  card.appendChild(meta);

  return card;
}

export function GameCard(g, { onOpen } = {}) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cursor = 'pointer';
  card.style.setProperty('--dex-color', g.colorHex);
  card.addEventListener('click', () => onOpen?.(g));

  const img = document.createElement('div');
  img.className = 'game-img';
  if (g.imageSlug) lazyBg(img, GAME_IMG(g.imageSlug));
  card.appendChild(img);

  const date = g.releaseDate
  ? new Date(g.releaseDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    })
  : '—';
  const title = document.createElement('div');
  title.innerHTML = `<strong>${safe(g.title || '(Untitled)')}</strong><span class="pill muted">${safe(g.console || '—')}</span><span class="pill muted">${date}</span>`;
  card.appendChild(title);

  return card;
}

function pillTypes(p) {
  if (p.type1 && p.type2) {
    return `<span class="pill">#${p.id}</span>
            <p class="pill pill-types">
              <span data-type1="${p.type1.toLowerCase()}">${p.type1}</span>
              <span data-type2="${p.type2.toLowerCase()}">${p.type2}</span>
            </p>`;
  } else if (p.type1) {
    return `<span class="pill">#${p.id}</span>
            <p class="pill pill-types">
              <span data-type1="${p.type1.toLowerCase()}">${p.type1}</span>
            </p>`;
  }
  return `<span class="pill">#${p.id}</span><p class="pill">—</p>`;
}
