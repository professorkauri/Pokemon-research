// GameDetailPage.js
import { listGames, getGameById, listPokemon } from '../state/data-store.js';
import { lazyBg, PKMN_IMG, GAME_IMG } from '../utils/images.js';
import { loadCorpusForGame } from '../state/corpus-loader.js';
import { renderDexGrid } from '../modules/DexGrid.js';
import { updateQuery } from '../router.js';
import { useSidecarCSS } from '../utils/css.js';
import { addCorpusLineToNotepad } from '../overlays/NotepadOverlay.js'

useSidecarCSS(import.meta.url);

/**
 * Router contract (hash + query):
 *   #/games/<gameIdOrSlug>?tab=pokemon|corpus&line=<number>
 *
 * Behavior:
 *  - Default tab is "pokemon" unless tab=corpus AND the game has a corpus.
 *  - When switching to pokemon, we drop ?line.
 *  - When clicking a corpus row or invoking goToLine(n), we set tab=corpus&line=n.
 *  - On corpus render, if a valid ?line is present, we .active + focus it (let browser auto-scroll).
 */
function GameDetailPage(paramsOrGame, queryFromRouter = undefined) {
  const { query } = readUrlQuery(queryFromRouter);
  const game = resolveGame(paramsOrGame);

  const root = document.createElement('div');
  root.className = 'game-detail';

  if (!game) {
    root.textContent = 'Game not found.';
    return root;
  }

  if (game.colorHex) {
    root.style.setProperty('--dex-color', game.colorHex);
  }

  const hasCorpus = !!(game.corpusSlug && String(game.corpusSlug).trim());

  // Determine initial tab from query; normalize if corpus missing
  let activeTab = (query.tab === 'corpus' && hasCorpus) ? 'corpus' : 'pokemon';
  if (query.tab === 'corpus' && !hasCorpus) {
    // Clean up URL if it asked for corpus but no corpus exists (canonicalize)
    updateQuery(() => buildCanonicalQuery({ tab: 'pokemon' }), { replace: true });
    activeTab = 'pokemon';
  }

  // Selected line (only meaningful for corpus)
  const selectedLine = sanitizeLine(query.line);

  /* ---------- Header ---------- */
  const header = document.createElement('div');
  header.className = 'game-header';

  const img = document.createElement('div');
  img.className = 'game-img';
  if (game.imageSlug) lazyBg(img, GAME_IMG(game.imageSlug));
  header.appendChild(img);

  const title = document.createElement('div');
  title.className = 'game-title';
  title.innerHTML = `<strong>${escapeHtml(game.title || '(Untitled)')}</strong>`;
  header.appendChild(title);

  const tabs = document.createElement('div');
  tabs.className = 'segmented';
  const tPokemon = makeTab('Pokémon', 'pokemon');
  let tCorpus = null;
  if (hasCorpus) tCorpus = makeTab('Corpus', 'corpus');
  tabs.append(tPokemon);
  if (tCorpus) tabs.append(tCorpus);

  header.appendChild(tabs);
  root.appendChild(header);

  /* ---------- Content ---------- */
  const content = document.createElement('div');
  content.className = 'game-content';
  root.appendChild(content);

  setActive();
  renderBody();
  return root;

  /* ======= helpers inside component ======= */

  function makeTab(label, key) {
    const a = document.createElement('a');
    a.href = 'javascript:void(0)';
    a.textContent = label;
    a.className = 'seg' + (key === activeTab ? ' active' : '');

    a.onclick = () => {
      if (key === 'corpus' && !hasCorpus) return;

      if (key === 'pokemon') {
        // Switch to pokemon and drop lingering ?line (canonical QS only)
        updateQuery(() => buildCanonicalQuery({ tab: 'pokemon' }));
      } else {
        // Switch to corpus; optionally keep current selected line if any
        const { query: cur } = readUrlQuery();
        updateQuery(() => buildCanonicalQuery({ tab: 'corpus', line: cur.line }));
      }
    };

    return a;
  }

  function setActive() {
    for (const el of tabs.querySelectorAll('.seg')) el.classList.remove('active');
    if (activeTab === 'pokemon') {
      tPokemon.classList.add('active');
    } else if (activeTab === 'corpus' && tCorpus) {
      tCorpus.classList.add('active');
    }
  }

  function renderBody() {
    // Re-evaluate query each time (URL is source of truth)
    const { query: q } = readUrlQuery();
    activeTab = (q.tab === 'corpus' && hasCorpus) ? 'corpus' : 'pokemon';

    content.innerHTML = '';
    if (activeTab === 'pokemon') {
      content.appendChild(renderGamePokemonDexGrid(game));
      setActive();
      return;
    }
    if (activeTab === 'corpus' && hasCorpus) {
      const line = sanitizeLine(q.line);
      content.appendChild(renderGameCorpusResults(game, line));
      setActive();
      return;
    }
    // Fallback
    activeTab = 'pokemon';
    setActive();
    content.appendChild(renderGamePokemonDexGrid(game));
  }

  /* Allow programmatic jumps from elsewhere in your app if needed */
  function goToLine(n) {
    const line = sanitizeLine(n) || 1;
    updateQuery(() => buildCanonicalQuery({ tab: 'corpus', line }));
  }
}

/* ---------------- Pokémon via DexGrid (filtered + sorted by regionalDexNumber) ---------------- */
function renderGamePokemonDexGrid(game) {
  const wrap = document.createElement('div');
  wrap.className = 'game-pokemon-dexgrid';

  const pokemonAll = listPokemon();

  const gkey = normId(game.id);
  const getRegional = (p) => {
    const pdx = canonicalPokedex(p);
    const rn = pdx[gkey]?.regionalDexNumber;
    return rn ? String(rn).trim() : '';
  };
  const filter = (p) => !!getRegional(p);                                   // only with RN for this game
  const sortFn = (a, b) => compareRegional(getRegional(a), getRegional(b)); // sort by RN
  const idPillText = (p) => (getRegional(p) ? `#${getRegional(p)}` : `#${p.id}`);

  const mount = document.createElement('div');
  mount.className = 'grid pokemon';
  wrap.appendChild(mount);

  renderDexGrid({ pokemon: pokemonAll, gameId: game.id, filter, sortFn, idPillText, mount });

  return wrap;
}

/* ---------------- Corpus ---------------- */
function renderGameCorpusResults(game, selectedLine) {
  const wrap = document.createElement('div');
  wrap.className = 'game-corpus-results page-width';

  const slug = game?.corpusSlug && String(game.corpusSlug).trim();
  if (!slug) {
    wrap.innerHTML = '<p class="muted">No corpus available for this game.</p>';
    return wrap;
  }

  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = 'Loading corpus…';
  wrap.appendChild(loading);

  (async () => {
    const { lines } = await loadCorpusForGame(game);
    wrap.innerHTML = '';

    if (!Array.isArray(lines) || lines.length === 0) {
      wrap.innerHTML = `<p class="muted">No corpus file found for <code>${escapeHtml(slug)}</code>.</p>`;
      return;
    }

    // Build header with: <div class="game-corpus-results-header"><p>title</p><div class="gotoline">…</div></div>
    const header = document.createElement('div');
    header.className = 'game-corpus-results-header';

    const titleP = document.createElement('p');
    titleP.textContent = `${game.title || '(Untitled)'} Game Dialogue`;

    const gotoWrap = document.createElement('div');
    gotoWrap.className = 'gotoline';

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `goto-line-${game.id}`;
    input.min = '1';
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = 'Line #';
    // prefill with selected line if present
    if (Number.isFinite(selectedLine)) input.value = String(selectedLine);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = 'Go to line';

    // "To Top" pure link => "#/games/<slug>?tab=corpus"
    const totop = document.createElement('button');
    totop.className = 'btn';
    totop.textContent = 'To Top';
    totop.addEventListener('click', () => {
      updateQuery(() => buildCanonicalQuery({ tab: 'corpus' }));
    });

    // Don’t let the button steal focus (prevents a pre-jump)
    btn.addEventListener('mousedown', (e) => e.preventDefault());

    function doGo() {
      const n = parseInt(input.value, 10);
      if (!Number.isFinite(n) || n < 1) {
        input.focus();
        input.select?.();
        return;
      }
      const clamped = Math.min(n, lines.length); // guard against overflow

      // Blur anything currently focused so the browser only scrolls once (to the line we’ll focus after render)
      try { document.activeElement && document.activeElement.blur(); } catch { }

      // Update the URL (canonical QS only; router will re-render)
      updateQuery(() => buildCanonicalQuery({ tab: 'corpus', line: clamped }));
    }

    btn.addEventListener('click', doGo);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doGo();
      }
    });

    gotoWrap.append(input, btn, totop);
    header.append(titleP, gotoWrap);
    wrap.appendChild(header);

    const list = document.createElement('div');
    list.className = 'results-list';

    lines.forEach((text, idx) => {
      const row = document.createElement('p');
      row.className = 'corpus_line';
      row.dataset.line = String(idx + 1);

      const num = document.createElement('span');
      num.className = 'muted';
      num.textContent = String(idx + 1);

      const body = document.createElement('span');
      body.className = 'line-text';
      body.textContent = text;

      // inside renderGameCorpusResults(...) where the "+📓" button is created:
      const addBtn = document.createElement('button');
      addBtn.className = 'btn';
      addBtn.type = 'button';
      addBtn.textContent = '+📓';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addCorpusLineToNotepad({
          game,
          lineNumber: idx + 1,
          lineText: text
        });
      });

      row.append(num, body, addBtn);
      list.appendChild(row);
    });

    // Click a row to make it active and reflect in the URL (canonical)
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.corpus_line');
      if (!row) return;
      const idx = parseInt(row.dataset.line, 10) || (Array.prototype.indexOf.call(list.children, row) + 1);
      updateQuery(() => buildCanonicalQuery({ tab: 'corpus', line: String(idx) }));
    });

    wrap.appendChild(list);

    // Activate selected line (from URL), if present & valid (focus => browser auto-scroll)
    const n = Number.isFinite(selectedLine) ? selectedLine : null;
    if (n && n >= 1 && n <= lines.length) {
      const target = list.querySelector(`.corpus_line[data-line="${n}"]`) || list.children[n - 1];
      if (target) {
        list.querySelectorAll('.corpus_line.active').forEach(el => el.classList.remove('active'));
        target.classList.add('active');
        target.setAttribute('tabindex', '-1');
        try { target.focus(); } catch { }
      }
    }
  })();

  return wrap;
}

/* ---------------- Utilities ---------------- */

// Only allow these query params for this page
const CANON_QS_KEYS = new Set(['tab', 'line']);

// Build a canonical query object. Anything not explicitly allowed is dropped.
function buildCanonicalQuery(obj = {}) {
  const out = {};
  if (obj.tab === 'corpus' || obj.tab === 'pokemon') out.tab = obj.tab;
  if (obj.line != null && obj.line !== '' && !Number.isNaN(Number(obj.line))) {
    const n = Math.max(1, parseInt(obj.line, 10));
    out.line = String(n);
  }
  return out;
}

// Return "#/games/<slugOrId>" without any querystring
function currentHashBase() {
  const h = String(window.location.hash || '');
  return h.includes('?') ? h.split('?')[0] : h;
}

function readUrlQuery(queryFromRouter) {
  // Prefer router-provided query if present, otherwise parse from hash
  if (queryFromRouter && typeof queryFromRouter === 'object') {
    return { query: normalizeQueryShape(queryFromRouter) };
  }
  const raw = String(window.location.hash || '');
  const qs = raw.includes('?') ? raw.split('?')[1] : '';
  const parsed = Object.fromEntries(new URLSearchParams(qs).entries());
  return { query: normalizeQueryShape(parsed) };
}

function normalizeQueryShape(q) {
  const out = {};
  if (q.tab) out.tab = String(q.tab).toLowerCase() === 'corpus' ? 'corpus' : 'pokemon';
  if (q.line != null && q.line !== '') out.line = String(q.line);
  return out;
}

function sanitizeLine(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normId(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonicalPokedex(p) {
  const out = {};
  const src = p?.pokedex;
  if (!src) return out;

  if (Array.isArray(src)) {
    for (const e of src) {
      const key = normId(String(e?.version ?? e?.gameId ?? '').trim());
      if (!key) continue;
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
  const byId = getGameById(k) || getGameById(Number(k));
  if (byId) return byId;

  const games = listGames();
  const lower = k.toLowerCase();
  return (
    games.find(g => String(g.id) === k) ||
    games.find(g => (g.imageSlug || '').toLowerCase() === lower) ||
    games.find(g => (g.corpusSlug || '').toLowerCase() === lower) ||
    games.find(g => (g.title || '').toLowerCase() === lower) ||
    games.find(g => (g.title || '').toLowerCase().includes(lower)) ||
    null
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addToNotepad(payload) {
  if (typeof globalThis.addToNotepad === 'function') {
    try { globalThis.addToNotepad(payload); } catch { }
  }
  document.dispatchEvent(new CustomEvent('notepad:add', { detail: payload }));
}

/* Exports */
export { GameDetailPage };
export default GameDetailPage;
