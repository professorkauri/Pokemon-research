import { parseAndQuery, textMatchesTerms, highlightHTMLMulti } from '../utils/search.js';
import { lazyBg, PKMN_IMG, GAME_IMG } from '../utils/images.js';
import { setTypeData } from '../utils/types.js';
import { listGames, getGameById } from '../state/data-store.js';
import { loadCorpusText } from '../state/corpus-loader.js';
import { addCorpusLineToNotepad } from '../overlays/NotepadOverlay.js';
import { DexEntry as DexEntryCard } from './DexEntry.js';
import './-results.css';

/**
 * Unified results:
 * - Pokémon matches (fields + Pokédex entries, rendered as DexEntry cards)
 * - Corpus matches (auto-scans all corpora; capped per game)
 */
export function renderResults({ data, query, options = {} }) {
  const { isAnd, terms, excludes } = parseAndQuery(query || '');
  const root = document.createElement('div');
  root.className = 'results';

  if (!terms.length) {
    const p = document.createElement('p'); p.className='muted'; p.textContent='Enter a query to search.'; root.appendChild(p); return root;
  }

  // POKÉMON
  const pkmnHits = findPokemonHits(data.pokemon || [], terms, isAnd, excludes);
  root.appendChild(sectionTitle(`Pokémon (${pkmnHits.length})`));
  if (!pkmnHits.length) {
    root.appendChild(empty('No Pokémon matched.'));
  } else {
    for (const hit of pkmnHits) root.appendChild(renderPokemonHit(hit, terms));
  }

  // CORPUS (auto)
  root.appendChild(sectionTitle(`Game Dialogue References`));
  const corpusWrap = document.createElement('div');
  root.appendChild(corpusWrap);
  renderCorpusAuto(corpusWrap, terms, isAnd, excludes, options.maxLinesPerGame ?? 50);

  return root;
}

/**
 * Pokémon matching:
 * Include a Pokémon card if EITHER:
 *  - its structured fields match the query, OR
 *  - ANY of its Pokédex entry texts match the query.
 * Excludes are applied across both.
 */
function findPokemonHits(pokemon, terms, isAnd, excludes) {
  const hits = [];
  const games = listGames();

  const norm = (s) => String(s ?? '').toLowerCase();
  const contains = (hay, needle) => norm(hay).includes(norm(needle));
  const containsAll = (hay, needles) => needles.every(n => contains(hay, n));
  const excludedBy = (hay, ex) => ex?.some(e => contains(hay, e));

  // Map various game keys (emerald / pokemon-emerald / slug) → canonical game.id
  const mapGameKeyToId = (() => {
    const map = new Map();
    for (const g of games) {
      const candidates = [g.id, g.title, g.imageSlug, g.corpusSlug]
        .filter(Boolean)
        .map(normId);
      for (const c of candidates) map.set(c, g.id);
    }
    return (key) => {
      const k = normId(key);
      return map.get(k) || key;
    };
  })();

  // Normalize entry text for dedupe (trim + collapse spaces + case-insensitive)
  const normalizeEntryText = (s) => String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  for (const p of pokemon) {
    let relevancy = 0;
    const fieldMatches = [];
    const dexMatches = [];

    // ---- Fields ----
    const fields = {
      id: p.id,
      name: p.name,
      form: p.form,
      species: p.species,
      category: p.category,
      evolution: p.evolution,
      type1: p.type1,
      type2: p.type2
    };
    const values = Object.values(fields).map(v => String(v ?? ''));
    const haystack = values.join(' • ');

    const fieldsPassPositives = isAnd ? containsAll(haystack, terms) : terms.some(t => contains(haystack, t));
    const fieldsPassExcludes = !excludedBy(haystack, excludes);

    if (fieldsPassPositives && fieldsPassExcludes) {
      for (const [label, value] of Object.entries(fields)) {
        if (!value) continue;
        if (textMatchesTerms(String(value), terms, /*isAnd*/ false)) {
          relevancy++;
          fieldMatches.push({ label, value: String(value) });
        }
      }
    }

    // ---- Pokédex text (per game) with DEDUPE by entry text ----
    const dexObj = canonicalPokedex(p?.pokedex);
    const seenEntryKeys = new Set(); // normalized text → keep first game only

    for (const [key, entryText] of Object.entries(dexObj)) {
      if (!entryText) continue;

      const text = String(entryText);
      const normKey = normalizeEntryText(text);
      if (seenEntryKeys.has(normKey)) continue;            // skip duplicates
      // evaluate match before keeping
      const positives = terms.length ? textMatchesTerms(text, terms, isAnd) : true;
      const blocked = excludes?.length ? excludedBy(text, excludes) : false;
      if (!positives || blocked) continue;

      seenEntryKeys.add(normKey);
      const gameId = mapGameKeyToId(key);
      dexMatches.push({ gameId, entry: text });
      relevancy++; // bump relevancy for each (unique) matching entry
    }

    // Include if either fields or (deduped) dex matched
    if ((fieldMatches.length || dexMatches.length) && !excludedBy(haystack, excludes)) {
      hits.push({ p, relevancy, fieldMatches, dexMatches });
    }
  }

  // Sort by relevancy, then by name
  hits.sort((A, B) =>
    (B.relevancy - A.relevancy) ||
    String(A.p?.name || '').localeCompare(String(B.p?.name || ''))
  );

  return hits;
}


function renderPokemonHit(hit, terms) {
  const { p, fieldMatches, dexMatches } = hit;
  const card = document.createElement('div'); card.className='result';
  setTypeData(card, p);

  // Header (clickable to open detail)
  const header = document.createElement('div'); header.className='result-header clickable';
  header.addEventListener('click', () => location.hash = `#/pokemon/${encodeURIComponent(p.id)}`);

  const img = document.createElement('div'); img.className='result-img'; lazyBg(img, PKMN_IMG(p.id));
  const title = document.createElement('div');
  title.innerHTML = `<strong>${escape(p.name)}</strong>` +
    (p.form ? ` <span class="muted">• ${escape(p.form)}</span>` : '');
  header.append(img, title);
  card.appendChild(header);

  // Field hits (simple key/value)
  if (fieldMatches.length) {
    const fieldsBox = document.createElement('div');
    fieldsBox.className='fieldsBox';
    const list = document.createElement('div');
    list.className='fields';
    for (const m of fieldMatches) {
      const label = m.label.replace(/^./, c => c.toUpperCase());
      const div = document.createElement('div');
      div.innerHTML = `<span class="muted">${escape(label)}:</span> <p>${highlightHTMLMulti(m.value, terms)}</p>`;
      list.appendChild(div);
    }
    fieldsBox.appendChild(list);
    header.appendChild(fieldsBox);
  }

  // Pokédex matches (rendered as DexEntry cards)
  if (dexMatches.length) {
    const dexBox = document.createElement('div');
    dexBox.className='dexBox';
    const list = document.createElement('div'); list.className='dex';
    for (const dm of dexMatches) {
      const g = getGameById(dm.gameId) || { id: dm.gameId, title: dm.gameId, colorHex: '#888888' };
      const entryEl = DexEntryCard({
        gameId: g.id,
        gameTitle: g.title,
        entryText: dm.entry,
        colorHex: g.colorHex || '#888888',
        terms,
        pokemon: p,
        game: g
      });
      list.appendChild(entryEl);
    }
    dexBox.appendChild(list); card.appendChild(dexBox);
  }

  return card;
}

/* ---- Corpus scan (auto, all games) ---- */
async function renderCorpusAuto(mount, terms, isAnd, excludes, maxPerGame) {
  const games = listGames().filter(g => (g.corpusSlug || g.id));
  if (!games.length) {
    mount.appendChild(empty('No corpora available.'));
    return;
  }

  const jobs = games.map(async g => {
    const slug = g.corpusSlug || g.id;
    const { lines } = await loadCorpusText(slug);
    const matches = [];
    for (let i=0; i<lines.length; i++) {
      const line = lines[i]; if (!line) continue;
      const hay = line.toLowerCase();
      if (excludes?.some(ex=> hay.includes(String(ex).toLowerCase()))) continue;
      const ok = isAnd ? terms.every(t => hay.includes(String(t).toLowerCase()))
                        : terms.some(t => hay.includes(String(t).toLowerCase()));
      if (ok) {
        matches.push({ idx: i+1, text: line });
        if (matches.length >= maxPerGame) break;
      }
    }
    return { g, matches };
  });

  const results = await Promise.all(jobs);
  const totalHits = results.reduce((sum, { matches }) => sum + (matches?.length || 0), 0);
  let any = false;
  for (const { g, matches } of results) {
    if (!matches.length) continue;
    any = true; 
    mount.appendChild(renderCorpusCard(g, matches, terms));
  }
  if (!any) mount.appendChild(empty('No game dialogue lines matched.'));
}

function renderCorpusCard(g, matches, terms) {
  const card = document.createElement('div'); card.className='result';
  card.style.setProperty('--dex-color', /^#[0-9a-f]{6}$/i.test(g.colorHex||'') ? g.colorHex.toUpperCase() : '#888888');

  const header = document.createElement('div'); header.className='result-header';
  const img = document.createElement('div'); img.className='result-img'; if (g.imageSlug) lazyBg(img, GAME_IMG(g.imageSlug));
  const title = document.createElement('div');
  title.innerHTML = `
    <strong>Pokémon ${escape(g.title || '(Game)')}</strong>
    <div class="muted">Game Dialogue</div>
  `;
  header.append(img, title);
  const score = document.createElement('div'); score.innerHTML = `<span class="pill score">${matches.length}</span>`;
  header.appendChild(score);
  card.appendChild(header);

  const box = document.createElement('div');
  const list = document.createElement('div');
  for (const m of matches) {
    const p = document.createElement('p'); p.className='corpus_line';

    // Line index as a button that jumps to the game's corpus line
    const ln = document.createElement('button');
    ln.type = 'button';
    ln.className = 'muted line-jump';
    ln.title = `Open ${g.title || 'game'} corpus at line ${m.idx}`;
    ln.textContent = `${m.idx}.`;
    ln.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const slug = encodeURIComponent(g.corpusSlug || g.id);
      location.hash = `#/games/${slug}?tab=corpus&line=${m.idx}`;
    });

    const space = document.createTextNode(' ');
    const text = document.createElement('span'); text.innerHTML = highlightHTMLMulti(m.text, terms);
    const add = document.createElement('button'); add.className='btn'; add.textContent = '+📓';
    add.title = 'Add to Notepad';
    add.addEventListener('click', ()=> addCorpusLineToNotepad({ game: g, lineNumber: m.idx, lineText: m.text }));

    p.append(ln, space, text, add);
    list.appendChild(p);
  }
  box.appendChild(list); card.appendChild(box);
  return card;
}

/* ---- small helpers ---- */
function sectionTitle(t){ const d=document.createElement('div'); d.className='result-section-title'; d.textContent=t; return d; }
function empty(t){ const d=document.createElement('div'); d.className='result muted'; d.textContent=t; return d; }
function escape(s){ return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function normId(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Canonicalise p.pokedex into { [gameKey]: entryText }
 * Accepts shapes like:
 *  - { emerald: { entry: '...', regionalDexNumber: '...' }, ... }
 *  - { emerald: '...' }
 *  - [ { version:'emerald', entry:'...' }, ... ]
 */
function canonicalPokedex(src) {
  const out = {};
  if (!src) return out;

  const pullText = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    // common shapes
    return String(v.entry ?? v.text ?? v.description ?? '');
  };

  if (Array.isArray(src)) {
    for (const e of src) {
      const key = normId(String(e?.version ?? e?.gameId ?? e?.game ?? '').trim());
      if (!key) continue;
      const txt = pullText(e);
      if (txt) out[key] = txt;
    }
    return out;
  }

  if (typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const key = normId(k);
      const txt = pullText(v);
      if (key && txt) out[key] = txt;
    }
    return out;
  }

  return out;
}
