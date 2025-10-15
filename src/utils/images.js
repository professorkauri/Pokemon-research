import { imageBase } from '../state/data-store.js';

export const PKMN_IMG = (id) => imageBase().pokemon + encodeURIComponent(id) + '.webp';
export const GAME_IMG  = (slug) => imageBase().games + encodeURIComponent(slug) + '.webp';

const IMG_STATUS = new Map();

function applyBg(el, url) { el.style.backgroundImage = `url("${url}")`; }

function loadOnce(url, ok, err) {
  const s = IMG_STATUS.get(url);
  if (s === 'ok') { ok(); return; }
  if (s === 'err') { err?.(); return; }
  const img = new Image();
  img.onload = () => { IMG_STATUS.set(url, 'ok'); ok(); };
  img.onerror = () => { IMG_STATUS.set(url, 'err'); err?.(); };
  img.src = url;
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target; io.unobserve(el);
    const url = el.dataset.bg || '';
    if (!url) return;
    loadOnce(url, () => applyBg(el, url), () => { el.style.backgroundImage = 'none'; });
  }
}, { root: null, rootMargin: '300px', threshold: 0.01 });

export function lazyBg(el, url) {
  if (!url) { el.style.backgroundImage = 'none'; return; }
  el.dataset.bg = url;
  io.observe(el);
}
