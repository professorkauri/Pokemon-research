import { listGames, byReleaseDateAsc } from '../state/data-store.js';
import { GameCard } from '../modules/Card.js';

export function GamesPage() {
  const wrap = document.createElement('div'); wrap.className = 'grid';
  const games = listGames().slice().sort(byReleaseDateAsc);
  for (const g of games) {
    wrap.appendChild(GameCard(g, { onOpen: gg => location.hash = `#/games/${encodeURIComponent(gg.id)}` }));
  }
  return wrap;
}
