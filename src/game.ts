export type PanelState = 'normal' | 'stuck' | 'floating';

export interface Panel {
  id: number;
  color: number;
  state: PanelState;
}

export type Cell = Panel | null;

/** Next action performed by the advance button. */
export type Phase = 'idle' | 'clear' | 'fall';

export const WIDTH = 6;
export const HEIGHT = 12;

export interface Cursor {
  /** Column of the left cell of the 2-wide cursor (0..width-2). */
  x: number;
  /** Row, 0 = bottom. */
  y: number;
}

/**
 * Board model. grid[y][x], y = 0 is the bottom row.
 *
 * Rules:
 * - Matches (3+ in a row/column) are detected among normal panels only and
 *   become "stuck" until the advance button is pressed.
 * - Advance alternates globally between "clear" (remove all stuck panels,
 *   panels above the holes start floating) and "fall" (floating panels drop,
 *   new matches extend the chain).
 * - Panels moved by a swap, and normal panels that lose support, fall
 *   immediately. Floating panels only fall in the fall phase.
 */
export class Game {
  readonly width: number;
  readonly height: number;
  grid: Cell[][];
  cursor: Cursor;
  phase: Phase = 'idle';
  chain = 0;
  chainActive = false;

  constructor(grid: Cell[][]) {
    this.grid = grid;
    this.height = grid.length;
    this.width = grid[0].length;
    this.cursor = { x: Math.floor((this.width - 2) / 2), y: Math.floor(this.height / 2) };
  }

  /** Fully filled random board with no initial matches. */
  static random(colors: number, rng: () => number = Math.random, width = WIDTH, height = HEIGHT): Game {
    const grid: Cell[][] = [];
    let id = 1;
    for (let y = 0; y < height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < width; x++) {
        const banned = new Set<number>();
        if (x >= 2 && row[x - 1]!.color === row[x - 2]!.color) banned.add(row[x - 1]!.color);
        if (y >= 2 && grid[y - 1][x]!.color === grid[y - 2][x]!.color) banned.add(grid[y - 1][x]!.color);
        const allowed: number[] = [];
        for (let c = 0; c < colors; c++) if (!banned.has(c)) allowed.push(c);
        const color = allowed[Math.floor(rng() * allowed.length)];
        row.push({ id: id++, color, state: 'normal' });
      }
      grid.push(row);
    }
    return new Game(grid);
  }

  /**
   * Build a board from rows written top to bottom.
   * '.' empty, '1'-'6' normal, 'a'-'f' floating, 'A'-'F' stuck.
   */
  static fromRows(rows: string[]): Game {
    let id = 1;
    const grid: Cell[][] = rows
      .slice()
      .reverse()
      .map((line) =>
        [...line].map((ch): Cell => {
          if (ch === '.') return null;
          if (ch >= '1' && ch <= '6') return { id: id++, color: ch.charCodeAt(0) - 49, state: 'normal' };
          if (ch >= 'a' && ch <= 'f') return { id: id++, color: ch.charCodeAt(0) - 97, state: 'floating' };
          if (ch >= 'A' && ch <= 'F') return { id: id++, color: ch.charCodeAt(0) - 65, state: 'stuck' };
          throw new Error(`bad cell '${ch}'`);
        }),
      );
    const game = new Game(grid);
    if (game.hasState('stuck')) game.phase = 'clear';
    if (game.hasState('floating')) game.phase = 'fall';
    return game;
  }

  /** Inverse of fromRows (for tests / debugging). */
  toRows(): string[] {
    return this.grid
      .map((row) =>
        row
          .map((p) => {
            if (!p) return '.';
            const base = p.state === 'normal' ? 49 : p.state === 'floating' ? 97 : 65;
            return String.fromCharCode(base + p.color);
          })
          .join(''),
      )
      .reverse();
  }

  get(x: number, y: number): Cell | undefined {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return undefined;
    return this.grid[y][x];
  }

  moveCursor(dx: number, dy: number): void {
    this.cursor.x = Math.min(this.width - 2, Math.max(0, this.cursor.x + dx));
    this.cursor.y = Math.min(this.height - 1, Math.max(0, this.cursor.y + dy));
  }

  /**
   * An empty cell can receive a panel only if the cell above it is also empty
   * (or outside the board). Stuck panels cannot be swapped.
   */
  isSwappableCell(x: number, y: number): boolean {
    const p = this.get(x, y);
    if (p === undefined) return false;
    if (p === null) {
      const above = this.get(x, y + 1);
      return above === undefined || above === null;
    }
    return p.state !== 'stuck';
  }

  /** Empty cell that cannot receive a panel (something sits directly above it). */
  isBlockedHole(x: number, y: number): boolean {
    return this.get(x, y) === null && !this.isSwappableCell(x, y);
  }

  canSwap(): boolean {
    const { x, y } = this.cursor;
    const a = this.grid[y][x];
    const b = this.grid[y][x + 1];
    if (!a && !b) return false;
    return this.isSwappableCell(x, y) && this.isSwappableCell(x + 1, y);
  }

  /** Swap the two panels under the cursor. Returns false if rejected. */
  swap(): boolean {
    if (!this.canSwap()) return false;
    const { x, y } = this.cursor;
    const a = this.grid[y][x];
    const b = this.grid[y][x + 1];
    this.grid[y][x] = b;
    this.grid[y][x + 1] = a;

    const moved = [a, b].filter((p): p is Panel => p !== null);
    // Moved panels fall immediately if nothing is below them; their state is
    // re-evaluated from what they end up resting on.
    for (const p of moved) p.state = 'normal';
    this.settleNormal();
    for (const p of moved) {
      const pos = this.find(p);
      const below = this.get(pos.x, pos.y - 1);
      p.state = below && below.state === 'floating' ? 'floating' : 'normal';
    }

    if (this.markMatches() > 0) {
      if (this.phase === 'idle') this.phase = 'clear';
      if (!this.chainActive) {
        this.chainActive = true;
        this.chain = 1;
      }
    }
    return true;
  }

  /** Advance button: run the current phase. */
  advance(): void {
    if (this.phase === 'clear') this.doClear();
    else if (this.phase === 'fall') this.doFall();
  }

  private doClear(): void {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) if (this.grid[y][x]?.state === 'stuck') this.grid[y][x] = null;
    for (let x = 0; x < this.width; x++) {
      let seenEmpty = false;
      for (let y = 0; y < this.height; y++) {
        const p = this.grid[y][x];
        if (p === null) seenEmpty = true;
        else if (seenEmpty) p.state = 'floating';
      }
    }
    this.phase = 'fall';
  }

  private doFall(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let x = 0; x < this.width; x++)
        for (let y = 1; y < this.height; y++) {
          const p = this.grid[y][x];
          if (p && p.state === 'floating' && this.grid[y - 1][x] === null) {
            this.grid[y - 1][x] = p;
            this.grid[y][x] = null;
            changed = true;
          }
        }
    }
    for (const row of this.grid) for (const p of row) if (p && p.state === 'floating') p.state = 'normal';

    if (this.markMatches() > 0) {
      this.chain = this.chainActive ? this.chain + 1 : 1;
      this.chainActive = true;
    } else {
      this.chainActive = false;
      // Groups the player matched by hand during the chain start a new chain.
      if (this.hasState('stuck')) {
        this.chainActive = true;
        this.chain = 1;
      }
    }
    this.phase = this.hasState('stuck') ? 'clear' : 'idle';
  }

  /** Drop normal panels that have an empty cell below them. */
  private settleNormal(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let x = 0; x < this.width; x++)
        for (let y = 1; y < this.height; y++) {
          const p = this.grid[y][x];
          if (p && p.state === 'normal' && this.grid[y - 1][x] === null) {
            this.grid[y - 1][x] = p;
            this.grid[y][x] = null;
            changed = true;
          }
        }
    }
  }

  /** Mark runs of 3+ same-colored normal panels as stuck. Returns count. */
  private markMatches(): number {
    const hit = new Set<Panel>();
    const isNormal = (p: Cell | undefined): p is Panel => !!p && p.state === 'normal';
    const scan = (cells: (Cell | undefined)[]) => {
      let start = 0;
      for (let i = 1; i <= cells.length; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        const same = i < cells.length && isNormal(prev) && isNormal(cur) && prev.color === cur.color;
        if (!same) {
          if (i - start >= 3 && isNormal(cells[start])) for (let k = start; k < i; k++) hit.add(cells[k] as Panel);
          start = i;
        }
      }
    };
    for (let y = 0; y < this.height; y++) scan(this.grid[y]);
    for (let x = 0; x < this.width; x++) scan(this.grid.map((row) => row[x]));
    for (const p of hit) p.state = 'stuck';
    return hit.size;
  }

  private hasState(state: PanelState): boolean {
    return this.grid.some((row) => row.some((p) => p?.state === state));
  }

  private find(target: Panel): Cursor {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) if (this.grid[y][x] === target) return { x, y };
    throw new Error('panel not found');
  }
}
