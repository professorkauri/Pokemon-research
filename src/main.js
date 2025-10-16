import { initRouter } from './router.js';
import { loadCoreData, getSettings } from './state/data-store.js';
import { mountNotepadOverlay, openNotepad } from './overlays/NotepadOverlay.js';

const app = document.getElementById('app');
const header = document.getElementById('siteHeader');
const overlays = document.getElementById('overlays');

// Basic header + nav
function renderHeader() {
  header.innerHTML = `
    <div class="brand">Pokemon Research</div>
    <nav class="segmented">
      <a class="seg" href="#/home">Home</a>
      <a class="seg" href="#/pokemon">Pokemon</a>
      <a class="seg" href="#/games">Games</a>
      <a class="seg" href="#/admin">Admin</a>
      <button id="openNotepad" class="btn">📓 Notepad</button>
    </nav>
  `;
  header.querySelector('#openNotepad')?.addEventListener('click', openNotepad);
}

(async () => {
  renderHeader();
  await loadCoreData();                 // settings + pokemon + games
  mountNotepadOverlay(overlays);        // notepad is the only overlay
  initRouter(app);                      // kick off routing

  // Optional: show debug flag in console
  const s = getSettings();
  if (s?.features?.debug) console.info('[DEBUG] Settings loaded:', s);
})();
