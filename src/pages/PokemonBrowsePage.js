import { listPokemon } from '../state/data-store.js';
import { DexGrid } from '../modules/DexGrid.js';
import { idComparator } from '../state/data-store.js';
import { useSidecarCSS } from '../utils/css.js';

useSidecarCSS(import.meta.url);

export function PokemonBrowsePage() {
  const wrap = document.createElement('div');
  const list = listPokemon().slice().sort(idComparator);
  const grid = DexGrid(list, {
    onOpen: (p) => location.hash = `#/pokemon/${encodeURIComponent(p.id)}`
  });
  wrap.appendChild(grid);
  return wrap;
}
