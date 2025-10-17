// DexGrid.js
import { PokemonCard } from '../modules/Card.js';
import { useSidecarCSS } from '../utils/css.js';

useSidecarCSS(import.meta.url);

// Supports:
//   renderDexGrid({ pokemon, mount, ...opts })
//   renderDexGrid(pokemonArray, opts)
function normalizeDexGridArgs(arg1, arg2) {
  if (Array.isArray(arg1)) {
    return { pokemon: arg1.slice(), opts: arg2 || {} };
  }
  const o = arg1 || {};
  return { pokemon: (o.pokemon || []).slice(), opts: o };
}

function setCardIdPill(cardEl, text) {
  if (!text) return;
  let pill =
    cardEl.querySelector('.id-pill') ||
    cardEl.querySelector('.card-id') ||
    cardEl.querySelector('.card-header .pill, .title .pill') ||
    cardEl.querySelector('.pill');

  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'pill id-pill';
    const header =
      cardEl.querySelector('.card-header') ||
      cardEl.querySelector('.title') ||
      cardEl.querySelector('.label') ||
      cardEl;
    header.prepend(pill);
  }
  pill.textContent = text;
}

function goToPokemon(id) {
  const seg = encodeURIComponent(String(id));
  // Trigger your hash router; it has a route: /^#\/pokemon\/([^\/#?]+)\/?$/ 
  location.hash = `#/pokemon/${seg}`;
}

export function renderDexGrid(arg1, arg2) {
  const { pokemon, opts } = normalizeDexGridArgs(arg1, arg2);
  const {
    mount,          // optional mount node (pre-existing container)
    gameId,         // optional passthrough to Card
    filter,         // (p) => boolean
    sortFn,         // (a, b) => number
    idPillText,     // (p) => string
  } = opts;

  // 1) filter & sort
  let list = pokemon;
  if (typeof filter === 'function') list = list.filter(filter);
  if (typeof sortFn === 'function') list = list.slice().sort(sortFn);

  // 2) choose container: use mount if provided, otherwise a fragment.
  if (mount instanceof Node) {
    // Clear existing children but DO NOT change classes — caller owns them.
    mount.innerHTML = '';
  }
  const container = (mount instanceof Node)
    ? mount
    : document.createDocumentFragment();

  // 3) build cards
  for (const p of list) {
    let produced = null;
    try {
      produced = (typeof PokemonCard === 'function')
        ? PokemonCard(p, {
            gameId,
            onOpen: ({ id }) => goToPokemon(id),
          })
        : null;
    } catch {
      produced = null;
    }

    let card = null;
    if (produced instanceof Node) {
      card = produced;
    } else if (produced && produced.element instanceof Node) {
      card = produced.element;
    }

    // Fallback minimal card if the module didn't return a DOM node
    if (!(card instanceof Node)) {
      card = document.createElement('div');
      card.className = 'dex-card card';
      card.innerHTML = `<div class="title"><strong>${p.name || '(Unnamed)'}</strong></div>`;
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => goToPokemon(p.id));
    }

    if (!card.hasAttribute('data-id')) {
      card.setAttribute('data-id', String(p.id));
    }

    if (typeof idPillText === 'function') {
      const pillText = idPillText(p);
      if (pillText) setCardIdPill(card, pillText);
    }

    container.appendChild(card);
  }

  // 4) return the node we populated
  return (mount instanceof Node) ? mount : container;
}

export { renderDexGrid as DexGrid };
export default renderDexGrid;
