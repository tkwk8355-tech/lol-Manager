"use client";

// =============================================================
// 미니게임: 테트리스 40줄 (스프린트)
// - 40줄을 지우는 데 걸린 시간으로 겨룬다. 랭킹은 빠른 순.
// - 규칙은 tetrisEngine.ts, 여기서는 입력(DAS/ARR) · 중력 · 락 딜레이 · 그리기를 맡는다.
// - 화면 틀(카드, 랭킹 패널)은 에임 연습과 같은 스타일을 쓴다.
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import ui from "./AimGame.module.css";
import styles from "./TetrisGame.module.css";
import {
  COLS, HIDDEN_ROWS, PIECE_COLORS, ROWS, SHAPES, VISIBLE_ROWS,
  PieceBag, cellsOf, collides, dropDistance, emptyBoard, lockPiece, rotatePiece, spawnPiece,
  type Board, type Piece, type PieceType,
} from "./tetrisEngine";
import { SPRINT_LINES, TETRIS_COUNTDOWN_MS } from "@/lib/tetrisShared";
import { setSoundEnabled, sfx, unlockAudio } from "./tetrisSound";

// ------------------------------ 화면 크기 ------------------------------
const CELL = 28;
const BX = 160; // 보드 왼쪽
const BY = 64; // 보드 위쪽 (위로 숨은 줄 2칸이 살짝 보이게)
const BW = COLS * CELL;
const BH = VISIBLE_ROWS * CELL;
const W = 600;
const H = BY + BH + 24;
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

// ------------------------------ 조작 ------------------------------
const GRAVITY_MS = 1000;
const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const NEXT_COUNT = 5;
const SETTINGS_KEY = "tetris-handling-v1";
const SOUND_KEY = "tetris-sound";
const RESTART_HOLD_MS = 1000; // 게임 중 R을 이만큼 꾹 눌러야 재시작
type Handling = { das: number; arr: number; sdf: number }; // sdf = 소프트드롭 한 칸당 ms (0 = 바로 바닥)
const DEFAULT_HANDLING: Handling = { das: 133, arr: 10, sdf: 20 };

type Phase = "ready" | "countdown" | "playing" | "result" | "over";
type Fx =
  | { kind: "clear"; row: number; at: number }
  | { kind: "trail"; cols: number[]; fromY: number; toY: number; color: string; at: number };

type Game = {
  board: Board;
  active: Piece | null;
  hold: PieceType | null;
  holdUsed: boolean;
  bag: PieceBag;
  lines: number;
  pieces: number;
  startAt: number;
  lastGravity: number;
  lockStart: number | null;
  lockResets: number;
  lowestY: number;
  softDrop: boolean;
  left: boolean;
  right: boolean;
  dir: -1 | 0 | 1;
  dasStart: number;
  charged: boolean;
  lastArr: number;
  fx: Fx[];
};

type Result = { timeMs: number; pieces: number; best: number; isNewBest: boolean; weekRank: number | null };
type RankRow = { userId: number; nickname: string; timeMs: number; pieces: number };
type RankRes = { ranking: RankRow[]; me: (RankRow & { rank: number }) | null; total: number };

export const formatTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s.replace(/^0(?=\d\.)/, "");
};

const newGame = (): Game => ({
  board: emptyBoard(), active: null, hold: null, holdUsed: false, bag: new PieceBag(),
  lines: 0, pieces: 0, startAt: 0, lastGravity: 0, lockStart: null, lockResets: 0, lowestY: 0,
  softDrop: false, left: false, right: false, dir: 0, dasStart: 0, charged: false, lastArr: 0, fx: [],
});

// ------------------------------ 그리기 도우미 ------------------------------

const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * p);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1) => {
  const pad = Math.max(1, size * 0.05);
  const s = size - pad * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(x, y, x, y + size);
  g.addColorStop(0, shade(color, 0.28));
  g.addColorStop(1, shade(color, -0.22));
  roundRect(ctx, x + pad, y + pad, s, s, size * 0.16);
  ctx.fillStyle = g;
  ctx.fill();
  // 윗면 하이라이트
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  roundRect(ctx, x + pad + s * 0.12, y + pad + s * 0.1, s * 0.76, s * 0.2, s * 0.1);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 1;
  roundRect(ctx, x + pad + 0.5, y + pad + 0.5, s - 1, s - 1, size * 0.16);
  ctx.stroke();
  ctx.restore();
};

/** 미리보기 칸 안에 블록 하나를 가운데 맞춰 그린다 */
const drawMini = (ctx: CanvasRenderingContext2D, type: PieceType, cx: number, cy: number, size: number, dim = false) => {
  const cells = SHAPES[type][0];
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
  const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  const ox = cx - w / 2 - Math.min(...xs) * size;
  const oy = cy - h / 2 - Math.min(...ys) * size;
  for (const [x, y] of cells) drawBlock(ctx, ox + x * size, oy + y * size, size, dim ? "#5b6070" : PIECE_COLORS[type]);
};

const panel = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) => {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = "rgba(10,13,20,0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `800 11px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 12, y + 10);
};

// ------------------------------ 메인 ------------------------------

export default function TetrisGame() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rank, setRank] = useState<RankRes | null>(null);
  const [handling, setHandling] = useState<Handling>(DEFAULT_HANDLING);
  const [showSettings, setShowSettings] = useState(false);
  const [sound, setSound] = useState(true);
  const lastCountRef = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(newGame());
  const phaseRef = useRef<Phase>("ready");
  const phaseAtRef = useRef(0);
  const finalTimeRef = useRef(0);
  const handlingRef = useRef<Handling>(DEFAULT_HANDLING);
  const periodRef = useRef<"week" | "all">("week");
  const bgRef = useRef<{ scale: number; canvas: HTMLCanvasElement } | null>(null);
  const restartHoldRef = useRef<number | null>(null); // R을 누르기 시작한 시각

  const goPhase = (p: Phase) => { phaseRef.current = p; phaseAtRef.current = performance.now(); setPhase(p); };

  // ---------- 조작 설정 ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = { ...DEFAULT_HANDLING, ...JSON.parse(raw) } as Handling;
        setHandling(s); handlingRef.current = s;
      }
    } catch { /* 무시 */ }
  }, []);
  useEffect(() => {
    try {
      const on = localStorage.getItem(SOUND_KEY) !== "0";
      setSound(on); setSoundEnabled(on);
    } catch { /* 무시 */ }
  }, []);
  const toggleSound = () => {
    setSound(prev => {
      const on = !prev;
      setSoundEnabled(on);
      try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch { /* 무시 */ }
      return on;
    });
  };

  const updateHandling = (key: keyof Handling, value: number) => {
    setHandling(prev => {
      const next = { ...prev, [key]: Math.max(0, Math.min(500, Math.round(value) || 0)) };
      handlingRef.current = next;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  };

  // ---------- 랭킹 ----------
  const loadRank = useCallback(async (p: "week" | "all") => {
    const res = await fetch(`/api/minigame/tetris?period=${p}`).catch(() => null);
    if (res?.ok) setRank(await res.json());
  }, []);
  useEffect(() => { periodRef.current = period; loadRank(period); }, [period, loadRank]);

  // ---------- 게임 진행 ----------
  const isGrounded = (g: Game) => !!g.active && collides(g.board, { ...g.active, y: g.active.y + 1 });

  const spawn = (g: Game, type: PieceType, now: number) => {
    const p = spawnPiece(type);
    if (collides(g.board, p)) { g.active = null; gameOver(); return; }
    if (!collides(g.board, { ...p, y: p.y + 1 })) p.y += 1; // 나오자마자 한 칸 내려온다
    g.active = p;
    g.lastGravity = now;
    g.lockStart = null;
    g.lockResets = 0;
    g.lowestY = p.y;
  };

  const spawnNext = (g: Game, now: number) => { spawn(g, g.bag.next(), now); g.holdUsed = false; };

  // 움직이거나 돌린 뒤: 바닥에 붙어 있으면 락 타이머를 다시 시작 (최대 15번)
  const afterMove = (g: Game, now: number) => {
    if (!g.active) return;
    if (g.active.y > g.lowestY) { g.lowestY = g.active.y; g.lockResets = 0; }
    if (isGrounded(g)) {
      if (g.lockStart !== null && g.lockResets < MAX_LOCK_RESETS) { g.lockStart = now; g.lockResets++; }
    } else {
      g.lockStart = null;
    }
  };

  const shift = (g: Game, dx: number, now: number) => {
    if (!g.active) return false;
    const next = { ...g.active, x: g.active.x + dx };
    if (collides(g.board, next)) return false;
    g.active = next;
    afterMove(g, now);
    sfx.move();
    return true;
  };

  const rotate = (g: Game, dir: 1 | -1 | 2, now: number) => {
    if (!g.active) return;
    const next = rotatePiece(g.board, g.active, dir);
    if (!next) return;
    g.active = next;
    afterMove(g, now);
    sfx.rotate();
  };

  const lock = (g: Game, now: number, hard = false) => {
    if (!g.active) return;
    const { board, cleared, lockOut } = lockPiece(g.board, g.active);
    g.board = board;
    g.active = null;
    g.pieces++;
    g.lines += cleared.length;
    for (const row of cleared) g.fx.push({ kind: "clear", row, at: now });
    if (lockOut) { gameOver(); return; }
    if (g.lines >= SPRINT_LINES) { finish(now); return; }
    if (cleared.length > 0) sfx.clear(cleared.length);
    else if (!hard) sfx.lock();
    spawnNext(g, now);
  };

  const hardDrop = (g: Game, now: number) => {
    if (!g.active) return;
    const d = dropDistance(g.board, g.active);
    if (d > 0) {
      const cols = [...new Set(cellsOf(g.active).map(c => c[0]))];
      g.fx.push({ kind: "trail", cols, fromY: g.active.y, toY: g.active.y + d, color: PIECE_COLORS[g.active.type], at: now });
    }
    g.active = { ...g.active, y: g.active.y + d };
    sfx.hardDrop();
    lock(g, now, true);
  };

  const holdPiece = (g: Game, now: number) => {
    if (!g.active || g.holdUsed) return;
    const current = g.active.type;
    if (g.hold) spawn(g, g.hold, now); else spawn(g, g.bag.next(), now);
    g.hold = current;
    g.holdUsed = true;
    sfx.hold();
  };

  // 매 프레임: 좌우 반복 이동(DAS/ARR) · 중력 · 락 딜레이
  const step = (g: Game, now: number) => {
    if (!g.active) return;
    const { das, arr, sdf } = handlingRef.current;

    if (g.dir !== 0 && now - g.dasStart >= das) {
      if (!g.charged) { g.charged = true; g.lastArr = g.dasStart + das - arr; }
      if (arr === 0) { while (shift(g, g.dir, now)); }
      else {
        while (now - g.lastArr >= arr) {
          g.lastArr += arr;
          if (!shift(g, g.dir, now)) { g.lastArr = now; break; }
        }
      }
    }

    const interval = g.softDrop ? sdf : GRAVITY_MS;
    if (g.softDrop && sdf === 0) {
      const d = dropDistance(g.board, g.active);
      if (d > 0) { g.active = { ...g.active, y: g.active.y + d }; afterMove(g, now); }
      g.lastGravity = now;
    } else {
      let guard = 0;
      while (now - g.lastGravity >= interval && guard++ < ROWS) {
        g.lastGravity += interval;
        if (isGrounded(g)) { g.lastGravity = now; break; }
        g.active = { ...g.active!, y: g.active!.y + 1 };
        afterMove(g, now);
      }
    }

    if (isGrounded(g)) {
      g.lockStart ??= now;
      if (now - g.lockStart >= LOCK_DELAY_MS) lock(g, now);
    } else {
      g.lockStart = null;
    }
  };

  // ---------- 시작 / 끝 ----------
  const start = async () => {
    unlockAudio(); // 클릭/키 입력 중에 소리를 켜 둬야 브라우저가 막지 않는다
    lastCountRef.current = 0;
    restartHoldRef.current = null;
    canvasRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setError(""); setResult(null);
    const res = await fetch("/api/minigame/tetris", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }),
    }).catch(() => null);
    if (!res?.ok) { setError("시작하지 못했어요. 로그인 상태를 확인해 주세요."); return; }
    const g = newGame();
    // 카운트다운 중에 눌러 둔 방향키는 유지한다
    g.left = gameRef.current.left; g.right = gameRef.current.right;
    gameRef.current = g;
    goPhase("countdown");
  };

  const beginPlay = (now: number) => {
    const g = gameRef.current;
    g.startAt = now;
    g.dir = g.right ? 1 : g.left ? -1 : 0;
    g.dasStart = now; g.charged = false;
    goPhase("playing");
    sfx.go();
    spawnNext(g, now);
  };

  const gameOver = () => { goPhase("over"); sfx.gameOver(); };

  const finish = async (now: number) => {
    const g = gameRef.current;
    const timeMs = Math.round(now - g.startAt);
    finalTimeRef.current = timeMs;
    goPhase("result");
    sfx.finish();
    const res = await fetch("/api/minigame/tetris", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", timeMs, pieces: g.pieces }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok || !json) { setError(json?.error ?? "기록 저장에 실패했어요."); return; }
    setResult(json);
    loadRank(periodRef.current);
  };

  // ---------- 키보드 ----------
  useEffect(() => {
    const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"]); // 페이지 스크롤 막기
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const ph = phaseRef.current;
      const g = gameRef.current;
      const now = performance.now();
      if (GAME_KEYS.has(e.code) && ph !== "ready") e.preventDefault();

      if (e.code === "KeyR") {
        e.preventDefault();
        if (e.repeat) return;
        // 게임 중엔 실수로 누르지 않게 꾹 눌러야 재시작, 끝난 화면에선 바로 재시작
        if (ph === "playing" || ph === "countdown") restartHoldRef.current = now;
        else start();
        return;
      }
      if (e.code === "Escape" && (ph === "playing" || ph === "countdown")) { goPhase("ready"); return; }

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (e.repeat) return;
        const dir = e.code === "ArrowLeft" ? -1 : 1;
        if (dir === -1) g.left = true; else g.right = true;
        if (ph !== "playing") return;
        g.dir = dir; g.dasStart = now; g.charged = false;
        shift(g, dir, now);
        return;
      }
      if (ph !== "playing" || e.repeat) return;
      switch (e.code) {
        case "ArrowDown": g.softDrop = true; g.lastGravity = now - handlingRef.current.sdf; break;
        case "Space": hardDrop(g, now); break;
        case "KeyX": rotate(g, 1, now); break; // 시계 방향
        case "KeyZ": rotate(g, -1, now); break; // 반시계 방향
        case "KeyC": holdPiece(g, now); break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const g = gameRef.current;
      const now = performance.now();
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (e.code === "ArrowLeft") g.left = false; else g.right = false;
        const nextDir = g.left ? -1 : g.right ? 1 : 0;
        if (nextDir !== g.dir) { g.dir = nextDir; g.dasStart = now; g.charged = false; }
      }
      if (e.code === "ArrowDown") { g.softDrop = false; g.lastGravity = now; }
      if (e.code === "KeyR") restartHoldRef.current = null;
    };
    const blur = () => { const g = gameRef.current; g.left = g.right = g.softDrop = false; g.dir = 0; restartHoldRef.current = null; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 루프 ----------
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const ph = phaseRef.current;
      const holdStart = restartHoldRef.current;
      if (holdStart !== null && (ph === "playing" || ph === "countdown") && performance.now() - holdStart >= RESTART_HOLD_MS) {
        restartHoldRef.current = null;
        start();
      }
      if (ph === "countdown") {
        const left = TETRIS_COUNTDOWN_MS - (now - phaseAtRef.current);
        const n = Math.min(3, Math.ceil(left / (TETRIS_COUNTDOWN_MS / 3))); // 첫 프레임 시각이 살짝 앞설 수 있음
        if (n > 0 && n !== lastCountRef.current) { lastCountRef.current = n; sfx.count(); }
      }
      if (ph === "countdown" && now - phaseAtRef.current >= TETRIS_COUNTDOWN_MS) beginPlay(now);
      else if (ph === "playing") step(gameRef.current, now);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 그리기 ----------
  const buildBackground = (scale: number) => {
    const c = document.createElement("canvas");
    c.width = Math.round(W * scale); c.height = Math.round(H * scale);
    const g = c.getContext("2d")!;
    g.scale(c.width / W, c.height / H);
    const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.8);
    bg.addColorStop(0, "#1d2436"); bg.addColorStop(1, "#090c13");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 보드
    g.save();
    g.shadowColor = "rgba(150,120,255,0.45)";
    g.shadowBlur = 24;
    g.fillStyle = "#070a10";
    g.fillRect(BX - 3, BY - 3, BW + 6, BH + 6);
    g.restore();
    g.strokeStyle = "rgba(170,150,255,0.45)";
    g.lineWidth = 2;
    g.strokeRect(BX - 2, BY - 2, BW + 4, BH + 4);
    g.strokeStyle = "rgba(255,255,255,0.045)";
    g.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(BX + x * CELL + 0.5, BY); g.lineTo(BX + x * CELL + 0.5, BY + BH); g.stroke(); }
    for (let y = 1; y < VISIBLE_ROWS; y++) { g.beginPath(); g.moveTo(BX, BY + y * CELL + 0.5); g.lineTo(BX + BW, BY + y * CELL + 0.5); g.stroke(); }
    return c;
  };

  const rowY = (row: number) => BY + (row - HIDDEN_ROWS) * CELL;

  const draw = (now: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // 화면에 보이는 크기 × 레티나 배율로 그려서 크게 띄워도 흐려지지 않게
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.max(0.5, (canvas.clientWidth || W) / W) * dpr;
    const pw = Math.round(W * scale);
    if (canvas.width !== pw) { canvas.width = pw; canvas.height = Math.round(H * scale); }
    if (!bgRef.current || bgRef.current.scale !== scale) bgRef.current = { scale, canvas: buildBackground(scale) };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgRef.current.canvas, 0, 0);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

    const g = gameRef.current;
    const ph = phaseRef.current;

    // 쌓인 블록 (위 숨은 줄 2칸까지 보여줌)
    ctx.save();
    ctx.beginPath(); ctx.rect(BX, BY - CELL * 2, BW, BH + CELL * 2); ctx.clip();
    for (let row = HIDDEN_ROWS - 2; row < ROWS; row++) {
      for (let x = 0; x < COLS; x++) {
        const c = g.board[row][x];
        if (c) drawBlock(ctx, BX + x * CELL, rowY(row), CELL, ph === "over" ? "#5b6070" : PIECE_COLORS[c], row < HIDDEN_ROWS ? 0.5 : 1);
      }
    }

    // 고스트 + 현재 블록
    if (g.active && ph === "playing") {
      const ghostY = g.active.y + dropDistance(g.board, g.active);
      const color = PIECE_COLORS[g.active.type];
      for (const [x, y] of cellsOf({ ...g.active, y: ghostY })) {
        const px = BX + x * CELL, py = rowY(y);
        ctx.fillStyle = `${color}22`;
        roundRect(ctx, px + 2, py + 2, CELL - 4, CELL - 4, 4); ctx.fill();
        ctx.strokeStyle = `${color}99`; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // 바닥에 닿아 굳기 직전이면 살짝 깜빡
      const lockK = g.lockStart !== null ? Math.min(1, (now - g.lockStart) / LOCK_DELAY_MS) : 0;
      for (const [x, y] of cellsOf(g.active)) drawBlock(ctx, BX + x * CELL, rowY(y), CELL, color, 1 - lockK * 0.35);
    }

    // 효과
    g.fx = g.fx.filter(f => {
      const age = now - f.at;
      if (f.kind === "clear") {
        if (age > 280) return false;
        const k = age / 280;
        const y = rowY(f.row);
        ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
        ctx.fillRect(BX - k * 20, y + CELL / 2 - (CELL / 2) * (1 - k), BW + k * 40, CELL * (1 - k));
      } else {
        if (age > 160) return false;
        const k = age / 160;
        for (const x of f.cols) {
          const top = rowY(f.fromY), bottom = rowY(f.toY);
          const tg = ctx.createLinearGradient(0, top, 0, bottom);
          tg.addColorStop(0, `${f.color}00`); tg.addColorStop(1, f.color);
          ctx.globalAlpha = 0.35 * (1 - k);
          ctx.fillStyle = tg;
          ctx.fillRect(BX + x * CELL + 4, top, CELL - 8, bottom - top);
          ctx.globalAlpha = 1;
        }
      }
      return true;
    });
    ctx.restore();

    // HOLD
    panel(ctx, 20, BY, 124, 96, "HOLD");
    if (g.hold) drawMini(ctx, g.hold, 82, BY + 56, 20, g.holdUsed);

    // NEXT
    panel(ctx, BX + BW + 16, BY, 124, 340, "NEXT");
    const next = ph === "playing" || ph === "result" || ph === "over" ? g.bag.peek(NEXT_COUNT) : [];
    next.forEach((t, i) => {
      const size = i === 0 ? 20 : 16;
      const cy = i === 0 ? BY + 62 : BY + 62 + 36 + i * 56;
      drawMini(ctx, t, BX + BW + 16 + 62, cy, size);
    });

    // 기록
    const elapsed = ph === "playing" ? now - g.startAt : ph === "result" ? finalTimeRef.current : 0;
    const left = Math.max(0, SPRINT_LINES - g.lines);
    panel(ctx, 20, BY + 112, 124, 260, "남은 줄");
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `900 46px ${FONT}`;
    const lg = ctx.createLinearGradient(0, BY + 140, 0, BY + 180);
    lg.addColorStop(0, "#ffffff"); lg.addColorStop(1, left <= 10 ? "#ffd166" : "#b7a6ff");
    ctx.fillStyle = lg;
    ctx.fillText(String(left), 32, BY + 178);
    // 진행 막대
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, 32, BY + 190, 100, 6, 3); ctx.fill();
    ctx.fillStyle = "#b7a6ff";
    roundRect(ctx, 32, BY + 190, 100 * Math.min(1, g.lines / SPRINT_LINES), 6, 3); ctx.fill();

    const stat = (label: string, value: string, y: number) => {
      ctx.font = `800 11px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(label, 32, y);
      ctx.font = `800 20px ${FONT}`; ctx.fillStyle = "#ffffff";
      ctx.fillText(value, 32, y + 24);
    };
    const secs = elapsed / 1000;
    stat("시간", formatTime(Math.round(elapsed)), BY + 228);
    stat("PPS", secs > 0.5 ? (g.pieces / secs).toFixed(2) : "0.00", BY + 284);
    ctx.font = `600 11px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(`블록 ${g.pieces}개`, 32, BY + 352);

    // 카운트다운
    if (ph === "countdown") {
      const msLeft = Math.max(0, TETRIS_COUNTDOWN_MS - (now - phaseAtRef.current));
      const per = TETRIS_COUNTDOWN_MS / 3;
      const n = Math.max(1, Math.ceil(msLeft / per));
      const inStep = (msLeft % per) / per;
      ctx.fillStyle = "rgba(5,7,12,0.5)"; ctx.fillRect(BX, BY, BW, BH);
      ctx.save();
      ctx.translate(BX + BW / 2, BY + BH / 2);
      const s = 1 + Math.pow(inStep, 3) * 0.6;
      ctx.scale(s, s);
      ctx.font = `900 110px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(183,166,255,0.9)"; ctx.shadowBlur = 28;
      const cg = ctx.createLinearGradient(0, -50, 0, 50);
      cg.addColorStop(0, "#ffffff"); cg.addColorStop(1, "#b7a6ff");
      ctx.fillStyle = cg;
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }
    // 시작 직후 GO!
    if (ph === "playing" && now - g.startAt < 500) {
      const k = (now - g.startAt) / 500;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.font = `900 ${80 + k * 30}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(93,255,156,0.9)"; ctx.shadowBlur = 24;
      ctx.fillStyle = "#5dff9c";
      ctx.fillText("GO!", BX + BW / 2, BY + BH / 2);
      ctx.restore();
    }
    // R 꾹 누르는 중: 재시작 진행 표시
    const holdStart = restartHoldRef.current;
    if (holdStart !== null && (ph === "playing" || ph === "countdown")) {
      const k = Math.min(1, (performance.now() - holdStart) / RESTART_HOLD_MS);
      const pw2 = 200, ph2 = 54, px = BX + BW / 2 - pw2 / 2, py = BY + BH / 2 - ph2 / 2;
      ctx.save();
      ctx.fillStyle = `rgba(5,7,12,${0.35 * k})`;
      ctx.fillRect(BX, BY, BW, BH);
      roundRect(ctx, px, py, pw2, ph2, 14);
      ctx.fillStyle = "rgba(10,13,20,0.9)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(k >= 1 ? "다시 시작!" : "R 계속 누르면 다시 시작", px + pw2 / 2, py + 20);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, px + 16, py + 34, pw2 - 32, 6, 3); ctx.fill();
      ctx.fillStyle = "#ffd166";
      roundRect(ctx, px + 16, py + 34, Math.max(6, (pw2 - 32) * k), 6, 3); ctx.fill();
      ctx.restore();
    }
  };

  // ---------- 화면 ----------
  const pps = result ? (result.pieces / (result.timeMs / 1000)).toFixed(2) : "";

  return (
    <div className={ui.page}>
      <div className={ui.head}>
        <div>
          <h2 className={ui.title}>🧱 테트리스 40줄</h2>
          <p className={ui.sub}>40줄을 최대한 빨리 지우세요. 시간이 짧을수록 순위가 올라가요.</p>
        </div>
        <div className={styles.headBtns}>
          <button className={ui.soundBtn} onClick={toggleSound} aria-label={sound ? "소리 끄기" : "소리 켜기"}>
            {sound ? "🔊 소리 켜짐" : "🔇 소리 꺼짐"}
          </button>
          <button className={ui.soundBtn} onClick={() => setShowSettings(v => !v)} aria-expanded={showSettings}>
            ⚙️ 조작 설정
          </button>
        </div>
      </div>

      {showSettings && (
        <div className={`ui-card ${styles.settings}`}>
          <label>
            <span>DAS <small>꾹 누르고 반복 시작까지</small></span>
            <input type="number" min={0} max={500} value={handling.das} onChange={e => updateHandling("das", Number(e.target.value))} />
            <em>ms</em>
          </label>
          <label>
            <span>ARR <small>반복 이동 간격 (0 = 벽까지 바로)</small></span>
            <input type="number" min={0} max={500} value={handling.arr} onChange={e => updateHandling("arr", Number(e.target.value))} />
            <em>ms</em>
          </label>
          <label>
            <span>소프트드롭 <small>한 칸 내려가는 간격 (0 = 바로 바닥)</small></span>
            <input type="number" min={0} max={500} value={handling.sdf} onChange={e => updateHandling("sdf", Number(e.target.value))} />
            <em>ms</em>
          </label>
          <button className="btn-secondary" onClick={() => { updateHandling("das", DEFAULT_HANDLING.das); updateHandling("arr", DEFAULT_HANDLING.arr); updateHandling("sdf", DEFAULT_HANDLING.sdf); }}>기본값</button>
        </div>
      )}

      <div className={ui.layout}>
        <div className={ui.stageCol}>
          <div className={`${ui.stage} ${styles.stage}`}>
            <canvas ref={canvasRef} className={styles.canvas} onContextMenu={e => e.preventDefault()} />

            {phase === "ready" && (
              <div className={ui.overlay}>
                <div className={ui.card}>
                  <div className={ui.bigIcon}>🧱</div>
                  <h3>40줄 스프린트</h3>
                  <div className={styles.keys}>
                    <span><kbd>←</kbd><kbd>→</kbd> 이동</span>
                    <span><kbd>↓</kbd> 소프트드롭</span>
                    <span><kbd>Space</kbd> 하드드롭</span>
                    <span><kbd>Z</kbd> 왼쪽 회전</span>
                    <span><kbd>X</kbd> 오른쪽 회전</span>
                    <span><kbd>C</kbd> 홀드</span>
                    <span><kbd>R</kbd> 꾹(1초) 재시작</span>
                  </div>
                  <button className={`btn-primary ${ui.startBtn}`} onClick={start}>시작하기</button>
                  <p className={styles.hint}>키보드가 필요해요 · 게임 중 <kbd>R</kbd>을 1초 누르면 다시 시작</p>
                </div>
              </div>
            )}

            {phase === "over" && (
              <div className={ui.overlay}>
                <div className={ui.card}>
                  <div className={ui.bigIcon}>💀</div>
                  <h3>게임 오버</h3>
                  <p className={styles.hint}>블록이 천장까지 쌓였어요. ({gameRef.current.lines}/{SPRINT_LINES}줄)</p>
                  <button className={`btn-primary ${ui.startBtn}`} onClick={start}>다시 하기 (R)</button>
                </div>
              </div>
            )}

            {phase === "result" && (
              <div className={ui.overlay}>
                <div className={ui.card}>
                  {result ? (
                    <>
                      {result.isNewBest && <div className={ui.newBest}>🎉 개인 신기록!</div>}
                      <div className={ui.scoreLabel}>40줄 기록</div>
                      <div className={`${ui.score} ${styles.time}`}>{formatTime(result.timeMs)}</div>
                      <div className={ui.stats}>
                        <div><b>{result.pieces}</b><span>블록</span></div>
                        <div><b>{pps}</b><span>PPS</span></div>
                        <div><b>{formatTime(result.best)}</b><span>내 최고</span></div>
                      </div>
                      <div className={ui.meta}>{result.weekRank ? `이번 주 ${result.weekRank}위` : " "}</div>
                      <button className={`btn-primary ${ui.startBtn}`} onClick={start}>다시 하기 (R)</button>
                    </>
                  ) : error ? (
                    <>
                      <p className={ui.errorText}>{error}</p>
                      <button className={`btn-primary ${ui.startBtn}`} onClick={start}>다시 하기 (R)</button>
                    </>
                  ) : (
                    <div className={ui.saving}>기록 저장 중…</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {error && phase === "ready" && <div className={ui.error}>{error}</div>}
        </div>

        <aside className={`ui-card ${ui.rank}`}>
          <div className={ui.rankHead}>
            <b>🏆 클랜 랭킹</b>
            <div className={ui.tabs}>
              <button className={period === "week" ? ui.on : ""} onClick={() => setPeriod("week")}>이번 주</button>
              <button className={period === "all" ? ui.on : ""} onClick={() => setPeriod("all")}>전체</button>
            </div>
          </div>
          {!rank ? (
            <p className={ui.empty}>불러오는 중…</p>
          ) : rank.ranking.length === 0 ? (
            <p className={ui.empty}>{period === "week" ? "이번 주 기록이 아직 없어요. 1등을 차지해 보세요!" : "아직 기록이 없어요."}</p>
          ) : (
            <ol className={ui.rankList}>
              {rank.ranking.map((r, i) => (
                <li key={r.userId} className={r.userId === user?.userId ? ui.mine : ""}>
                  <span className={ui.pos}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                  <span className={ui.name}>{r.nickname}</span>
                  <span className={ui.pts}>{formatTime(r.timeMs)}</span>
                </li>
              ))}
            </ol>
          )}
          {rank?.me && !rank.ranking.some(r => r.userId === rank.me!.userId) && (
            <div className={ui.myRow}>
              <span className={ui.pos}>{rank.me.rank}</span>
              <span className={ui.name}>{rank.me.nickname} (나)</span>
              <span className={ui.pts}>{formatTime(rank.me.timeMs)}</span>
            </div>
          )}
          {rank && rank.total > 0 && <p className={ui.rankFoot}>참가 {rank.total}명 · 1인 최고 기록 기준</p>}
        </aside>
      </div>
    </div>
  );
}
