// Central in-memory store for settings, pokemon, games

let SETTINGS = {};
let POKEMON = [];
let GAMES = [];

const INDEX = { byPid: new Map(), byGid: new Map() };

async function j(href) {
  const res = await fetch(href, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${href} -> ${res.status}`);
  return res.json();
}

export async function loadCoreData() {
  try {
    [SETTINGS, POKEMON, GAMES] = await Promise.all([
      j('./data/settings.json'),
      j('./data/pokemon.json'),
      j('./data/games.json'),
    ]);
  } catch (e) {
    console.warn('Core data load failed:', e);
    SETTINGS = SETTINGS || {};
    POKEMON = Array.isArray(POKEMON) ? POKEMON : [];
    GAMES   = Array.isArray(GAMES) ? GAMES : [];
  }
  indexify();
}

function indexify() {
  INDEX.byPid.clear();
  for (const p of POKEMON) INDEX.byPid.set(String(p.id), p);
  INDEX.byGid.clear();
  for (const g of GAMES) INDEX.byGid.set(String(g.id), g);
}

/* ----------------------- Settings API ----------------------- */

export const getSettings = () => SETTINGS;

/**
 * Apply a partial update to SETTINGS in-memory.
 * Uses a deep merge (objects merged, arrays replaced).
 * Returns the updated SETTINGS object.
 */
export function setSettings(patch) {
  if (!patch || typeof patch !== 'object') return SETTINGS;
  SETTINGS = deepMerge(structuredClone(SETTINGS || {}), patch);
  return SETTINGS;
}

/**
 * Resolve image bases with sensible defaults.
 * Supports either:
 *  - SETTINGS.imageBase = { pokemon, games }    (older style)
 *  - SETTINGS.assets.imageBase = "assets/images" (string base, new style)
 */
export function imageBase() {
  // Defaults
  const def = { pokemon: 'assets/images/pkmn/', games: 'assets/images/games/' };

  // Newer style: assets.imageBase string (folder root)
  const assetsRoot = SETTINGS?.assets?.imageBase;
  if (typeof assetsRoot === 'string' && assetsRoot.trim()) {
    const root = assetsRoot.replace(/\/+$/, '');
    return {
      pokemon: `${root}/pkmn/`,
      games: `${root}/games/`,
    };
  }

  // Older style: top-level imageBase object with keys
  if (SETTINGS?.imageBase && typeof SETTINGS.imageBase === 'object') {
    return { ...def, ...SETTINGS.imageBase };
  }

  return def;
}

/* ----------------------- Pokemon/Games READ API ----------------------- */

export const listPokemon = () => POKEMON.slice();
export const listGames   = () => GAMES.slice();
export const getPokemonById = (id) => INDEX.byPid.get(String(id)) || null;
export const getGameById    = (id) => INDEX.byGid.get(String(id)) || null;

// Sorting helpers
export function byReleaseDateAsc(a,b) {
  const da = Date.parse(a?.releaseDate || '1970-01-01');
  const db = Date.parse(b?.releaseDate || '1970-01-01');
  return (isNaN(da)?0:da) - (isNaN(db)?0:db);
}

export function idComparator(a, b) {
  const A = parseIdForSort(a?.id), B = parseIdForSort(b?.id);
  if (A.num !== B.num) return A.num - B.num;
  if (A.suffix === B.suffix) return 0;
  if (!A.suffix) return -1;
  if (!B.suffix) return 1;
  return A.suffix.localeCompare(B.suffix, undefined, { sensitivity: 'base' });
}

function parseIdForSort(raw) {
  const id = String(raw ?? '').trim();
  const m = id.match(/^(\d+)(.*)$/);
  return m ? { num: parseInt(m[1], 10), suffix: m[2] || '' }
           : { num: Number.POSITIVE_INFINITY, suffix: id };
}

const DELETED = { pokemon: new Set(), games: new Set() };

/* ----------------------- Mutation: Delete ----------------------- */
/**
 * Remove a Pokémon from the in-memory store by id.
 * No-op if the id is not found.
 */
export function removePokemonById(id) {
  const key = String(id);
  let changed = false;

  DELETED.pokemon.add(key);

  // Remove from array
  const beforeLen = POKEMON.length;
  POKEMON = POKEMON.filter(p => String(p.id) !== key);
  if (POKEMON.length !== beforeLen) changed = true;

  // Remove from index
  if (INDEX.byPid.delete(key)) changed = true;

  if (changed) indexify();
  return changed;
}

/**
 * Remove a Game from the in-memory store by id.
 * No-op if the id is not found.
 */
export function removeGameById(id) {
  const key = String(id);
  let changed = false;

  DELETED.games.add(key);

  // Remove from array
  const beforeLen = GAMES.length;
  GAMES = GAMES.filter(g => String(g.id) !== key);
  if (GAMES.length !== beforeLen) changed = true;

  // Remove from index
  if (INDEX.byGid.delete(key)) changed = true;

  if (changed) indexify();
  return changed;
}

export function exportPokemon() {
  // Always reflect current in-memory list, minus any tombstoned ids
  return POKEMON.filter(p => !DELETED.pokemon.has(String(p?.id ?? '')));
}
export function exportGames() {
  return GAMES.filter(g => !DELETED.games.has(String(g?.id ?? '')));
}

/* ----------------------- Utils ----------------------- */

/**
 * Deep-merge plain objects. Arrays are replaced (not merged).
 */
function deepMerge(target, source) {
  if (Array.isArray(source)) return source.slice();
  if (!isPlainObject(source)) return source;

  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(source)) {
    const tv = out[k];
    if (isPlainObject(v)) out[k] = deepMerge(tv, v);
    else if (Array.isArray(v)) out[k] = v.slice();
    else out[k] = v;
  }
  return out;
}
function isPlainObject(o) {
  return !!o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype;
}
