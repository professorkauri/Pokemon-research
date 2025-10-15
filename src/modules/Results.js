import { useSidecarCSS } from '../utils/css.js';
import { parseAndQuery, textMatchesTerms, highlightHTMLMulti } from '../utils/search.js';
import { lazyBg, PKMN_IMG, GAME_IMG } from '../utils/images.js';
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
  root.appendChild(sectionTitle(`Pokémon (${pkmnHits.length})`));
  if (!pkmnHits.length) {
    root.appendChild(empty('No Pokémon matched.'));
  } else {
    for (const hit of pkmnHits) root.appendChild(renderPokemonHit(hit, terms));
  }

  // CORPUS (auto)
  const corpusWrap = document.createElement('div');
  corpusWrap.appendChild(sectionTitle('Corpus'));
  root.appendChild(corpusWrap);
  renderCorpusAuto(corpusWrap, terms, isAnd, excludes, options.maxLinesPerGame ?? 50);

  return root;
}

/* ---- Pokémon scan ---- */
function findPokemonHits(pokemon, terms, isAnd, excludes) {
  const hits = [];
  for (const p of pokemon) {
    let relevancy = 0;
    const fieldMatches = [];
    const fields = { id:p.id, name:p.name, form:p.form, species:p.species, evolution:p.evolution, type1:p.type1, type2:p.type2 };
    const combined = Object.values(fields).map(v => String(v || '')).join(' | ').toLowerCase();
    if (excludes?.some(ex => combined.includes(String(ex).toLowerCase()))) continue;

    for (const [k,v] of Object.entries(fields)) {
      const s = String(v || '');
      if (s && textMatchesTerms(s, terms, /*OR*/false)) { relevancy++; fieldMatches.push({ label:k, value:s }); }
    }

    const dexMatchesByText = new Map();
    const pdx = p.pokedex || {};
    for (const [gameId, obj] of Object.entries(pdx)) {
      const entry = obj?.entry ? String(obj.entry) : '';
      if (!entry) continue;
      const hay = entry.toLowerCase();
      if (excludes?.some(ex=> hay.includes(String(ex).toLowerCase()))) continue;
      const ok = isAnd ? terms.every(t => hay.includes(String(t).toLowerCase()))
                        : terms.some(t => hay.includes(String(t).toLowerCase()));
      if (!ok) continue;
      relevancy++;
      const key = entry.trim().replace(/\s+/g,' ');
      dexMatchesByText.set(key, { gameId, entry, regionalDexNumber: String(obj.regionalDexNumber || '').trim() });
    }

    if (relevancy > 0 || dexMatchesByText.size) {
      hits.push({ p, relevancy, fieldMatches, dexMatches: [...dexMatchesByText.values()] });
    }
  }
  hits.sort((A,B)=> (B.relevancy - A.relevancy) || String(A.p.name||'').localeCompare(String(B.p.name||'')));
  return hits;
}

function renderPokemonHit(hit, terms) {
  const { p, fieldMatches, dexMatches } = hit;
  const card = document.createElement('div'); card.className='result';

  // Header (clickable to open detail)
  const header = document.createElement('div'); header.className='result-header clickable';
  header.addEventListener('click', () => location.hash = `#/pokemon/${encodeURIComponent(p.id)}`);

  const img = document.createElement('div'); img.className='result-img'; lazyBg(img, PKMN_IMG(p.id));
  const title = document.createElement('div');
  title.innerHTML = `<strong>${highlightHTMLMulti(p.name || '(Unnamed)', terms)}</strong>` +
    (p.form ? ` <span class="muted">• ${highlightHTMLMulti(p.form, terms)}</span>` : '') +
    ` <span class="pill">#${String(p.id)}</span>`;
  header.append(img, title);
  card.appendChild(header);

  // Field hits (simple key/value)
  if (fieldMatches.length) {
    const fieldsBox = document.createElement('div'); fieldsBox.innerHTML = `<div class="section-title">Fields</div>`;
    const list = document.createElement('div'); list.className='fields';
    for (const m of fieldMatches) {
      const label = m.label.replace(/^./, c => c.toUpperCase());
      const div = document.createElement('div');
      div.innerHTML = `<span class="muted">${escape(label)}:</span> ${highlightHTMLMulti(m.value, terms)}`;
      list.appendChild(div);
    }
    fieldsBox.appendChild(list);
    card.appendChild(fieldsBox);
  }

  // Pokédex matches (rendered as DexEntry cards with +📓 button)
  if (dexMatches.length) {
    const dexBox = document.createElement('div'); dexBox.innerHTML = `<div class="section-title">Pokédex entries</div>`;
    const list = document.createElement('div'); list.className='dex';
    for (const dm of dexMatches) {
      const g = getGameById(dm.gameId) || { id: dm.gameId, title: dm.gameId, colorHex: '#888888' };
      const entryEl = DexEntryCard({
        gameId: g.id,
        gameTitle: g.title,
        entryText: dm.entry,
        regionalDexNumber: dm.regionalDexNumber || '',
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
  let any = false;
  for (const { g, matches } of results) {
    if (!matches.length) continue;
    any = true;
    mount.appendChild(renderCorpusCard(g, matches, terms));
  }
  if (!any) mount.appendChild(empty('No corpus lines matched.'));
}

function renderCorpusCard(g, matches, terms) {
  const card = document.createElement('div'); card.className='result';
  card.style.setProperty('--dex-color', /^#[0-9a-f]{6}$/i.test(g.colorHex||'') ? g.colorHex.toUpperCase() : '#888888');

  const header = document.createElement('div'); header.className='result-header';
  const img = document.createElement('div'); img.className='result-img'; if (g.imageSlug) lazyBg(img, GAME_IMG(g.imageSlug));
  const title = document.createElement('div');
  const date = g.releaseDate ? new Date(g.releaseDate).toISOString().slice(0,10) : '—';
  title.innerHTML = `<strong>${escape(g.title || '(Game)')}</strong><div class="muted">${escape(g.console || '—')} • ${escape(date)}</div>`;
  header.append(img, title);
  const score = document.createElement('div'); score.innerHTML = `<span class="pill score">${matches.length}</span>`;
  header.appendChild(score);
  card.appendChild(header);

  const box = document.createElement('div'); box.innerHTML = `<div class="section-title">Corpus lines</div>`;
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
