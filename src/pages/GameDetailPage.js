// GameDetailPage.js
import { listGames, getGameById, listPokemon } from '../state/data-store.js';
import { loadCorpusForGame } from '../state/corpus-loader.js';
import { renderDexGrid } from '../modules/DexGrid.js';

function GameDetailPage(gameArg) {
  const game = resolveGame(gameArg);

  const root = document.createElement('div');
  root.className = 'game-detail';

  if (!game) { root.textContent = 'Game not found.'; return root; }

  let activeTab = 'pokemon';
  const hasCorpus = !!(game.corpusSlug && String(game.corpusSlug).trim());

  const header = document.createElement('div');
  header.className = 'game-header';
  const title = document.createElement('div');
  title.className = 'game-title';
  title.innerHTML = `<strong>${escapeHtml(game.title || '(Untitled)')}</strong>`;
  header.appendChild(title);
  root.appendChild(header);

  const tabs = document.createElement('div'); tabs.className = 'segmented';
  const tPokemon = makeTab('Pokémon', 'pokemon');
  let tCorpus = null; if (hasCorpus) tCorpus = makeTab('Corpus', 'corpus');
  tabs.append(tPokemon); if (tCorpus) tabs.append(tCorpus);
  root.appendChild(tabs);

  const content = document.createElement('div'); content.className = 'game-content';
  root.appendChild(content);

  setActive(); renderBody(); return root;

  function makeTab(label, key) {
    const a = document.createElement('a');
    a.href = 'javascript:void(0)'; a.textContent = label;
    a.className = 'seg' + (key === activeTab ? ' active' : '');
    a.onclick = () => { if (key === 'corpus' && !hasCorpus) return; activeTab = key; setActive(); renderBody(); };
    return a;
  }
  function setActive() {
    for (const el of tabs.querySelectorAll('.seg')) el.classList.remove('active');
    if (activeTab === 'pokemon') tPokemon.classList.add('active'); else if (activeTab === 'corpus' && tCorpus) tCorpus.classList.add('active');
  }
  function renderBody() {
    content.innerHTML = '';
    if (activeTab === 'pokemon') { content.appendChild(renderGamePokemonDexGrid(game)); return; }
    if (activeTab === 'corpus' && hasCorpus) { content.appendChild(renderGameCorpusResults(game)); return; }
    activeTab = 'pokemon'; setActive(); content.appendChild(renderGamePokemonDexGrid(game));
  }
}

/* ---------------- Pokémon via DexGrid (filtered + sorted by regionalDexNumber) ---------------- */
function renderGamePokemonDexGrid(game) {
  const wrap = document.createElement('div');
  wrap.className = 'game-pokemon-dexgrid';

  const pokemonAll = listPokemon(); // ✅ local; no top-level 'all'

  const gkey = normId(game.id);
  const getRegional = (p) => {
    const pdx = canonicalPokedex(p);
    const rn = pdx[gkey]?.regionalDexNumber;
    return rn ? String(rn).trim() : '';
  };
  const filter  = (p) => !!getRegional(p);                                   // only with RN for this game
  const sortFn  = (a, b) => compareRegional(getRegional(a), getRegional(b)); // sort by RN
  const idPillText = (p) => (getRegional(p) ? `#${getRegional(p)}` : `#${p.id}`);

  const mount = document.createElement('div'); mount.className = 'dex-grid-mount';
  wrap.appendChild(mount);

  // Single, safe call — no other references to 'all' anywhere:
  renderDexGrid({ pokemon: pokemonAll, gameId: game.id, filter, sortFn, idPillText, mount });

  return wrap;
}

/* ---------------- Corpus ---------------- */
function renderGameCorpusResults(game) {
  const wrap = document.createElement('div'); wrap.className = 'game-corpus-results';
  const slug = game?.corpusSlug && String(game.corpusSlug).trim();
  if (!slug) { wrap.innerHTML = '<p class="muted">No corpus available for this game.</p>'; return wrap; }

  const loading = document.createElement('p'); loading.className = 'muted'; loading.textContent = 'Loading corpus…';
  wrap.appendChild(loading);

  (async () => {
    const { lines } = await loadCorpusForGame(game);
    wrap.innerHTML = '';
    if (!Array.isArray(lines) || lines.length === 0) {
      wrap.innerHTML = `<p class="muted">No corpus file found for <code>${escapeHtml(slug)}</code>.</p>`;
      return;
    }
    const list = document.createElement('div'); list.className = 'results-list';
    lines.forEach((text, idx) => {
      const row = document.createElement('div'); row.className = 'result row';
      const num = document.createElement('span'); num.className = 'line-number'; num.textContent = String(idx + 1);
      const body = document.createElement('span'); body.className = 'line-text'; body.textContent = text;
      const btn = document.createElement('button'); btn.className = 'add-to-notepad'; btn.type = 'button'; btn.textContent = 'Add to Notepad';
      btn.addEventListener('click', () => addToNotepad({ source: 'corpus', gameId: game.id, lineNumber: idx + 1, text }));
      row.append(num, body, btn); list.appendChild(row);
    });
    wrap.appendChild(list);
  })();

  return wrap;
}

/* ---------------- Utilities ---------------- */
function normId(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function canonicalPokedex(p) {
  const out = {}; const src = p?.pokedex; if (!src) return out;
  if (Array.isArray(src)) {
    for (const e of src) {
      const key = normId(String(e?.version ?? e?.gameId ?? '').trim()); if (!key) continue;
      out[key] = {
        regionalDexNumber: String(e?.regionalDexNumber ?? e?.regional ?? '').trim(),
        entry: String(e?.text ?? e?.entry ?? '').trim()
      };
    }
  } else if (typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const key = normId(k);
      out[key] = {
        regionalDexNumber: String(v?.regionalDexNumber ?? v?.regional ?? '').trim(),
        entry: String(v?.entry ?? v?.text ?? '').trim()
      };
    }
  }
  return out;
}
function compareRegional(a, b) {
  const na = parseRegionalNumber(a), nb = parseRegionalNumber(b);
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}
function parseRegionalNumber(s) {
  const m = String(s || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}
function resolveGame(arg) {
  if (arg && typeof arg === 'object') {
    if ('id' in arg && (arg.title || arg.console || arg.imageSlug || arg.corpusSlug)) return arg;
    if ('id' in arg && typeof arg.id !== 'undefined') return tryAllResolvers(String(arg.id));
  }
  if (typeof arg === 'string' || typeof arg === 'number') return tryAllResolvers(String(arg));
  return null;
}
function tryAllResolvers(key) {
  const k = decodeURIComponent(String(key)).trim();
  const byId = getGameById(k) || getGameById(Number(k)); if (byId) return byId;
  const games = listGames(); const lower = k.toLowerCase();
  return games.find(g => String(g.id) === k) ||
         games.find(g => (g.imageSlug||'').toLowerCase() === lower) ||
         games.find(g => (g.corpusSlug||'').toLowerCase() === lower) ||
         games.find(g => (g.title||'').toLowerCase() === lower) ||
         games.find(g => (g.title||'').toLowerCase().includes(lower)) || null;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function addToNotepad(payload) {
  if (typeof globalThis.addToNotepad === 'function') { try { globalThis.addToNotepad(payload); } catch {} }
  document.dispatchEvent(new CustomEvent('notepad:add', { detail: payload }));
}

/* Exports */
export { GameDetailPage };
export default GameDetailPage;
