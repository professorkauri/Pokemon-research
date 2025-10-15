import { useSidecarCSS } from '../utils/css.js';
import { highlightHTMLMulti } from '../utils/search.js';
import { addDexToNotepad } from '../overlays/NotepadOverlay.js';

useSidecarCSS(import.meta.url);

/** Single source of truth for Dex entry cards */
export function DexEntry({ gameId, gameTitle, entryText, regionalDexNumber, colorHex = '#888888', terms = [], pokemon = null, game = null }) {
  const box = document.createElement('div');
  box.className = 'dex-entry';
  box.style.setProperty('--dex-color', token(colorHex));

  const headerRow = document.createElement('div');
  headerRow.className = 'dex-entry-header row-between';

  const left = document.createElement('div');
  left.className = 'dex-entry-heading';
  left.innerHTML = `
    <span class="game-pill" style="background:${token(colorHex)}">${escape(gameTitle || '(Game)')}</span>
    ${regionalDexNumber ? `<span class="pill muted">#${escape(regionalDexNumber)}</span>` : ''}
  `;

  const actions = document.createElement('div');
  actions.className = 'actions';
  const btnCopy = tiny('Copy', () => copy(entryText || ''));
  const btnNP = tiny('Add to Notepad', () => {
    if (pokemon && game) {
      addDexToNotepad({ p: pokemon, game, entryText, regionalDexNumber: regionalDexNumber || '' });
    }
  });
  actions.append(btnCopy, btnNP);

  headerRow.append(left, actions);

  const body = document.createElement('div');
  body.className = 'dex-entry-body';
  body.innerHTML = entryText ? highlightHTMLMulti(entryText, terms) : '<span class="muted">—</span>';

  box.append(headerRow, body);
  return box;
}

export function DexEntryListForPokemon(p, games, opts = {}) {
  const frag = document.createElement('div');
  frag.className = 'dex';

  for (const g of games) {
    const pd = p?.pokedex?.[g.id];
    const entry = pd?.entry?.trim();
    const regional = pd?.regionalDexNumber?.trim();
    if (!entry && !regional) continue;

    frag.appendChild(DexEntry({
      gameId: g.id,
      gameTitle: g.title,
      entryText: entry || '',
      regionalDexNumber: regional || '',
      colorHex: g.colorHex || '#888888',
      terms: opts.terms || [],
      pokemon: p,
      game: g
    }));
  }

  if (!frag.childElementCount) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No Pokédex entries.';
    frag.appendChild(empty);
  }
  return frag;
}

/* helpers */
function token(hex){ return /^#[0-9a-f]{6}$/i.test(hex||'') ? hex.toUpperCase() : '#888888'; }
function tiny(label, on){ const b=document.createElement('button'); b.className='btn tiny'; b.textContent=label; b.onclick=on; return b; }
function copy(t){ try{ navigator.clipboard.writeText(String(t||'')); }catch{} }
function escape(s){ return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
