import { describe, expect, it } from 'vitest';
import { Game, HEIGHT, WIDTH } from './game';

function at(rows: string[], x: number, y: number): Game {
  const g = Game.fromRows(rows);
  g.cursor = { x, y };
  return g;
}

describe('random board', () => {
  it('is fully filled with no initial matches', () => {
    for (const colors of [5, 6]) {
      for (let i = 0; i < 50; i++) {
        const g = Game.random(colors);
        expect(g.height).toBe(HEIGHT);
        expect(g.width).toBe(WIDTH);
        for (const row of g.grid)
          for (const p of row) {
            expect(p).not.toBeNull();
            expect(p!.color).toBeLessThan(colors);
          }
        // pressing nothing yet; a no-op swap check: no stuck panels exist
        expect(g.toRows().join('')).toMatch(/^[1-6]+$/);
        for (let y = 0; y < g.height; y++)
          for (let x = 0; x < g.width; x++) {
            const c = g.grid[y][x]!.color;
            if (x >= 2) expect(c === g.grid[y][x - 1]!.color && c === g.grid[y][x - 2]!.color).toBe(false);
            if (y >= 2) expect(c === g.grid[y - 1][x]!.color && c === g.grid[y - 2][x]!.color).toBe(false);
          }
      }
    }
  });
});

describe('swap', () => {
  it('swaps two panels', () => {
    const g = at(['12....'], 0, 0);
    expect(g.swap()).toBe(true);
    expect(g.toRows()).toEqual(['21....']);
  });

  it('makes a matched group stuck and starts chain 1', () => {
    const g = at(['......', '11.1..'], 2, 0);
    expect(g.swap()).toBe(true);
    expect(g.toRows()).toEqual(['......', 'AAA...']);
    expect(g.phase).toBe('clear');
    expect(g.chain).toBe(1);
    expect(g.chainActive).toBe(true);
  });

  it('rejects swaps involving stuck panels', () => {
    const g = at(['AAA2..'], 2, 0);
    expect(g.swap()).toBe(false);
    expect(g.toRows()).toEqual(['AAA2..']);
  });

  it('does nothing for two empty cells', () => {
    const g = at(['......', '1.....'], 1, 1);
    expect(g.swap()).toBe(false);
  });

  it('drops the moved panel and normal panels that lose support immediately', () => {
    const g = at(['.2....', '.1....', '.3....', '.4....'], 0, 2);
    g.swap();
    expect(g.toRows()).toEqual(['......', '.2....', '.3....', '14....']);
  });

  it('rejects moving a panel into the top cell of a hole (floating panel above)', () => {
    const g = at(['b.....', '.4....', '.3....', '.5....'], 0, 2);
    expect(g.isBlockedHole(0, 2)).toBe(true);
    expect(g.swap()).toBe(false);
  });

  it('allows inserting into a hole below the top cell', () => {
    const g = at(['b.....', '.4....', '.3....', '.5....'], 0, 1);
    expect(g.swap()).toBe(true);
    expect(g.toRows()).toEqual(['b.....', '......', '.4....', '35....']);
  });

  it('turns a floating panel moved onto a normal panel into a normal panel', () => {
    const g = at(['b2....', '.1....', '.1....', '.3....'], 0, 3);
    g.swap();
    expect(g.toRows()).toEqual(['.2....', '.1....', '.1....', '23....']);
  });

  it('turns a normal panel moved onto a floating panel into a floating panel', () => {
    const g = at(['b3....', 'c1....', '.4....', '.3....'], 0, 3);
    g.swap();
    expect(g.toRows()).toEqual(['c2....', 'c1....', '.4....', '.3....']);
  });

  it('drops a floating panel moved over an empty cell; floating panels above its old spot stay', () => {
    const g = at(['c.....', 'b.....', '......', '......'], 0, 2);
    g.swap();
    expect(g.toRows()).toEqual(['c.....', '......', '......', '.2....']);
  });

  it('does not detect matches involving floating panels', () => {
    const g = at(['aa.1..', 'bbb2..'], 2, 1);
    g.swap();
    expect(g.toRows()).toEqual(['aaa...', 'bbb2..']);
  });
});

describe('advance', () => {
  it('clear phase removes stuck panels and floats panels above holes', () => {
    const g = Game.fromRows(['2.....', 'A.....', 'A.....', 'A22...']);
    expect(g.phase).toBe('clear');
    g.advance();
    expect(g.toRows()).toEqual(['b.....', '......', '......', '.22...']);
    expect(g.phase).toBe('fall');
  });

  it('fall phase drops floating panels and extends the chain', () => {
    const g = Game.fromRows(['2.....', 'A.....', 'A.....', 'A22...']);
    g.chainActive = true;
    g.chain = 1;
    g.advance();
    g.advance();
    expect(g.toRows()).toEqual(['......', '......', '......', 'BBB...']);
    expect(g.chain).toBe(2);
    expect(g.phase).toBe('clear');
  });

  it('chain ends when nothing matches after falling', () => {
    const g = Game.fromRows(['d.....', '......', '3.....']);
    g.chainActive = true;
    g.chain = 4;
    g.advance();
    expect(g.toRows()).toEqual(['......', '4.....', '3.....']);
    expect(g.chainActive).toBe(false);
    expect(g.chain).toBe(4);
    expect(g.phase).toBe('idle');
  });

  it('hand-made groups left after the chain ends start a new chain at 1', () => {
    const g = Game.fromRows(['d.....', '......', '3AAA..']);
    g.chainActive = true;
    g.chain = 3;
    g.advance();
    expect(g.chain).toBe(1);
    expect(g.chainActive).toBe(true);
    expect(g.phase).toBe('clear');
  });

  it('hand-made match during a chain does not change the count and clears on the next clear phase', () => {
    const g = at(['b.....', '......', '......', '11.1..'], 2, 0);
    g.chainActive = true;
    g.chain = 2;
    g.swap();
    expect(g.chain).toBe(2);
    expect(g.phase).toBe('fall');
    g.advance(); // fall: b lands on stuck panel, no new match
    expect(g.toRows()).toEqual(['......', '......', '2.....', 'AAA...']);
    expect(g.phase).toBe('clear');
    g.advance(); // clear
    expect(g.toRows()).toEqual(['......', '......', 'b.....', '......']);
  });

  it('insertion during the floating phase counts toward the chain', () => {
    // Column 0: a floating 2 above a hole. Drop a 2 into the hole so the landing makes a vertical 3.
    const g = at(['b.....', '......', '.2....', '.3....', '24....'], 0, 2);
    g.chainActive = true;
    g.chain = 1;
    g.swap(); // the 2 at (1,2) drops into column 0 -> lands on the 2 at (0,0)
    expect(g.toRows()).toEqual(['b.....', '......', '......', '23....', '24....']);
    g.advance(); // floating b lands -> vertical 2,2,2
    expect(g.toRows()).toEqual(['......', '......', 'B.....', 'B3....', 'B4....']);
    expect(g.chain).toBe(2);
  });

  it('does nothing when idle', () => {
    const g = Game.fromRows(['12....']);
    g.advance();
    expect(g.toRows()).toEqual(['12....']);
    expect(g.phase).toBe('idle');
  });
});

describe('cursor', () => {
  it('stops at the edges', () => {
    const g = Game.random(5);
    g.cursor = { x: 0, y: 0 };
    g.moveCursor(-1, -1);
    expect(g.cursor).toEqual({ x: 0, y: 0 });
    g.cursor = { x: WIDTH - 2, y: HEIGHT - 1 };
    g.moveCursor(1, 1);
    expect(g.cursor).toEqual({ x: WIDTH - 2, y: HEIGHT - 1 });
  });
});
