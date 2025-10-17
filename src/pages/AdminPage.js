// AdminPage.js
import { useSidecarCSS } from '../utils/css.js';
import {
  // Still reuse shared settings + image paths from the store.
  getSettings, setSettings, imageBase,
} from '../state/data-store.js';

useSidecarCSS(import.meta.url);

/* ------------------------------------------------
   Admin-local memory (single source of truth for UI + export)
--------------------------------------------------*/
const ADMIN = {
  ready: false,
  pokemon: [],
  games: [],
};

function byPokeIdForm(a, b) {
  const parse = (id) => {
    const s = String(id || '');
    const m = s.match(/^(\d+)(?:-([a-z]+))?$/i);
    if (!m) return [Number.POSITIVE_INFINITY, s.toLowerCase()]; // unknowns go last
    return [parseInt(m[1], 10), (m[2] || '').toLowerCase()];
  };
  const [na, sa] = parse(a.id);
  const [nb, sb] = parse(b.id);
  if (na !== nb) return na - nb;          // numeric first
  if (sa === sb) return 0;
  if (sa === '') return -1;               // base form before suffixed forms
  if (sb === '') return 1;
  return sa < sb ? -1 : 1;                // suffix alphabetical: a, g, gm, etc.
}

// If your app already loads JSON elsewhere, swap this for that source.
async function loadJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function ensureAdminMemory() {
  if (ADMIN.ready) return;
  const [pokemon, games] = await Promise.all([
    loadJson('./data/pokemon.json').catch(() => []),
    loadJson('./data/games.json').catch(() => []),
  ]);
  // Make admin-local copies (don’t mutate original arrays)
  ADMIN.pokemon = Array.isArray(pokemon) ? pokemon.map(x => ({ ...structuredClone(x), _deleted: !!x._deleted })) : [];
  ADMIN.games   = Array.isArray(games)   ? games.map(x => ({ ...structuredClone(x), _deleted: !!x._deleted }))   : [];
  ADMIN.ready = true;
}

/* ------------------------------------------------
   Small constants / helpers
--------------------------------------------------*/
const TYPE_OPTIONS = ["", "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function byReleaseDateAsc(a, b) {
  const da = Date.parse(a?.releaseDate || '1970-01-01');
  const db = Date.parse(b?.releaseDate || '1970-01-01');
  return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
}
function setBackground(el, url) {
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}

// Admin-memory list/get (single source of truth)
function apListPokemon() { return ADMIN.pokemon.slice(); }
function apListGames()   { return ADMIN.games.slice(); }
function apGetPokemonById(id) {
  const key = String(id);
  return ADMIN.pokemon.find(p => String(p?.id) === key) || null;
}
function apGetGameById(id) {
  const key = String(id);
  return ADMIN.games.find(g => String(g?.id) === key) || null;
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

/** Normalize legacy pokedex formats to:
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
  // ---------- State ----------
  let activeTab = 'pokemon';    // 'settings' | 'pokemon' | 'games'
  let selectedId = null;
  let filter = '';

  // ---------- Root skeleton ----------
  const root = document.createElement('div');
  root.className = 'admin-root';

  const topbar = document.createElement('div');
  topbar.className = 'admin-topbar';

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'segmented';
  const tSettings = makeTab('Settings', 'settings');
  const tPokemon  = makeTab('Pokémon', 'pokemon');
  const tGames    = makeTab('Games', 'games');
  tabs.append(tSettings, tPokemon, tGames);
  topbar.appendChild(tabs);

  const topbar_right = document.createElement('div');
  topbar_right.className = 'admin-topbar-right';

  const btnExport = document.createElement('button');
  btnExport.textContent = 'Download settings.json';
  btnExport.className = 'btn accent';
  btnExport.addEventListener('click', downloadAll);

  const btnAdd = document.createElement('button');
  btnAdd.textContent = 'Add Item';
  btnAdd.className = 'btn';
  btnAdd.addEventListener('click', () => {
    selectedId = null;
    if (activeTab === 'pokemon') renderEditor({ __new__: true, section: 'pokemon' });
    else if (activeTab === 'games') renderEditor({ __new__: true, section: 'games' });
  });

  topbar_right.append(btnAdd, btnExport);
  topbar.appendChild(topbar_right);
  root.appendChild(topbar);

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

  // Initial paint (load admin memory first)
  boot();

  return root;

  async function boot() {
    right.innerHTML = '';
    left.classList.add('loading');
    try {
      await ensureAdminMemory();
    } finally {
      left.classList.remove('loading');
    }
    setActive();
    renderList();
    renderEditor();
  }

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

    // Hide left column + search on Settings
    const hideLeft = (activeTab === 'settings');
    left.style.display = hideLeft ? 'none' : '';
    right.style.flex = '1 1 auto';
    searchWrap.style.display = hideLeft ? 'none' : '';

    if (!hideLeft) {
      search.placeholder = (activeTab === 'pokemon') ? 'Filter Pokémon…' : 'Filter Games…';
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
      const P = apListPokemon()
        .slice()
        .sort(byPokeIdForm)
        .filter(p => !filter ||
          String(p.id).includes(filter) ||
          (p.name || '').toLowerCase().includes(filter));

      if (!P.length) {
        list.appendChild(emptyRow('No Pokémon.'));
        return;
      }

      for (const p of P) {
        const row = document.createElement('div');
        row.className = 'row-item' + (String(p.id) === String(selectedId) ? ' active' : '');
        if (p._deleted) row.classList.add('is-deleted');
        row.onclick = () => {
          selectedId = String(p.id);
          list.querySelectorAll('.row-item.active').forEach(el => el.classList.remove('active'));
          row.classList.add('active');
          renderEditor();
        };

        const thumb = document.createElement('div');
        thumb.className = 'thumb';
        const id = (p.id || '').toString().trim();
        if (id) lazyBg(thumb, imageBase().pokemon + encodeURIComponent(id) + '.webp');
        else thumb.style.backgroundImage = 'none';

        const label1 = document.createElement('strong');
        label1.innerHTML = `${escapeHtml(p.name || '(Unnamed)')}`;
        const sub = document.createElement('div');
        sub.className = 'muted';
        sub.innerHTML = `${escapeHtml(String(p.id || ''))}`;

        row.append(thumb, label1, sub);

        if (p._deleted) {
          const pill = document.createElement('span');
          pill.className = 'pill pill-danger';
          pill.textContent = 'Deleted';
          row.appendChild(pill);
        }
        list.appendChild(row);
      }
      return;
    }

    if (activeTab === 'games') {
      const G = apListGames().filter(g =>
        !filter ||
        (g.title || '').toLowerCase().includes(filter) ||
        (g.console || '').toLowerCase().includes(filter)
      );

      if (!G.length) {
        list.appendChild(emptyRow('No games.'));
        return;
      }

      for (const g of G) {
        const row = document.createElement('div');
        row.className = 'row-item' + (String(g.id) === String(selectedId) ? ' active' : '');
        if (g._deleted) row.classList.add('is-deleted');
        row.onclick = () => {
          selectedId = String(g.id);
          list.querySelectorAll('.row-item.active').forEach(el => el.classList.remove('active'));
          row.classList.add('active');
          renderEditor();
        };

        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        if (g.imageSlug) {
          const url = imageBase().games + encodeURIComponent(String(g.imageSlug)) + '.webp';
          lazyBg(thumb, url);
        } else {
          thumb.style.background = g.colorHex || '#999';
        }

        
        const title = document.createElement('strong');
        title.textContent = g.title || '(Untitled)';
        const meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = g.console || '';

        row.append(thumb, title, meta);

        if (g._deleted) {
          const pill = document.createElement('span');
          pill.className = 'pill pill-danger';
          pill.textContent = 'Deleted';
          row.appendChild(pill);
        }
      
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

    const wrap = document.createElement('div'); wrap.className = 'form-grid';

    wrap.appendChild(groupTitle('App & Theme'));
    wrap.appendChild(fieldText('App Title', s.app?.title || '', v => { s.app ||= {}; s.app.title = v; setSettings(s); }).container);
    wrap.appendChild(fieldText('Theme', s.app?.theme || '', v => { s.app ||= {}; s.app.theme = v; setSettings(s); }).container);

    wrap.appendChild(groupTitle('UI Options'));
    wrap.appendChild(fieldCheckbox('Show debug tools', !!s.ui?.debug, v => { s.ui ||= {}; s.ui.debug = v; setSettings(s); }).container);
    wrap.appendChild(fieldCheckbox('Use compact lists', !!s.ui?.compact, v => { s.ui ||= {}; s.ui.compact = v; setSettings(s); }).container);

    right.appendChild(wrap);
  }

  /* -------- Pokémon editor -------- */
  function renderPokemonEditor(opts) {
    let p;
    if (opts?.__new__) {
      p = { id: '', name: '', form: '', species: '', category: '', evolution: '', type1: '', type2: '', hp: null, attack: null, defense: null, spAtk: null, spDef: null, speed: null, pokedex: {}, _deleted: false };
      ADMIN.pokemon.push(p);
      selectedId = p.id || null;
    } else if (selectedId != null) {
      p = apGetPokemonById(selectedId);
    }

    if (!p) {
      right.appendChild(emptyRow('Select a Pokémon to edit or click New.'));
      return;
    }

    // --- Header strip (Delete / Undo & status)
    const header = document.createElement('div');
    header.className = 'right-header';
    const titleSide = document.createElement('div');
    const status = document.createElement('span');
    status.className = 'pill pill-danger';
    const setStatus = () => {
      if (p._deleted) {
        status.style.display = '';
        status.textContent = 'Marked for deletion';
      } else {
        status.style.display = 'none';
      }
    };
    setStatus();
    titleSide.appendChild(status);

    const tools = document.createElement('div');
    tools.className = 'toolbar';
    tools.appendChild(makeDeleteToggleButton('pokemon', () => p, () => {
      setStatus();
      renderList(); // update left list badges
    }));
    header.append(titleSide, tools);
    right.appendChild(header);

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

    // Typing
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

    const games = apListGames().slice().sort(byReleaseDateAsc);
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

        const bucket = (p.pokedex[g.id] ||= { regionalDexNumber: '', entry: '' });

        const rd = fieldText('Regional Dex Number', bucket.regionalDexNumber, v => { bucket.regionalDexNumber = v; }).container;
        rd.classList.add('field-inline');
        title.appendChild(rd);
        card.appendChild(title);

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
    let g;
    if (selectedId != null) g = apGetGameById(selectedId);
    if (!g) { right.appendChild(emptyRow('Select a game to edit or click New.')); return; }

    // --- Header strip (Delete / Undo & status)
    const header = document.createElement('div');
    header.className = 'right-header';
    const titleSide = document.createElement('div');
    const status = document.createElement('span');
    status.className = 'pill pill-danger';
    const setStatus = () => {
      if (g._deleted) {
        status.style.display = '';
        status.textContent = 'Marked for deletion';
      } else {
        status.style.display = 'none';
      }
    };
    setStatus();
    titleSide.appendChild(status);

    const tools = document.createElement('div');
    tools.className = 'toolbar';
    tools.appendChild(makeDeleteToggleButton('games', () => g, () => {
      setStatus();
      renderList();
    }));
    header.append(titleSide, tools);
    right.appendChild(header);

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

  /* ---------------- Shared UI helpers ---------------- */
  // Toggle-style delete button:
  // - If not deleted: requires arming, then sets _deleted = true
  // - If deleted: single click to undo
  function makeDeleteToggleButton(section, getObj, onChange) {
    const btn = document.createElement('button');
    btn.className = 'btn danger';

    const label = () => {
      const obj = getObj();
      btn.textContent = obj && obj._deleted ? 'Undo Delete' : 'Delete';
      btn.classList.toggle('is-undo', !!(obj && obj._deleted));
    };
    label();

    btn.addEventListener('click', () => {
      const obj = getObj?.();
      if (!obj) return;

      // If currently NOT deleted, use the same “Are you sure?” arming pattern before marking.
      if (!obj._deleted) {
        if (!btn.dataset.arm) {
          btn.dataset.arm = '1';
          btn.textContent = 'Are you sure?';
          btn.classList.add('notepad_warning');
          setTimeout(() => {
            btn.dataset.arm = '';
            label();
            btn.classList.remove('notepad_warning');
          }, 2000);
          return;
        }
        // Confirmed -> mark as deleted
        obj._deleted = true;
        btn.dataset.arm = '';
        btn.classList.remove('notepad_warning');
        label();
        onChange?.();
        return;
      }

      // If currently deleted -> single-click undo
      obj._deleted = false;
      label();
      onChange?.();
    });

    return btn;
  }

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

  // Build export payloads by skipping any _deleted item.
  function buildPokemonExport() {
    return apListPokemon().filter(p => !p?._deleted);
  }
  function buildGamesExport() {
    return apListGames().filter(g => !g?._deleted);
  }

  function downloadAll() {
    if (activeTab === 'settings') {
      downloadJSON('settings.json', getSettings() || {});
    } else if (activeTab === 'pokemon') {
      downloadJSON('data-pokemon.json', buildPokemonExport());
    } else if (activeTab === 'games') {
      downloadJSON('data-games.json', buildGamesExport());
    }
  }
}

/* Exports: support both named and default imports */
export { AdminPage };
export default AdminPage;
