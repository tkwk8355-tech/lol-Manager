// =============================================================
// 사과게임: 서버/화면이 함께 쓰는 값과 규칙
// - 17 × 10 판에 1~9 숫자 사과. 드래그로 묶은 사과의 합이 10이면 사라지고, 사과 1개 = 1점.
// - 판은 서버가 만들고, 끝나면 화면이 보낸 묶음(moves)을 서버가 다시 따라가 점수를 계산한다.
// =============================================================

export const APPLE_COLS = 17;
export const APPLE_ROWS = 10;
export const APPLE_CELLS = APPLE_COLS * APPLE_ROWS;
export const APPLE_TARGET = 10;
export const APPLE_GAME_MS = 120_000; // 2분
export const APPLE_COUNTDOWN_MS = 2_100; // 3 · 2 · 1 (0.7초씩)

/** [위 줄, 왼쪽 칸, 아래 줄, 오른쪽 칸] (양 끝 포함) */
export type AppleMove = [number, number, number, number];

/** 판 만들기: 0 = 빈칸. 전체 합이 10의 배수가 되게 맞춘다 (원작과 같은 방식) */
export const makeAppleBoard = (rand: () => number = Math.random): number[] => {
  const board = Array.from({ length: APPLE_CELLS }, () => 1 + Math.floor(rand() * 9));
  let rem = board.reduce((a, b) => a + b, 0) % APPLE_TARGET;
  while (rem > 0) {
    const i = Math.floor(rand() * APPLE_CELLS);
    if (board[i] > 1) { board[i]--; rem--; }
  }
  return board;
};

/** 범위 안 남은 사과의 합 · 개수 · 위치 */
export const rectInfo = (board: number[], [r1, c1, r2, c2]: AppleMove) => {
  let sum = 0;
  const cells: number[] = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const i = r * APPLE_COLS + c;
      if (board[i] > 0) { sum += board[i]; cells.push(i); }
    }
  }
  return { sum, cells };
};

const isMove = (m: unknown): m is AppleMove =>
  Array.isArray(m) && m.length === 4 && m.every(v => Number.isInteger(v))
  && m[0] >= 0 && m[0] <= m[2] && m[2] < APPLE_ROWS
  && m[1] >= 0 && m[1] <= m[3] && m[3] < APPLE_COLS;

/** 묶음을 순서대로 따라가며 점수 계산. 규칙에 안 맞는 묶음이 하나라도 있으면 null */
export const replayAppleMoves = (start: number[], moves: unknown): number | null => {
  if (!Array.isArray(moves) || moves.length > APPLE_CELLS) return null;
  const board = start.slice();
  let score = 0;
  for (const m of moves) {
    if (!isMove(m)) return null;
    const { sum, cells } = rectInfo(board, m);
    if (sum !== APPLE_TARGET || cells.length === 0) return null;
    for (const i of cells) board[i] = 0;
    score += cells.length;
  }
  return score;
};
