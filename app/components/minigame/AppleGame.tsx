"use client";

// =============================================================
// 미니게임: 사과게임
// - 마우스로 드래그해 사각형을 그리면, 안에 들어온 사과(가운데 기준)의 숫자 합이 10일 때 사라진다.
// - 사과 1개 = 1점, 제한 시간 2분. 랭킹은 1인 최고점.
// - 판은 서버가 만들어 주고, 끝나면 묶은 순서(moves)를 보내 서버가 점수를 다시 계산한다.
// - 화면 틀(카드, 랭킹 패널)은 에임 연습 · 테트리스와 같은 스타일을 쓴다.
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import ui from "./AimGame.module.css";
import styles from "./AppleGame.module.css";
import {
  APPLE_COLS as COLS, APPLE_ROWS as ROWS, APPLE_COUNTDOWN_MS, APPLE_GAME_MS, APPLE_TARGET,
  makeAppleBoard, rectInfo, type AppleMove,
} from "@/lib/appleGameShared";
import { setSoundEnabled, sfx, unlockAudio } from "./tetrisSound";

// ------------------------------ 화면 크기 ------------------------------
const CELL = 48;
const BX = 24; // 판 왼쪽
const BY = 64; // 판 위쪽 (위는 점수/시간 표시줄)
const BW = COLS * CELL;
const BH = ROWS * CELL;
const TX = BX + BW + 22; // 남은 시간 막대
const TW = 14;
const W = TX + TW + 24; // 900
const H = BY + BH + 24; // 568
const R = CELL * 0.42; // 사과 반지름
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const SOUND_KEY = "apple-sound";

type Phase = "ready" | "countdown" | "playing" | "result";
type Drag = { x0: number; y0: number; x1: number; y1: number };
type Fall = { x: number; y: number; vx: number; vy: number; spin: number; value: number; at: number };
type Pop = { x: number; y: number; text: string; at: number };
type Game = { board: number[]; moves: AppleMove[]; score: number; startAt: number; drag: Drag | null; falls: Fall[]; pops: Pop[] };
type Selection = { move: AppleMove | null; sum: number; cells: number[] };

type Result = { score: number; moves: number; best: number; isNewBest: boolean; weekRank: number | null };
type RankRow = { userId: number; nickname: string; score: number };
type RankRes = { ranking: RankRow[]; me: (RankRow & { rank: number }) | null; total: number };

const newGame = (board: number[]): Game => ({ board, moves: [], score: 0, startAt: 0, drag: null, falls: [], pops: [] });

const cellCenter = (i: number) => ({ x: BX + (i % COLS) * CELL + CELL / 2, y: BY + Math.floor(i / COLS) * CELL + CELL / 2 });

const formatClock = (ms: number) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 드래그 사각형 안에 가운데가 들어온 칸들 → 범위와 합 */
const selectionOf = (g: Game): Selection | null => {
  if (!g.drag) return null;
  const { x0, y0, x1, y1 } = g.drag;
  const c1 = Math.max(0, Math.ceil((Math.min(x0, x1) - BX - CELL / 2) / CELL));
  const c2 = Math.min(COLS - 1, Math.floor((Math.max(x0, x1) - BX - CELL / 2) / CELL));
  const r1 = Math.max(0, Math.ceil((Math.min(y0, y1) - BY - CELL / 2) / CELL));
  const r2 = Math.min(ROWS - 1, Math.floor((Math.max(y0, y1) - BY - CELL / 2) / CELL));
  if (c1 > c2 || r1 > r2) return { move: null, sum: 0, cells: [] };
  const move: AppleMove = [r1, c1, r2, c2];
  return { move, ...rectInfo(g.board, move) };
};

// ------------------------------ 그리기 도우미 ------------------------------

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

type AppleLook = "normal" | "picked" | "match";

/** 사과 하나 (숫자 제외). (cx, cy) 가운데 */
const paintApple = (ctx: CanvasRenderingContext2D, cx: number, cy: number, look: AppleLook) => {
  // 그림자
  ctx.fillStyle = "rgba(40,70,20,0.18)";
  ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.92, R * 0.75, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  // 몸통 (위가 살짝 들어간 모양)
  const body = new Path2D();
  body.moveTo(cx, cy - R * 0.7);
  body.bezierCurveTo(cx + R * 0.45, cy - R * 1.05, cx + R * 1.08, cy - R * 0.75, cx + R * 1.0, cy + R * 0.05);
  body.bezierCurveTo(cx + R * 0.95, cy + R * 0.75, cx + R * 0.45, cy + R * 1.0, cx, cy + R * 0.88);
  body.bezierCurveTo(cx - R * 0.45, cy + R * 1.0, cx - R * 0.95, cy + R * 0.75, cx - R * 1.0, cy + R * 0.05);
  body.bezierCurveTo(cx - R * 1.08, cy - R * 0.75, cx - R * 0.45, cy - R * 1.05, cx, cy - R * 0.7);
  const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R * 1.15);
  if (look === "match") { g.addColorStop(0, "#ffb38a"); g.addColorStop(0.55, "#ff5a36"); g.addColorStop(1, "#c4260f"); }
  else { g.addColorStop(0, "#ff8a80"); g.addColorStop(0.55, "#e8392f"); g.addColorStop(1, "#a51b16"); }
  ctx.fillStyle = g;
  ctx.fill(body);
  // 꼭지 + 잎
  ctx.strokeStyle = "#6b3f1d"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.62); ctx.quadraticCurveTo(cx + R * 0.05, cy - R * 0.95, cx + R * 0.18, cy - R * 1.1); ctx.stroke();
  ctx.fillStyle = "#4caf3c";
  ctx.beginPath(); ctx.ellipse(cx + R * 0.42, cy - R * 0.98, R * 0.32, R * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
  // 반짝임
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath(); ctx.ellipse(cx - R * 0.45, cy - R * 0.3, R * 0.16, R * 0.26, 0.5, 0, Math.PI * 2); ctx.fill();
  // 선택 테두리
  if (look !== "normal") {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = look === "match" ? "#ffe066" : "rgba(255,255,255,0.95)";
    if (look === "match") { ctx.shadowColor = "rgba(255,224,102,0.9)"; ctx.shadowBlur = 12; }
    ctx.stroke(body);
    ctx.restore();
  }
};

const paintNumber = (ctx: CanvasRenderingContext2D, cx: number, cy: number, value: number) => {
  ctx.font = `900 ${Math.round(R * 0.95)}px ${FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(110,15,10,0.55)";
  ctx.strokeText(String(value), cx, cy + R * 0.12);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(value), cx, cy + R * 0.12);
};

// ------------------------------ 메인 ------------------------------

export default function AppleGame() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rank, setRank] = useState<RankRes | null>(null);
  const [sound, setSound] = useState(true);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(newGame([]));
  const demoRef = useRef<number[]>([]); // 시작 전 화면 뒤에 깔아 둘 판
  const phaseRef = useRef<Phase>("ready");
  const phaseAtRef = useRef(0);
  const lastCountRef = useRef(0);
  const periodRef = useRef<"week" | "all">("week");
  const startingRef = useRef(false);
  const endTimerRef = useRef<number | null>(null);
  const spritesRef = useRef<{ scale: number; bg: HTMLCanvasElement; apple: Record<AppleLook, HTMLCanvasElement> } | null>(null);

  const goPhase = (p: Phase) => { phaseRef.current = p; phaseAtRef.current = performance.now(); setPhase(p); };
  const clearEndTimer = () => { if (endTimerRef.current !== null) { clearTimeout(endTimerRef.current); endTimerRef.current = null; } };

  // ---------- 소리 ----------
  useEffect(() => {
    try {
      const on = localStorage.getItem(SOUND_KEY) !== "0";
      setSound(on); setSoundEnabled(on);
    } catch { /* 무시 */ }
    demoRef.current = makeAppleBoard();
    return () => clearEndTimer();
  }, []);
  const toggleSound = () => {
    setSound(prev => {
      const on = !prev;
      setSoundEnabled(on);
      try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch { /* 무시 */ }
      return on;
    });
  };

  // ---------- 랭킹 ----------
  const loadRank = useCallback(async (p: "week" | "all") => {
    const res = await fetch(`/api/minigame/apple?period=${p}`).catch(() => null);
    if (res?.ok) setRank(await res.json());
  }, []);
  useEffect(() => { periodRef.current = period; loadRank(period); }, [period, loadRank]);

  // ---------- 시작 / 끝 ----------
  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    unlockAudio(); // 클릭/키 입력 중에 소리를 켜 둬야 브라우저가 막지 않는다
    clearEndTimer();
    lastCountRef.current = 0;
    setError(""); setResult(null); setDragging(false);
    canvasRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const res = await fetch("/api/minigame/apple", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    startingRef.current = false;
    if (!res?.ok || !Array.isArray(json?.board)) { setError(json?.error ?? "시작하지 못했어요. 로그인 상태를 확인해 주세요."); return; }
    gameRef.current = newGame(json.board);
    goPhase("countdown");
  };

  const beginPlay = (now: number) => {
    gameRef.current.startAt = now;
    goPhase("playing");
    sfx.go();
    // 탭이 뒤에 있어 화면이 멈춰도 2분이 지나면 끝나게
    endTimerRef.current = window.setTimeout(() => finish(), APPLE_GAME_MS + 100);
  };

  const quit = () => { clearEndTimer(); gameRef.current.drag = null; setDragging(false); goPhase("ready"); };

  const finish = async () => {
    if (phaseRef.current !== "playing") return;
    clearEndTimer();
    const g = gameRef.current;
    g.drag = null; setDragging(false);
    goPhase("result");
    sfx.finish();
    const res = await fetch("/api/minigame/apple", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", moves: g.moves }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok || !json) { setError(json?.error ?? "기록 저장에 실패했어요."); return; }
    setResult(json);
    loadRank(periodRef.current);
  };

  // ---------- 드래그 ----------
  const toBoard = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    // 판 밖으로 나가도 가장자리에 붙여서 계속 묶을 수 있게
    return { x: Math.max(BX - 4, Math.min(BX + BW + 4, x)), y: Math.max(BY - 4, Math.min(BY + BH + 4, y)) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing" || e.button !== 0) return;
    e.preventDefault();
    const p = toBoard(e.clientX, e.clientY);
    gameRef.current.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    setDragging(true);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gameRef.current;
      if (!g.drag || !canvasRef.current) return;
      const p = toBoard(e.clientX, e.clientY);
      g.drag.x1 = p.x; g.drag.y1 = p.y;
    };
    const up = () => {
      const g = gameRef.current;
      if (!g.drag) return;
      const sel = selectionOf(g);
      g.drag = null;
      setDragging(false);
      if (phaseRef.current !== "playing" || !sel?.move || sel.cells.length === 0) return;
      if (sel.sum !== APPLE_TARGET) return;
      const now = performance.now();
      let sx = 0, sy = 0;
      for (const i of sel.cells) {
        const { x, y } = cellCenter(i);
        sx += x; sy += y;
        g.falls.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: -260 - Math.random() * 180, spin: (Math.random() - 0.5) * 10, value: g.board[i], at: now });
        g.board[i] = 0;
      }
      g.moves.push(sel.move);
      g.score += sel.cells.length;
      g.pops.push({ x: sx / sel.cells.length, y: sy / sel.cells.length, text: `+${sel.cells.length}`, at: now });
      sfx.clear(sel.cells.length >= 4 ? 4 : sel.cells.length >= 3 ? 2 : 1);
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const ph = phaseRef.current;
      if (e.code === "Escape" && (ph === "playing" || ph === "countdown")) { quit(); return; }
      if (e.code === "KeyR" && !e.repeat && (ph === "ready" || ph === "result")) { e.preventDefault(); start(); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("blur", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", up);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 루프 ----------
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const ph = phaseRef.current;
      if (ph === "countdown") {
        const left = APPLE_COUNTDOWN_MS - (now - phaseAtRef.current);
        const n = Math.min(3, Math.ceil(left / (APPLE_COUNTDOWN_MS / 3)));
        if (n > 0 && n !== lastCountRef.current) { lastCountRef.current = n; sfx.count(); }
        if (left <= 0) beginPlay(now);
      } else if (ph === "playing" && now - gameRef.current.startAt >= APPLE_GAME_MS) {
        finish();
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 그리기 ----------
  const buildSprites = (scale: number) => {
    const bg = document.createElement("canvas");
    bg.width = Math.round(W * scale); bg.height = Math.round(H * scale);
    const b = bg.getContext("2d")!;
    b.scale(bg.width / W, bg.height / H);
    const outer = b.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.8);
    outer.addColorStop(0, "#1c2a1f"); outer.addColorStop(1, "#0a110c");
    b.fillStyle = outer; b.fillRect(0, 0, W, H);
    // 판: 연두색 잔디
    b.save();
    b.shadowColor = "rgba(120,220,120,0.35)"; b.shadowBlur = 22;
    roundRect(b, BX - 8, BY - 8, BW + 16, BH + 16, 16);
    const field = b.createLinearGradient(0, BY, 0, BY + BH);
    field.addColorStop(0, "#e9f7dc"); field.addColorStop(1, "#cde9b5");
    b.fillStyle = field; b.fill();
    b.restore();
    b.strokeStyle = "rgba(120,190,90,0.6)"; b.lineWidth = 2;
    roundRect(b, BX - 8, BY - 8, BW + 16, BH + 16, 16); b.stroke();
    b.fillStyle = "rgba(90,150,60,0.16)";
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) {
      b.beginPath(); b.arc(BX + c * CELL, BY + r * CELL, 1.6, 0, Math.PI * 2); b.fill();
    }
    // 사과 스프라이트 (숫자 없이, 상태별로 한 번만 그려 둔다)
    const size = Math.ceil(CELL * 1.2 * scale);
    const make = (look: AppleLook) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const x = c.getContext("2d")!;
      x.scale(scale, scale);
      paintApple(x, (CELL * 1.2) / 2, (CELL * 1.2) / 2, look);
      return c;
    };
    return { scale, bg, apple: { normal: make("normal"), picked: make("picked"), match: make("match") } };
  };

  const draw = (now: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.max(0.5, (canvas.clientWidth || W) / W) * dpr;
    const pw = Math.round(W * scale);
    if (canvas.width !== pw) { canvas.width = pw; canvas.height = Math.round(H * scale); }
    if (!spritesRef.current || spritesRef.current.scale !== scale) spritesRef.current = buildSprites(scale);
    const sp = spritesRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sp.bg, 0, 0);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

    const g = gameRef.current;
    const ph = phaseRef.current;
    const sel = ph === "playing" ? selectionOf(g) : null;
    const picked = new Set(sel?.cells ?? []);
    const isMatch = !!sel && sel.cells.length > 0 && sel.sum === APPLE_TARGET;
    const S = CELL * 1.2;
    const drawSprite = (look: AppleLook, x: number, y: number) => ctx.drawImage(sp.apple[look], x - S / 2, y - S / 2, S, S);

    // 사과
    const board = ph === "ready" ? demoRef.current : ph === "countdown" ? [] : g.board;
    ctx.save();
    if (ph === "result") ctx.globalAlpha = 0.55;
    board.forEach((v, i) => {
      if (v <= 0) return;
      const { x, y } = cellCenter(i);
      drawSprite(picked.has(i) ? (isMatch ? "match" : "picked") : "normal", x, y);
      paintNumber(ctx, x, y, v);
    });
    ctx.restore();

    // 드래그 사각형
    if (g.drag && ph === "playing") {
      const { x0, y0, x1, y1 } = g.drag;
      const color = isMatch ? "47,191,113" : (sel?.sum ?? 0) > APPLE_TARGET ? "255,99,99" : "79,140,255";
      ctx.fillStyle = `rgba(${color},0.16)`;
      ctx.strokeStyle = `rgba(${color},0.95)`;
      ctx.lineWidth = 2;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    // 떨어지는 사과
    g.falls = g.falls.filter(f => {
      const t = (now - f.at) / 1000;
      if (t > 0.9) return false;
      const x = f.x + f.vx * t, y = f.y + f.vy * t + 0.5 * 2000 * t * t;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 0.9);
      ctx.translate(x, y); ctx.rotate(f.spin * t);
      drawSprite("match", 0, 0);
      paintNumber(ctx, 0, 0, f.value);
      ctx.restore();
      return true;
    });

    // +점수
    g.pops = g.pops.filter(p => {
      const age = (now - p.at) / 700;
      if (age > 1) return false;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.font = `900 ${26 + age * 8}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,60,20,0.6)";
      ctx.strokeText(p.text, p.x, p.y - age * 40);
      ctx.fillStyle = "#ffe066";
      ctx.fillText(p.text, p.x, p.y - age * 40);
      ctx.restore();
      return true;
    });

    // 위 표시줄: 점수 · 합계 · 시간
    const remain = ph === "playing" ? APPLE_GAME_MS - (now - g.startAt) : ph === "countdown" || ph === "ready" ? APPLE_GAME_MS : 0;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `800 13px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("점수", BX, BY / 2 - 4);
    ctx.font = `900 30px ${FONT}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(String(ph === "ready" ? 0 : g.score), BX + 38, BY / 2 - 4);
    if (sel && sel.cells.length > 0) {
      ctx.textAlign = "center";
      ctx.font = `900 22px ${FONT}`;
      ctx.fillStyle = isMatch ? "#5dff9c" : sel.sum > APPLE_TARGET ? "#ff8a8a" : "#ffffff";
      ctx.fillText(`${sel.sum} / ${APPLE_TARGET}`, BX + BW / 2, BY / 2 - 4);
    }
    ctx.textAlign = "right";
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = remain <= 10_000 && ph === "playing" ? "#ff8a8a" : "#ffffff";
    ctx.fillText(formatClock(remain), BX + BW, BY / 2 - 4);

    // 남은 시간 막대 (세로)
    const k = Math.max(0, Math.min(1, remain / APPLE_GAME_MS));
    roundRect(ctx, TX, BY - 8, TW, BH + 16, TW / 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
    if (k > 0) {
      const fh = (BH + 16) * k;
      roundRect(ctx, TX, BY - 8 + (BH + 16) - fh, TW, fh, TW / 2);
      ctx.fillStyle = k > 0.5 ? "#5dd36b" : k > 0.2 ? "#ffd166" : "#ff6b6b";
      ctx.fill();
    }

    // 카운트다운
    if (ph === "countdown") {
      const msLeft = Math.max(0, APPLE_COUNTDOWN_MS - (now - phaseAtRef.current));
      const per = APPLE_COUNTDOWN_MS / 3;
      const n = Math.max(1, Math.ceil(msLeft / per));
      const inStep = (msLeft % per) / per;
      ctx.save();
      ctx.translate(BX + BW / 2, BY + BH / 2);
      const s = 1 + Math.pow(inStep, 3) * 0.6;
      ctx.scale(s, s);
      ctx.font = `900 120px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(232,57,47,0.6)"; ctx.shadowBlur = 24;
      ctx.fillStyle = "#e8392f";
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }
    if (ph === "playing" && now - g.startAt < 500) {
      const t = (now - g.startAt) / 500;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.font = `900 ${90 + t * 30}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = "rgba(20,60,20,0.5)";
      ctx.strokeText("GO!", BX + BW / 2, BY + BH / 2);
      ctx.fillStyle = "#2fbf71";
      ctx.fillText("GO!", BX + BW / 2, BY + BH / 2);
      ctx.restore();
    }
  };

  // ---------- 화면 ----------
  return (
    <div className={ui.page}>
      <div className={ui.head}>
        <div>
          <h2 className={ui.title}>🍎 사과게임</h2>
          <p className={ui.sub}>드래그로 사과를 묶어 숫자 합을 10으로 만드세요. 2분 동안 많이 없앨수록 순위가 올라가요.</p>
        </div>
        <button className={ui.soundBtn} onClick={toggleSound} aria-label={sound ? "소리 끄기" : "소리 켜기"}>
          {sound ? "🔊 소리 켜짐" : "🔇 소리 꺼짐"}
        </button>
      </div>

      <div className={ui.layout}>
        <div className={ui.stageCol}>
          <div className={`${ui.stage} ${styles.stage}`}>
            <canvas
              ref={canvasRef}
              className={`${styles.canvas}${phase === "playing" ? ` ${styles.playing}` : ""}${dragging ? ` ${styles.dragging}` : ""}`}
              onPointerDown={onPointerDown}
              onContextMenu={e => e.preventDefault()}
            />

            {phase === "ready" && (
              <div className={ui.overlay}>
                <div className={ui.card}>
                  <div className={ui.bigIcon}>🍎</div>
                  <h3>사과게임</h3>
                  <ul className={ui.rules}>
                    <li>마우스로 드래그해서 사각형을 그려요</li>
                    <li>안에 든 사과 숫자의 합이 <b>10</b>이면 사과가 사라져요</li>
                    <li>사과 1개 = 1점 · 제한 시간 <b>2분</b></li>
                    <li>많이 묶을수록 점수가 커요 (예: 1+2+3+4)</li>
                  </ul>
                  <button className={`btn-primary ${ui.startBtn}`} onClick={start}>시작하기</button>
                  <p className={styles.hint}><kbd>R</kbd> 시작 · 게임 중 <kbd>Esc</kbd> 그만하기</p>
                </div>
              </div>
            )}

            {phase === "result" && (
              <div className={ui.overlay}>
                <div className={ui.card}>
                  {result ? (
                    <>
                      {result.isNewBest && <div className={ui.newBest}>🎉 개인 신기록!</div>}
                      <div className={ui.scoreLabel}>없앤 사과</div>
                      <div className={`${ui.score} ${styles.score}`}>{result.score}</div>
                      <div className={ui.stats}>
                        <div><b>{result.moves}</b><span>묶은 횟수</span></div>
                        <div><b>{result.moves > 0 ? (result.score / result.moves).toFixed(1) : "0"}</b><span>평균 개수</span></div>
                        <div><b>{result.best}</b><span>내 최고</span></div>
                      </div>
                      <div className={ui.meta}>{result.weekRank ? `이번 주 ${result.weekRank}위` : " "}</div>
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
                  <span className={ui.pts}>{r.score}점</span>
                </li>
              ))}
            </ol>
          )}
          {rank?.me && !rank.ranking.some(r => r.userId === rank.me!.userId) && (
            <div className={ui.myRow}>
              <span className={ui.pos}>{rank.me.rank}</span>
              <span className={ui.name}>{rank.me.nickname} (나)</span>
              <span className={ui.pts}>{rank.me.score}점</span>
            </div>
          )}
          {rank && rank.total > 0 && <p className={ui.rankFoot}>참가 {rank.total}명 · 1인 최고점 기준</p>}
        </aside>
      </div>
    </div>
  );
}
