import { useSidecarCSS } from '../utils/css.js';
import { parseAndQuery, textMatchesTerms, highlightHTMLMulti } from '../utils/search.js';
import { lazyBg, PKMN_IMG, GAME_IMG } from '../utils/images.js';
import { setTypeData } from '../utils/types.js';
import { listGames, getGameById } from '../state/data-store.js';
import { loadCorpusText } from '../state/corpus-loader.js';
import { addCorpusLineToNotepad } from '../overlays/NotepadOverlay.js';
import { DexEntry as DexEntryCard } from './DexEntry.js';

useSidecarCSS(import.meta.url);



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
  pkmnHits.className='result-section-title';
  root.appendChild(sectionTitle(`Pokémon (${pkmnHits.length})`));
  if (!pkmnHits.length) {
    root.appendChild(empty('No Pokémon matched.'));
  } else {
    for (const hit of pkmnHits) root.appendChild(renderPokemonHit(hit, terms));
  }

  // CORPUS (auto)
  const corpusHits = document.createElement('div');
  corpusHits.appendChild(sectionTitle(`Game Dialogue References`));
  root.appendChild(corpusHits);

  const corpusWrap = document.createElement('div');
  root.appendChild(corpusWrap);
  renderCorpusAuto(corpusWrap, terms, isAnd, excludes, options.maxLinesPerGame ?? 50);

  return root;
}

// Strict, hierarchical matcher for Pokémon FIELD searches:
// 1) First term must be present across ANY field
// 2) All "+" terms (the rest of `terms`) must also be present (across any fields)
// 3) Exclude if ANY "-" term appears (across any fields)
function findPokemonHits(pokemon, terms, isAnd, excludes) {
  const hits = [];

  // Normalisers
  const norm = (s) => String(s ?? '').toLowerCase();

  for (const p of pokemon) {
    let relevancy = 0;
    const fieldMatches = [];

    // Build searchable field set (adjust if you have more)
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

    // Precompute lowercase values for fast cross-field queries
    const values = Object.values(fields).map(norm);
    const containsAcrossFields = (needle) => {
      const n = norm(needle);
      if (!n) return false;
      return values.some(v => v.includes(n));
    };

    // --- Hierarchical gate for Pokémon-field matching ---
    const base = terms?.[0];
    if (!base || !containsAcrossFields(base)) {
      // If the FIRST term isn't found anywhere in Pokémon fields, skip this Pokémon entirely
      continue;
    }

    // All remaining "+" terms must be present across fields
    const plusTerms = (terms || []).slice(1);
    if (plusTerms.length && !plusTerms.every(containsAcrossFields)) {
      continue;
    }

    // Exclude if any "-" term is present across fields
    if (excludes?.length && excludes.some(containsAcrossFields)) {
      continue;
    }
    // ----------------------------------------------------

    // If we pass the gate, collect per-field matches & relevancy as you had before.
    // We keep per-field matching "OR" style for relevancy so multi-field hits score higher.
    for (const [label, value] of Object.entries(fields)) {
      const s = String(value ?? '');
      if (!s) continue;
      // NOTE: keep isAnd=false here so each field independently contributes to relevancy
      if (textMatchesTerms(s, terms, /* isAnd */ false)) {
        relevancy++;
        fieldMatches.push({ label, value: s });
      }
    }

    // ---- Dex/corpus text matching (kept compatible & defensive) ----
    // If your data has per-Pokémon text blocks (e.g., p.pokedex, p.notes), we try to match them too.
    // This block is defensive: it won't break if those props don't exist.
    const dexMatchesByText = new Map();

    const considerTextBlock = (label, raw) => {
      if (!raw) return;
      const text = String(raw);
      // Keep your existing term semantics for text blocks:
      const passesPositives = terms?.length ? textMatchesTerms(text, terms, isAnd) : true;
      const blocked = excludes?.length ? excludes.some(ex => norm(text).includes(norm(ex))) : false;
      if (passesPositives && !blocked) {
        // Deduplicate by exact text so the same snippet doesn't appear twice
        const key = text;
        if (!dexMatchesByText.has(key)) {
          dexMatchesByText.set(key, { label, text });
          // Optionally bump relevancy a little for each matched text block:
          relevancy++;
        }
      }
    };

    // Common shapes you might have; harmless if absent:
    // 1) p.pokedex is an object of keyed entries
    if (p && p.pokedex && typeof p.pokedex === 'object') {
      for (const [k, v] of Object.entries(p.pokedex)) {
        considerTextBlock(`pokedex:${k}`, v);
      }
    }
    // 2) p.notes or p.description text fields
    if (p && p.notes) considerTextBlock('notes', p.notes);
    if (p && p.description) considerTextBlock('description', p.description);
    // ----------------------------------------------------------------

    if (relevancy > 0 || dexMatchesByText.size) {
      hits.push({
        p,
        relevancy,
        fieldMatches,
        dexMatches: [...dexMatchesByText.values()]
      });
    }
  }

  // Sort by relevancy desc, then by name asc (stable with missing names)
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
  title.innerHTML = `<strong>${p.name}</strong>` +
    (p.form ? ` <span class="muted">• ${p.form}</span>` : '')
    //+ ` <span class="pill">#${String(p.id)}</span>`
    ;
  header.append(img, title);
  card.appendChild(header);

  // Field hits (simple key/value)
  if (fieldMatches.length) {
    const fieldsBox = document.createElement('div');
    fieldsBox.className='fieldsBox';
    // fieldsBox.innerHTML = `<div class="section-title">Fields</div>`;
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

  // Pokédex matches (rendered as DexEntry cards with +📓 button)
  if (dexMatches.length) {
    const dexBox = document.createElement('div');
    dexBox.className='dexBox';
    // dexBox.innerHTML = `<div class="section-title">Pokédex entries</div>`;
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
  const headerEl = mount.querySelector('.result-section-title');
  if (headerEl) headerEl.textContent = `Game Dialogue References (${totalHits})`;
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
  const date = g.releaseDate ? new Date(g.releaseDate).toISOString().slice(0,10) : '—';
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
    const ln = document.createElement('span'); ln.className='muted'; ln.textContent = `${m.idx}. `;
    const text = document.createElement('span'); text.innerHTML = highlightHTMLMulti(m.text, terms);
    const add = document.createElement('button'); add.className='btn'; add.textContent = '+📓';
    add.title = 'Add to Notepad';
    add.addEventListener('click', ()=> addCorpusLineToNotepad({ game: g, lineNumber: m.idx, lineText: m.text }));
    p.append(ln, text, add);
    list.appendChild(p);
  }
  box.appendChild(list); card.appendChild(box);
  return card;
}

/* ---- small helpers ---- */
function sectionTitle(t){ const d=document.createElement('div'); d.className='result-section-title'; d.textContent=t; return d; }
function empty(t){ const d=document.createElement('div'); d.className='result muted'; d.textContent=t; return d; }
function escape(s){ return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
