// corpus-loader.js

const CACHE = new Map(); // slug -> { text, lines }

/** Build a URL to a corpus file from a slug like "red" -> "./data/corpus/red.txt" */
export function corpusUrlFromSlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  return `./data/corpus/${encodeURIComponent(s)}.txt`;
}

/** Internal: parse text to clean lines (preserves original text) */
function toResult(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\\[nrc]/g, ' ').replace(/\s+/g, ' ').trim());
  return { text: String(text || ''), lines };
}

/** Fetch by explicit slug; returns {text,lines}. If slug is empty or 404, returns empty result. */
export async function loadCorpusBySlug(slug) {
  const key = String(slug || '').trim();
  if (!key) return { text: '', lines: [] };                 // ✅ no slug => no fetch

  if (CACHE.has(key)) return CACHE.get(key);

  const href = corpusUrlFromSlug(key);
  if (!href) return { text: '', lines: [] };

  try {
    const res = await fetch(href, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status || '404'));
    const result = toResult(await res.text());
    CACHE.set(key, result);
    return result;
  } catch {
    const empty = { text: '', lines: [] };                  // ✅ 404 => empty result, cached
    CACHE.set(key, empty);
    return empty;
  }
}

/** Convenience: load for a game object that may (or may not) have a corpusSlug. */
export async function loadCorpusForGame(game) {
  const slug = game?.corpusSlug && String(game.corpusSlug).trim();
  if (!slug) return { text: '', lines: [] };                // ✅ no slug => no fetch
  return loadCorpusBySlug(slug);
}

/**
 * Back-compat alias: treat the argument as a SLUG (not an id).
 * If callers pass '', null, or undefined, we return empty and do not fetch.
 */
export async function loadCorpusText(slugMaybe) {
  const s = String(slugMaybe || '').trim();
  if (!s) return { text: '', lines: [] };                   // ✅ guard
  return loadCorpusBySlug(s);
}
