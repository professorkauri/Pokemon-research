import { listPokemon } from '../state/data-store.js';
import { DexGrid } from '../modules/DexGrid.js';
import { idComparator } from '../state/data-store.js';

export function PokemonBrowsePage() {
  const wrap = document.createElement('div'); wrap.className = 'grid pokemon';
  const list = listPokemon().slice().sort(idComparator);
  const grid = DexGrid(list, {
    onOpen: (p) => location.hash = `#/pokemon/${encodeURIComponent(p.id)}`
  });
  wrap.appendChild(grid);
  return wrap;
}
