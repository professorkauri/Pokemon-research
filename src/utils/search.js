export function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

export function highlightHTMLMulti(text, terms) {
  const src = String(text ?? '');
  if (!terms || !terms.length) return escapeHtml(src);
  const sorted = [...terms].sort((a,b) => b.length - a.length).map(t => escapeRegExp(String(t)));
  const re = new RegExp('(' + sorted.join('|') + ')', 'ig');
  return escapeHtml(src).replace(re, '<mark class="hl">$1</mark>');
}

export function parseAndQuery(qRaw) {
  const raw = String(qRaw || '');
  let excludes = [];
  let rest = raw;
  const m = raw.match(/\[([^\]]*)\]/);
  if (m) {
    const inner = m[1] || '';
    excludes = excludes.concat(inner.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean));
    rest = raw.replace(m[0], ' ');
  }
  const parts = rest.split('+').map(s=>s.trim()).filter(Boolean);
  const terms = [];
  for (const part of parts) {
    if (!part) continue;
    const bits = part.split(/\s+/);
    const kept = [];
    for (const b of bits) {
      if (b.startsWith('-') && b.length > 1) excludes.push(b.slice(1));
      else kept.push(b);
    }
    if (kept.length) terms.push(kept.join(' '));
  }
  return { isAnd: terms.length > 1, terms, excludes };
}

export function textMatchesTerms(text, terms, isAnd) {
  const hay = String(text || '').toLowerCase();
  if (!terms.length) return false;
  if (isAnd) return terms.every(t => hay.includes(t.toLowerCase()));
  return terms.some(t => hay.includes(String(t).toLowerCase()));
}
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
