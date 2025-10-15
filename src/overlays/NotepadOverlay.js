import { loadNotepad, saveNotepad, uid } from '../state/notepad-store.js';

// Public API so other modules can add items
export function addDexToNotepad({ p, game, entryText, regionalDexNumber = '' }) {
  const list = loadNotepad();
  const id = `dex:${p.id}`;
  let group = list.find(g => g.id === id && g.kind === 'dex');
  if (!group) {
    group = {
      id, kind: 'dex',
      pId: String(p.id), pName: p.name || '(Unnamed)',
      pForm: p.form || '', pType1: p.type1 || '', pType2: p.type2 || '',
      entries: []
    };
    list.push(group);
  }
  const gameColorHex = (game?.colorHex && /^#[0-9a-f]{6}$/i.test(game.colorHex)) ? game.colorHex.toUpperCase() : '#888888';
  const exists = group.entries.some(e =>
    String(e.gameId) === String(game?.id) &&
    String(e.entryText || '').trim() === String(entryText || '').trim()
  );
  if (!exists) {
    group.entries.push({
      id: uid(),
      gameId: game?.id ?? '',
      gameTitle: game?.title ?? '(Game)',
      gameColorHex,
      entryText: String(entryText || ''),
      regionalDexNumber: String(regionalDexNumber || '')
    });
  }
  saveNotepad(list);
  renderIfMounted();
}

export function addCorpusLineToNotepad({ game, lineNumber, lineText }) {
  const list = loadNotepad();
  const id = `corpus:${game.id}`;
  let group = list.find(g => g.id === id && g.kind === 'corpus');
  if (!group) {
    group = {
      id, kind: 'corpus',
      gameId: game.id,
      gameTitle: game.title || '(Game)',
      gameColorHex: (game.colorHex && /^#[0-9a-f]{6}$/i.test(game.colorHex)) ? game.colorHex.toUpperCase() : '#888888',
      corpusSlug: game.corpusSlug || '',
      lines: []
    };
    list.push(group);
  }
  if (!group.lines.some(l => Number(l.lineNumber) === Number(lineNumber))) {
    group.lines.push({ id: uid(), lineNumber: Number(lineNumber), lineText: String(lineText || '') });
    group.lines.sort((a, b) => a.lineNumber - b.lineNumber);
  }
  saveNotepad(list);
  renderIfMounted();
}

let overlay, body;

export function mountNotepadOverlay(root) {
  overlay = document.createElement('div');
  overlay.id = 'notepadOverlay';
  overlay.className = 'overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="admin-window" role="dialog" aria-modal="true" aria-label="Notepad">
      <div class="admin-header">
        <div class="admin-title">Notepad</div>
        <div class="toolbar">
          <button id="npAdd" class="btn accent">Add Note</button>
          <button id="npDownload" class="btn">Download</button>
          <button id="npClear" class="btn danger">Clear</button>
          <button id="npClose" class="btn">Close</button>
        </div>
      </div>
      <div class="right-body" id="notepadBody"></div>
    </div>
  `;
  root.appendChild(overlay);
  body = overlay.querySelector('#notepadBody');

  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeNotepad(); });
  overlay.querySelector('#npClose')?.addEventListener('click', closeNotepad);
  overlay.querySelector('#npAdd')?.addEventListener('click', () => addNote());
  overlay.querySelector('#npClear')?.addEventListener('click', clearAll);
  overlay.querySelector('#npDownload')?.addEventListener('click', download);
}

export function openNotepad() {
  render();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}
export function closeNotepad() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function clearAll() {
  const btn = overlay.querySelector('#npClear');
  if (!btn.dataset.arm) {
    btn.dataset.arm = '1';
    btn.textContent = 'Are you sure?';
    btn.classList.add('notepad_warning');
    setTimeout(()=>{ btn.dataset.arm=''; btn.textContent='Clear'; btn.classList.remove('notepad_warning'); }, 2000);
    return;
  }
  saveNotepad([]);
  render();
  btn.dataset.arm = '';
  btn.textContent = 'Clear';
  btn.classList.remove('notepad_warning');
}
function download() {
  const data = loadNotepad();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'notepad.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function addNote() {
  const list = loadNotepad();
  list.push({ id: `note:${uid()}`, kind: 'note', title: 'Note', text: '' });
  saveNotepad(list);
  render();
}

function renderIfMounted() {
  if (overlay?.classList.contains('open')) render();
}

function render() {
  const list = loadNotepad();
  body.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Your Notepad is empty.';
    body.appendChild(empty);
    return;
  }
  for (const g of list) {
    if (g.kind === 'note') body.appendChild(renderNoteCard(g));
    else if (g.kind === 'dex') body.appendChild(renderDexGroup(g));
    else if (g.kind === 'corpus') body.appendChild(renderCorpusGroup(g));
  }
  enableDragReorder(body);
}

/* ----- Renderers ----- */
function renderNoteCard(group) {
  const card = document.createElement('div');
  card.className = 'result note';
  card.dataset.id = group.id;

  const header = document.createElement('div');
  header.className = 'result-header';
  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'note-title-input';
  title.value = group.title || 'Note';
  title.addEventListener('input', () => { group.title = title.value; persist(group); });
  const rm = button('Remove', ()=> remove(group.id));
  header.append(title, rm);
  card.appendChild(header);

  const box = document.createElement('div'); box.className='subsection';
  const ta = document.createElement('textarea'); ta.value = group.text || '';
  ta.addEventListener('input', ()=> { group.text = ta.value; persist(group); });
  box.appendChild(ta);
  card.appendChild(box);
  return card;
}
function renderDexGroup(group) {
  const card = document.createElement('div');
  card.className = 'result';
  card.dataset.id = group.id;

  const header = document.createElement('div');
  header.className = 'result-header';
  const title = document.createElement('div');
  title.innerHTML = `<strong>${escape(group.pName || '(Unnamed)')}</strong>${group.pForm ? ` <span class="muted">• ${escape(group.pForm)}</span>` : ''}<div class="muted">#${escape(group.pId || '')} • ${(group.pType1||'')}${group.pType2? ' / '+group.pType2 : ''}</div>`;
  header.appendChild(title);
  card.appendChild(header);

  const box = document.createElement('div'); box.innerHTML = `<div class="section-title">Pokédex entries</div>`;
  const list = document.createElement('div'); list.className = 'dex';
  if (!group.entries?.length) {
    const empty = document.createElement('div'); empty.className='muted'; empty.textContent='No entries yet.'; list.appendChild(empty);
  } else {
    for (const e of group.entries) {
      const item = document.createElement('div'); item.className = 'dex-entry';
      item.setAttribute('style', `--dex-color:${e.gameColorHex || '#888888'}`);
      const meta = document.createElement('div'); meta.className = 'muted'; meta.textContent = e.gameTitle || '(Game)';
      const body = document.createElement('div'); body.className='dex-entry-body';
      const txt = document.createElement('div'); txt.textContent = e.entryText || '—';
      const rm = button('−📓', ()=> removeChild(group.id, e.id));
      body.append(txt, rm);
      item.append(meta, body);
      list.appendChild(item);
    }
  }
  box.appendChild(list);
  card.appendChild(box);
  return card;
}
function renderCorpusGroup(group) {
  const card = document.createElement('div'); card.className='result'; card.dataset.id = group.id;
  const header = document.createElement('div'); header.className='result-header';
  const title = document.createElement('div'); title.innerHTML = `<strong>${escape(group.gameTitle || '(Game)')}</strong><div class="muted">Corpus</div>`;
  header.appendChild(title); card.appendChild(header);
  const box = document.createElement('div'); box.innerHTML = `<div class="section-title">Corpus lines</div>`;
  const list = document.createElement('div');
  if (!group.lines?.length) {
    const empty = document.createElement('div'); empty.className='muted'; empty.textContent='No lines yet.'; list.appendChild(empty);
  } else {
    for (const l of group.lines) {
      const p = document.createElement('p'); p.className='corpus_line';
      p.innerHTML = `<span class="muted">${l.lineNumber}.</span> ${escape(l.lineText || '—')}`;
      const rm = button('−📓', ()=> removeChild(group.id, l.id)); rm.style.marginLeft='8px';
      p.appendChild(rm);
      list.appendChild(p);
    }
  }
  box.appendChild(list); card.appendChild(box);
  return card;
}

/* ----- DnD reorder ----- */
function enableDragReorder(container) {
  const cards = [...container.querySelectorAll('.result')];
  for (const el of cards) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e)=> {
      el.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', el.dataset.id || ''); }
    });
    el.addEventListener('dragend', ()=> {
      el.classList.remove('dragging');
      persistOrder(container);
    });
  }
  container.addEventListener('dragover', (e)=> {
    e.preventDefault();
    const dragging = container.querySelector('.dragging');
    if (!dragging) return;
    const after = getAfter(container, e.clientY);
    if (after == null) container.appendChild(dragging);
    else container.insertBefore(dragging, after);
  });
}
function getAfter(container, y) {
  const els = [...container.querySelectorAll('.result:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - (box.top + box.height/2);
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}
function persistOrder(container) {
  const order = [...container.querySelectorAll('.result')].map(el => el.dataset.id).filter(Boolean);
  const list = loadNotepad();
  const map = new Map(list.map(g => [g.id, g]));
  const reordered = order.map(id => map.get(id)).filter(Boolean);
  for (const g of list) if (!reordered.includes(g)) reordered.push(g);
  saveNotepad(reordered);
}

/* ----- helpers ----- */
function button(label, onClick) { const b=document.createElement('button'); b.className='btn'; b.textContent=label; b.onclick=onClick; return b; }
function escape(s){ return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function persist(group) {
  const list = loadNotepad();
  const i = list.findIndex(x => x.id === group.id);
  if (i >= 0) { list[i] = group; saveNotepad(list); }
}
function remove(id) {
  const list = loadNotepad().filter(x => x.id !== id);
  saveNotepad(list);
  render();
}
function removeChild(groupId, childId) {
  const list = loadNotepad();
  const g = list.find(x => x.id === groupId);
  if (!g) return;
  if (g.kind === 'dex') g.entries = (g.entries || []).filter(e => e.id !== childId);
  if (g.kind === 'corpus') g.lines = (g.lines || []).filter(e => e.id !== childId);
  saveNotepad(list);
  if ((g.kind === 'dex' && !g.entries?.length) || (g.kind === 'corpus' && !g.lines?.length)) remove(groupId);
  else render();
}
