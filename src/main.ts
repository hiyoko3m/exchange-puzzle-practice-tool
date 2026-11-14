import './style.css';
import { Game, type Phase } from './game';

const SYMBOLS = ['●', '▲', '■', '◆', '★', '♥'];
const PHASE_LABEL: Record<Phase, string> = { idle: '—', clear: '消去', fall: '落下' };

const boardEl = document.getElementById('board')!;
const chainEl = document.getElementById('chain')!;
const phaseEl = document.getElementById('phase')!;
const colorsEl = document.getElementById('colors') as HTMLSelectElement;

let game = Game.random(Number(colorsEl.value));

const cells: HTMLDivElement[][] = [];
for (let y = 0; y < game.height; y++) cells.push([]);
// Rows are laid out top to bottom; y = 0 is the bottom row.
for (let y = game.height - 1; y >= 0; y--)
  for (let x = 0; x < game.width; x++) {
    const el = document.createElement('div');
    boardEl.appendChild(el);
    cells[y][x] = el;
  }
const cursorEl = document.createElement('div');
cursorEl.id = 'cursor';
boardEl.appendChild(cursorEl);

function render(): void {
  for (let y = 0; y < game.height; y++)
    for (let x = 0; x < game.width; x++) {
      const el = cells[y][x];
      const p = game.grid[y][x];
      if (p) {
        el.className = `cell c${p.color} ${p.state}`;
        el.textContent = SYMBOLS[p.color];
      } else {
        el.className = game.isBlockedHole(x, y) ? 'cell blocked' : 'cell';
        el.textContent = '';
      }
    }
  const anchor = cells[game.cursor.y][game.cursor.x];
  cursorEl.style.left = `${anchor.offsetLeft}px`;
  cursorEl.style.top = `${anchor.offsetTop}px`;
  chainEl.textContent = String(game.chain);
  phaseEl.textContent = PHASE_LABEL[game.phase];
}

let rejectTimer: number | undefined;
function flashRejected(): void {
  cursorEl.classList.add('rejected');
  clearTimeout(rejectTimer);
  rejectTimer = window.setTimeout(() => cursorEl.classList.remove('rejected'), 150);
}

function reset(): void {
  game = Game.random(Number(colorsEl.value));
  render();
}

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft':
      game.moveCursor(-1, 0);
      break;
    case 'ArrowRight':
      game.moveCursor(1, 0);
      break;
    case 'ArrowUp':
      game.moveCursor(0, 1);
      break;
    case 'ArrowDown':
      game.moveCursor(0, -1);
      break;
    case 'z':
    case 'Z':
      if (e.repeat) return;
      if (!game.swap()) flashRejected();
      break;
    case 'Shift':
      if (e.repeat) return;
      game.advance();
      break;
    case 'r':
    case 'R':
      if (e.repeat) return;
      reset();
      return;
    default:
      return;
  }
  e.preventDefault();
  render();
});

colorsEl.addEventListener('change', () => {
  colorsEl.blur();
  reset();
});

render();
