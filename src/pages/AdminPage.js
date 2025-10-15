// AdminPage.js
import { useSidecarCSS } from '../utils/css.js';
import {
  listPokemon, listGames,
  getPokemonById, getGameById,
  getSettings, setSettings, imageBase
} from '../state/data-store.js';

useSidecarCSS(import.meta.url);

/* ------------------------------------------------
   Small constants / helpers (declared first)
--------------------------------------------------*/
const TYPE_OPTIONS = ["", "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function byReleaseDateAsc(a, b) {
  const da = Date.parse(a.releaseDate || '1970-01-01');
  const db = Date.parse(b.releaseDate || '1970-01-01');
  return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
}
function setBackground(el, url) {
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}
// --- Lazy background images for list thumbs ---
let __lazyObs = null;
function ensureLazyObserver() {
  if (__lazyObs) return __lazyObs;
  __lazyObs = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      const bg = el.dataset.bg;
      if (bg) {
        el.style.backgroundImage = `url("${bg}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        delete el.dataset.bg;
      }
      obs.unobserve(el);
    }
  }, { rootMargin: '200px 0px', threshold: 0 });
  return __lazyObs;
}
function lazyBg(el, url) {
  el.dataset.bg = url;
  ensureLazyObserver().observe(el);
}

function setTypeDataAttr(el, attr, value) {
  const v = String(value || '').trim().toLowerCase();
  if (v) el.setAttribute(attr, v); else el.removeAttribute(attr);
}

/** Accepts legacy array/object pokedex and returns a canonical object:
 *   { [gameId]: { regionalDexNumber: string, entry: string } }
 */
function getPokedexObject(p) {
  const out = {};
  const src = p?.pokedex;
  if (!src) return out;

  if (Array.isArray(src)) {
    for (const e of src) {
      const gameId = String(e?.version ?? e?.gameId ?? '').trim();
      if (!gameId) continue;
      out[gameId] = {
        regionalDexNumber: String(e?.regionalDexNumber ?? e?.regional ?? '').trim(),
        entry: String(e?.text ?? e?.entry ?? '').trim()
      };
    }
  } else if (typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      out[String(k)] = {
        regionalDexNumber: String(v?.regionalDexNumber ?? v?.regional ?? '').trim(),
        entry: String(v?.entry ?? v?.text ?? '').trim()
      };
    }
  }
  return out;
}

/* ------------------------------------------------
   Component
--------------------------------------------------*/
function AdminPage() {
  // ---------- State (must be defined before any usage) ----------
  let activeTab = 'pokemon';    // 'settings' | 'pokemon' | 'games'
  let selectedId = null;
  let filter = '';

  // ---------- Root skeleton ----------
  const root = document.createElement('div');
  root.className = 'admin-root';

  const topbar = document.createElement('div');
  topbar.className = 'admin-topbar';
  const btnExport = document.createElement('button');
  btnExport.textContent = 'Download settings.json';
  btnExport.addEventListener('click', downloadAll);
  const btnAdd = document.createElement('button');
  btnAdd.textContent = 'New';
  btnAdd.style.display = 'inline-block';
  btnAdd.addEventListener('click', () => {
    selectedId = null;
    if (activeTab === 'pokemon') {
      renderEditor({ __new__: true, section: 'pokemon' });
    } else if (activeTab === 'games') {
      renderEditor({ __new__: true, section: 'games' });
    }
  });
  topbar.append(btnExport, btnAdd);
  root.appendChild(topbar);

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'segmented';
  const tSettings = makeTab('Settings', 'settings');
  const tPokemon = makeTab('Pokémon', 'pokemon');
  const tGames = makeTab('Games', 'games');
  tabs.append(tSettings, tPokemon, tGames);
  root.appendChild(tabs);

  // Layout
  const layout = document.createElement('div'); layout.className = 'admin-layout';
  const left = document.createElement('div'); left.className = 'left-list';
  const right = document.createElement('div'); right.className = 'right-editor';
  layout.append(left, right); root.appendChild(layout);

  // Left: search + list
  const searchWrap = document.createElement('div'); searchWrap.className = 'left-search';
  const search = document.createElement('input'); search.type = 'text'; search.placeholder = 'Search…';
  search.addEventListener('input', () => { filter = (search.value || '').toLowerCase().trim(); renderList(); });
  searchWrap.appendChild(search);
  const list = document.createElement('div'); list.className = 'left-scroll';
  left.append(searchWrap, list);

  // Initial paint
  setActive();
  renderList();
  renderEditor();

  return root;

  /* ---------------- Tabs ---------------- */
  function makeTab(label, key) {
    const a = document.createElement('a');
    a.href = 'javascript:void(0)'; a.textContent = label;
    a.className = 'seg' + (key === activeTab ? ' active' : '');
    a.onclick = () => { activeTab = key; selectedId = null; setActive(); renderList(); renderEditor(); };
    return a;
  }
  function setActive() {
    for (const el of tabs.querySelectorAll('.seg')) el.classList.remove('active');
    (activeTab === 'settings' ? tSettings : activeTab === 'pokemon' ? tPokemon : tGames).classList.add('active');

    btnAdd.style.display = (activeTab === 'settings') ? 'none' : 'inline-block';
    btnExport.textContent = (activeTab === 'settings')
      ? 'Download settings.json'
      : (activeTab === 'pokemon') ? 'Download Pokémon JSON'
        : 'Download Games JSON';

    // 🔽 Hide left column + search on Settings
    const hideLeft = (activeTab === 'settings');
    left.style.display = hideLeft ? 'none' : 'block';
    right.style.flex = '1 1 auto';
    searchWrap.style.display = hideLeft ? 'none' : 'block';

    if (!hideLeft) {
      search.placeholder = (activeTab === 'pokemon') ? 'Search Pokémon…' : 'Search Games…';
    }
  }


  /* ---------------- Left column ---------------- */
  function renderList() {
    list.innerHTML = '';
  
    if (activeTab === 'settings') {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Settings have no list.';
      list.appendChild(p);
      return;
    }
  
    if (activeTab === 'pokemon') {
      const P = listPokemon().filter(p =>
        !filter ||
        String(p.id).includes(filter) ||
        (p.name || '').toLowerCase().includes(filter)
      );
  
      if (!P.length) {
        list.appendChild(emptyRow('No Pokémon.'));
        return;
      }
  
      for (const p of P) {
        const row = document.createElement('div');            // ✅ define row
        row.className = 'row-item';
        row.onclick = () => { selectedId = String(p.id); renderEditor(); };
  
        const thumb = document.createElement('div');
        thumb.className = 'thumb';
        const id = (p.id || '').toString().trim();
        if (id) lazyBg(thumb, imageBase().pokemon + encodeURIComponent(id) + '.webp');
        else thumb.style.backgroundImage = 'none';
  
        const label = document.createElement('div');
        label.className = 'label';
        label.innerHTML = `<strong>${escapeHtml(p.name || '(Unnamed)')}</strong><div class="muted">#${escapeHtml(String(p.id || ''))}</div>`;
  
        row.append(thumb, label);
        list.appendChild(row);
      }
      return;
    }
  
    if (activeTab === 'games') {
      const G = listGames().filter(g =>
        !filter ||
        (g.title || '').toLowerCase().includes(filter) ||
        (g.console || '').toLowerCase().includes(filter)
      );
  
      if (!G.length) {
        list.appendChild(emptyRow('No games.'));
        return;
      }
  
      for (const g of G) {
        const row = document.createElement('div');            // ✅ define row
        row.className = 'row-item';
        row.onclick = () => { selectedId = String(g.id); renderEditor(); };
  
        const thumb = document.createElement('div');
        thumb.className = 'thumb';
  
        if (g.imageSlug) {
          const url = imageBase().games + encodeURIComponent(String(g.imageSlug)) + '.webp';
          lazyBg(thumb, url);
        } else {
          // fallback: colour swatch if no image
          thumb.style.background = g.colorHex || '#999';
        }
  
        const label = document.createElement('div');
        label.className = 'label';
        label.innerHTML = `<strong>${escapeHtml(g.title || '(Untitled)')}</strong><div class="muted">${escapeHtml(g.console || '')}</div>`;
  
        row.append(thumb, label);
        list.appendChild(row);
      }
      return;
    }
  }
  

  /* ---------------- Right column ---------------- */
  function renderEditor(opts = null) {
    right.innerHTML = '';

    if (activeTab === 'settings') return renderSettingsEditor();
    if (activeTab === 'pokemon') return renderPokemonEditor(opts);
    if (activeTab === 'games') return renderGameEditor(opts);
  }

  /* -------- Settings editor -------- */
  function renderSettingsEditor() {
    const s = structuredClone(getSettings() || {});
    const header = rowHeader('Settings', [
      button('Save', () => { setSettings(s); alert('Settings saved (in-memory).'); })
    ]);
    right.appendChild(header);

    const wrap = document.createElement('div'); wrap.className = 'form-grid';

    wrap.appendChild(groupTitle('App & Theme'));
    wrap.appendChild(fieldText('App Title', s.app?.title || '', v => { s.app ||= {}; s.app.title = v; }).container);
    wrap.appendChild(fieldText('Theme', s.app?.theme || '', v => { s.app ||= {}; s.app.theme = v; }).container);

    wrap.appendChild(groupTitle('UI Options'));
    wrap.appendChild(fieldCheckbox('Show debug tools', !!s.ui?.debug, v => { s.ui ||= {}; s.ui.debug = v; }).container);
    wrap.appendChild(fieldCheckbox('Use compact lists', !!s.ui?.compact, v => { s.ui ||= {}; s.ui.compact = v; }).container);

    wrap.appendChild(groupTitle('Assets'));
    wrap.appendChild(fieldText('Image base (Pokémon)', s.assets?.pokemonBase || '', v => { s.assets ||= {}; s.assets.pokemonBase = v; }).container);
    wrap.appendChild(fieldText('Image base (Games)', s.assets?.gameBase || '', v => { s.assets ||= {}; s.assets.gameBase = v; }).container);

    right.appendChild(wrap);
  }

  /* -------- Pokémon editor (full detail + per-game Pokédex) -------- */
  function renderPokemonEditor(opts) {
    let p;
    if (opts?.__new__) {
      p = { id: '', name: '', form: '', species: '', category: '', evolution: '', type1: '', type2: '', hp: null, attack: null, defense: null, spAtk: null, spDef: null, speed: null, pokedex: {} };
    } else if (selectedId != null) {
      p = getPokemonById(selectedId);
    }
    const header = rowHeader('Pokémon', [
      button('Save', () => { alert('Hook this to your store writer if you want persistence.'); }),
      button('Delete', () => { alert('Hook this to your delete logic.'); })
    ]);
    right.appendChild(header);

    if (!p) { right.appendChild(emptyRow('Select a Pokémon to edit or click New.')); return; }

    // image preview
    const preview = document.createElement('div'); preview.className = 'img-preview';
    if (p.id) setBackground(preview, imageBase().pokemon + encodeURIComponent(String(p.id)) + '.webp');
    right.appendChild(preview);

    // Basic Info
    const basic = document.createElement('div'); basic.className = 'subsection'; basic.innerHTML = '<h4>Basic Info</h4>';
    const g1 = document.createElement('div'); g1.className = 'field-grid';

    g1.appendChild(fieldText('ID', p.id || '', v => {
      p.id = v;
      if (v) setBackground(preview, imageBase().pokemon + encodeURIComponent(String(v)) + '.webp');
      else preview.style.backgroundImage = 'none';
    }).container);
    g1.appendChild(fieldText('Name', p.name || '', v => { p.name = v; }).container);
    g1.appendChild(fieldText('Form', p.form || '', v => { p.form = v; }).container);
    g1.appendChild(fieldText('Species', p.species || '', v => { p.species = v; }).container);
    g1.appendChild(fieldText('Category', p.category || '', v => { p.category = v; }).container);
    g1.appendChild(fieldText('Evolution', p.evolution || '', v => { p.evolution = v; }).container);

    basic.appendChild(g1);
    right.appendChild(basic);

    // Secondary (types)
    const secondary = document.createElement('div'); secondary.className = 'subsection'; secondary.innerHTML = '<h4>Typing</h4>';
    const g2 = document.createElement('div'); g2.className = 'field-grid';

    const type1 = fieldSelect('Type 1', p.type1 || '', TYPE_OPTIONS, v => { p.type1 = v; });
    const type2 = fieldSelect('Type 2', p.type2 || '', TYPE_OPTIONS, v => { p.type2 = v; });
    setTypeDataAttr(type1.input, 'data-type1', p.type1);
    setTypeDataAttr(type2.input, 'data-type2', p.type2);
    type1.input.addEventListener('change', () => setTypeDataAttr(type1.input, 'data-type1', type1.input.value));
    type2.input.addEventListener('change', () => setTypeDataAttr(type2.input, 'data-type2', type2.input.value));

    g2.append(type1.container, type2.container);
    secondary.appendChild(g2);
    right.appendChild(secondary);

    // Stats
    const stats = document.createElement('div'); stats.className = 'subsection'; stats.innerHTML = '<h4>Stats</h4>';
    const g3 = document.createElement('div'); g3.className = 'field-grid';
    g3.appendChild(fieldNumber('HP', p.hp ?? '', v => { p.hp = v; }).container);
    g3.appendChild(fieldNumber('Attack', p.attack ?? '', v => { p.attack = v; }).container);
    g3.appendChild(fieldNumber('Defence', p.defense ?? '', v => { p.defense = v; }).container);
    g3.appendChild(fieldNumber('Sp. Attack', p.spAtk ?? '', v => { p.spAtk = v; }).container);
    g3.appendChild(fieldNumber('Sp. Defence', p.spDef ?? '', v => { p.spDef = v; }).container);
    g3.appendChild(fieldNumber('Speed', p.speed ?? '', v => { p.speed = v; }).container);
    stats.appendChild(g3);
    right.appendChild(stats);

    // Pokédex entries (per game)
    const pdxWrap = document.createElement('div'); pdxWrap.className = 'subsection';
    pdxWrap.innerHTML = '<h4>Pokédex Entries (linked to Games)</h4>';
    const grid = document.createElement('div'); grid.className = 'pokedex-grid';

    const pokedexObj = getPokedexObject(p);
    if (!p.pokedex || typeof p.pokedex !== 'object' || Array.isArray(p.pokedex)) {
      p.pokedex = pokedexObj;
    }

    const games = listGames().slice().sort(byReleaseDateAsc);
    if (!games.length) {
      const empty = document.createElement('div'); empty.className = 'muted'; empty.textContent = 'No games defined yet.';
      grid.appendChild(empty);
    } else {
      for (const g of games) {
        const card = document.createElement('div'); card.className = 'pokedex-card';
        const color = g.colorHex && /^#[0-9a-f]{6}$/i.test(g.colorHex) ? g.colorHex.toUpperCase() : '#888888';
        card.setAttribute('style', `--dex-color:${color}`);

        const title = document.createElement('div'); title.className = 'pokedex-card-title';
        title.innerHTML = `<strong>${escapeHtml(g.title || '(untitled)')}</strong>`;

        // Ensure bucket exists
        const bucket = (p.pokedex[g.id] ||= { regionalDexNumber: '', entry: '' });

        // Regional Dex Number (inline)
        const rd = fieldText('Regional Dex Number', bucket.regionalDexNumber, v => { bucket.regionalDexNumber = v; }).container;
        rd.classList.add('field-inline');
        title.appendChild(rd);
        card.appendChild(title);

        // Entry textarea
        const fwrap = document.createElement('div'); fwrap.className = 'field-grid';
        fwrap.appendChild(fieldTextarea('Pokédex Entry', bucket.entry, v => { bucket.entry = v; }).container);
        card.appendChild(fwrap);

        grid.appendChild(card);
      }
    }

    pdxWrap.appendChild(grid);
    right.appendChild(pdxWrap);
  }

  /* -------- Games editor -------- */
  function renderGameEditor() {
    let g = selectedId != null ? getGameById(selectedId) : null;
    const header = rowHeader('Games', [
      button('Save', () => { alert('Hook this to your store writer if you want persistence.'); }),
      button('Delete', () => { alert('Hook this to your delete logic.'); })
    ]);
    right.appendChild(header);

    if (!g) { right.appendChild(emptyRow('Select a game to edit or click New.')); return; }

    const preview = document.createElement('div'); preview.className = 'img-preview';
    if (g.imageSlug) setBackground(preview, imageBase().games + encodeURIComponent(String(g.imageSlug)) + '.webp');
    right.appendChild(preview);

    const form = document.createElement('div'); form.className = 'form-grid';
    form.appendChild(fieldText('ID', g.id || '', v => { g.id = v; }).container);
    form.appendChild(fieldText('Title', g.title || '', v => { g.title = v; }).container);
    form.appendChild(fieldText('Release Date (YYYY-MM-DD)', g.releaseDate || '', v => { g.releaseDate = v; }).container);
    form.appendChild(fieldText('Console', g.console || '', v => { g.console = v; }).container);
    form.appendChild(fieldText('Colour Hex', g.colorHex || '', v => { g.colorHex = v; }).container);
    form.appendChild(fieldText('Image Slug', g.imageSlug || '', v => {
      g.imageSlug = v;
      if (v) setBackground(preview, imageBase().games + encodeURIComponent(String(v)) + '.webp');
      else preview.style.backgroundImage = 'none';
    }).container);
    form.appendChild(
      fieldText('Corpus Slug (corpus/slug.txt)', g.corpusSlug || '', v => { g.corpusSlug = v; }).container
    );
    right.appendChild(form);
  }

  /* ---------------- Shared UI helpers (function declarations = hoisted) ---------------- */
  function rowHeader(titleText, buttons = []) {
    const header = document.createElement('div'); header.className = 'right-header';
    const title = document.createElement('div'); title.className = 'title';
    title.innerHTML = `<strong>${escapeHtml(titleText)}</strong>`;
    const tools = document.createElement('div'); tools.className = 'toolbar';
    for (const b of buttons) tools.appendChild(b);
    header.append(title, tools); return header;
  }
  function button(label, onClick) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', onClick); return b; }
  function groupTitle(text) { const el = document.createElement('div'); el.className = 'group-title'; el.innerHTML = `<strong>${escapeHtml(text)}</strong>`; return el; }
  function emptyRow(text) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = text; return p; }

  function field(kind, label, init, on) {
    const row = document.createElement('label'); row.className = 'field';
    const span = document.createElement('span'); span.textContent = label;
    const input = document.createElement(kind === 'textarea' ? 'textarea' : 'input');
    if (kind !== 'textarea') input.type = kind;
    input.value = init ?? '';
    input.addEventListener('input', () => on(kind === 'number' ? numOrNull(input.value) : input.value));
    row.append(span, input);
    return { container: row, input };
  }
  function fieldText(label, init, on) { return field('text', label, init, on); }
  function fieldNumber(label, init, on) { return field('number', label, init, on); }
  function fieldTextarea(label, init, on) { return field('textarea', label, init, on); }
  function fieldCheckbox(label, init, on) {
    const row = document.createElement('label'); row.className = 'field';
    const span = document.createElement('span'); span.textContent = label;
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!init;
    input.addEventListener('input', () => on(!!input.checked));
    row.append(span, input); return { container: row, input };
  }
  function fieldSelect(label, value, options, on) {
    const row = document.createElement('label'); row.className = 'field';
    const span = document.createElement('span'); span.textContent = label;
    const sel = document.createElement('select');
    for (const opt of options) {
      const o = document.createElement('option'); o.value = opt; o.textContent = opt || '—';
      if (String(opt) === String(value)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('input', () => on(sel.value));
    row.append(span, sel);
    return { container: row, input: sel };
  }
  function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }

  function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function downloadAll() {
    if (activeTab === 'settings') downloadJSON('settings.json', getSettings() || {});
    else if (activeTab === 'pokemon') downloadJSON('data-pokemon.json', listPokemon());
    else if (activeTab === 'games') downloadJSON('data-games.json', listGames());
  }
}

/* Exports: support both named and default imports */
export { AdminPage };
export default AdminPage;
