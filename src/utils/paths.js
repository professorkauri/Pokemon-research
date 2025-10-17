export const BASE = import.meta.env.BASE_URL; // '/' in dev, '/Pokemon-research/' in prod

export function withBase(path = '') {
  const b = BASE.endsWith('/') ? BASE : BASE + '/';
  return b + String(path).replace(/^\/+/, '');
}

// Helpful for constructing absolute URLs from modules
export function urlFromModule(relPath, moduleUrl = import.meta.url) {
  return new URL(relPath, moduleUrl).href; // Vite handles this correctly in dev & prod
}
