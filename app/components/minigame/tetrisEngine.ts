// =============================================================
// 테트리스 규칙 (화면과 무관한 순수 로직)
// - 가이드라인 기준: 10×20 보드(+위쪽 숨은 4줄), 7-bag, SRS 회전/벽차기
// - y는 아래로 갈수록 커진다. SRS 표는 y가 위로 커지는 기준이라 적용할 때 뒤집는다.
// =============================================================

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 4;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export const PIECE_TYPES: readonly PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export const PIECE_COLORS: Record<PieceType, string> = {
  I: "#2fd0f0", O: "#f7d43a", T: "#b45ad8", S: "#4cc95a", Z: "#f0455a", J: "#4a72e8", L: "#f5913a",
};

export type Cell = PieceType | null;
export type Board = Cell[][];
export type Rotation = 0 | 1 | 2 | 3;
export type Piece = { type: PieceType; rot: Rotation; x: number; y: number };
type Pt = readonly [number, number];

// 회전 0 상태 (상자 크기 n 안에서의 칸 좌표)
const BASE: Record<PieceType, { n: number; cells: Pt[] }> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

const rotateCW = (cells: Pt[], n: number): Pt[] => cells.map(([x, y]) => [n - 1 - y, x] as const);

export const SHAPES: Record<PieceType, Pt[][]> = Object.fromEntries(
  PIECE_TYPES.map(t => {
    const { n, cells } = BASE[t];
    const states: Pt[][] = [cells];
    for (let r = 1; r < 4; r++) states.push(t === "O" ? cells : rotateCW(states[r - 1], n));
    return [t, states];
  }),
) as Record<PieceType, Pt[][]>;

// SRS 벽차기 (x, y는 위쪽이 +)
const KICKS_JLSTZ: Record<string, Pt[]> = {
  "01": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "10": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "12": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "21": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "23": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "32": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "30": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "03": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, Pt[]> = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "10": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "21": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "32": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "30": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "03": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICKS_180: Pt[] = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];

export const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));

export const cellsOf = (p: Piece): Pt[] => SHAPES[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy] as const);

export const collides = (board: Board, p: Piece) =>
  cellsOf(p).some(([x, y]) => x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x] !== null);

/** 새 블록. 보드 바로 위(숨은 줄)에 나온다. */
export const spawnPiece = (type: PieceType): Piece => ({ type, rot: 0, x: type === "O" ? 4 : 3, y: HIDDEN_ROWS - 2 });

/** 회전 (1 = 시계, -1 = 반시계, 2 = 180도). 벽차기까지 실패하면 null */
export const rotatePiece = (board: Board, p: Piece, dir: 1 | -1 | 2): Piece | null => {
  const to = ((p.rot + (dir === 2 ? 2 : dir) + 4) % 4) as Rotation;
  const kicks = dir === 2 ? KICKS_180 : (p.type === "I" ? KICKS_I : KICKS_JLSTZ)[`${p.rot}${to}`];
  for (const [kx, ky] of kicks) {
    const next: Piece = { ...p, rot: to, x: p.x + kx, y: p.y - ky };
    if (!collides(board, next)) return next;
  }
  return null;
};

export const dropDistance = (board: Board, p: Piece) => {
  let d = 0;
  while (!collides(board, { ...p, y: p.y + d + 1 })) d++;
  return d;
};

/** 블록을 보드에 굳히고 꽉 찬 줄을 지운다. lockOut = 블록 전체가 보이는 영역 밖에서 굳음(게임 오버) */
export const lockPiece = (board: Board, p: Piece) => {
  const next = board.map(row => row.slice());
  let lockOut = true;
  for (const [x, y] of cellsOf(p)) {
    next[y][x] = p.type;
    if (y >= HIDDEN_ROWS) lockOut = false;
  }
  const cleared: number[] = [];
  next.forEach((row, y) => { if (row.every(c => c !== null)) cleared.push(y); });
  const kept = next.filter((_, y) => !cleared.includes(y));
  while (kept.length < ROWS) kept.unshift(Array<Cell>(COLS).fill(null));
  return { board: kept, cleared, lockOut };
};

/** 7-bag: 7종류를 한 묶음씩 섞어서 순서대로 낸다 */
export class PieceBag {
  private queue: PieceType[] = [];

  private refill() {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }

  next(): PieceType {
    if (this.queue.length <= 7) this.refill();
    return this.queue.shift()!;
  }

  peek(count: number): PieceType[] {
    while (this.queue.length < count) this.refill();
    return this.queue.slice(0, count);
  }
}
