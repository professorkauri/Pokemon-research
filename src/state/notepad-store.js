const KEY = 'notepad_v2';

export function loadNotepad() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
export function saveNotepad(list) {
  localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
