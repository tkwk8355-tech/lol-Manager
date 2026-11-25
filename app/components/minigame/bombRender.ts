// =============================================================
// 폭탄돌리기: 캔버스 그리기 전용
// - 게임 규칙/통신은 BombGame.tsx, 여기서는 "어떻게 보이는지"만 담당한다.
// - 바닥은 한 번만 그려서 재사용하고, 불꽃·파편·꽃가루는 파티클로 그린다.
// =============================================================

import { ARENA_H, ARENA_W, PLAYER_R, ROUND_MS, type BombRoomView } from "@/lib/bombGameShared";

export type Vec = { x: number; y: number };

type ParticleKind = "spark" | "debris" | "smoke" | "confetti";
type Particle = {
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  size: number; color: string;
  rot: number; vr: number;
};

export type BombFx = {
  particles: Particle[];
  floor: { dpr: number; canvas: HTMLCanvasElement } | null;
  facing: Map<number, Vec>;
  prevPos: Map<number, Vec>;
  pass: { userId: number; at: number } | null;
  boom: { userId: number; at: number; spawned: boolean } | null;
  statusAt: number;
  shakeUntil: number;
};

export const createFx = (): BombFx => ({
  particles: [], floor: null, facing: new Map(), prevPos: new Map(),
  pass: null, boom: null, statusAt: 0, shakeUntil: 0,
});

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const MAX_PARTICLES = 600;
const R = PLAYER_R;

// ------------------------------ 작은 도우미 ------------------------------

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

// #rrggbb를 밝게(+) / 어둡게(-)
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

const addParticle = (fx: BombFx, p: Omit<Particle, "rot" | "vr"> & Partial<Pick<Particle, "rot" | "vr">>) => {
  if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
  fx.particles.push({ rot: 0, vr: 0, ...p });
};

// ------------------------------ 효과 만들기 ------------------------------

const CONFETTI_COLORS = ["#ffd166", "#ef476f", "#06d6a0", "#7aa2f7", "#bb9af7", "#ff9e64"] as const;

export const spawnConfetti = (fx: BombFx) => {
  for (let i = 0; i < 140; i++) {
    const life = rand(3, 5);
    addParticle(fx, {
      kind: "confetti", x: rand(0, ARENA_W), y: rand(-200, -10),
      vx: rand(-40, 40), vy: rand(70, 170), life, maxLife: life,
      size: rand(5, 9), color: pick(CONFETTI_COLORS), rot: rand(0, Math.PI), vr: rand(-6, 6),
    });
  }
};

const spawnExplosion = (fx: BombFx, at: Vec) => {
  const fire = ["#fff3b0", "#ffd166", "#ff9e40", "#ff5a36", "#d7263d"] as const;
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(120, 520);
    const life = rand(0.4, 0.9);
    addParticle(fx, {
      kind: "debris", x: at.x, y: at.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life, maxLife: life, size: rand(2, 4.5), color: pick(fire),
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(20, 90);
    const life = rand(1, 1.8);
    addParticle(fx, {
      kind: "smoke", x: at.x + rand(-10, 10), y: at.y + rand(-10, 10),
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life, maxLife: life,
      size: rand(14, 26), color: "#3a3f4b",
    });
  }
  fx.shakeUntil = Date.now() + 550;
};

const spawnSparks = (fx: BombFx, at: Vec, dt: number) => {
  const count = Math.random() < dt * 60 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const life = rand(0.18, 0.4);
    addParticle(fx, {
      kind: "spark", x: at.x, y: at.y, vx: rand(-70, 70), vy: rand(-120, -20),
      life, maxLife: life, size: rand(1, 2.2), color: Math.random() < 0.5 ? "#ffe08a" : "#ff9e40",
    });
  }
};

// ------------------------------ 바닥 (한 번만 그림) ------------------------------

const buildFloor = (dpr: number) => {
  const c = document.createElement("canvas");
  c.width = ARENA_W * dpr;
  c.height = ARENA_H * dpr;
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  const cx = ARENA_W / 2, cy = ARENA_H / 2;

  const bg = g.createRadialGradient(cx, cy, 40, cx, cy, ARENA_W * 0.72);
  bg.addColorStop(0, "#252e42");
  bg.addColorStop(0.6, "#161c29");
  bg.addColorStop(1, "#0b0f17");
  g.fillStyle = bg;
  g.fillRect(0, 0, ARENA_W, ARENA_H);

  // 체크 타일
  const T = 40;
  for (let y = 0; y < ARENA_H; y += T) {
    for (let x = 0; x < ARENA_W; x += T) {
      if (((x + y) / T) % 2 === 0) {
        g.fillStyle = "rgba(255,255,255,0.022)";
        g.fillRect(x, y, T, T);
      }
    }
  }
  // 타일 꼭짓점 점
  g.fillStyle = "rgba(255,255,255,0.07)";
  for (let y = T; y < ARENA_H; y += T) {
    for (let x = T; x < ARENA_W; x += T) {
      g.beginPath(); g.arc(x, y, 1.2, 0, Math.PI * 2); g.fill();
    }
  }

  // 가운데 원 + 중앙선 (경기장 느낌)
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 92, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx, ARENA_H - 14); g.stroke();

  // 테두리 네온 라인
  g.save();
  g.shadowColor = "rgba(122,162,247,0.55)";
  g.shadowBlur = 14;
  g.strokeStyle = "rgba(122,162,247,0.38)";
  g.lineWidth = 2;
  roundRect(g, 7, 7, ARENA_W - 14, ARENA_H - 14, 14);
  g.stroke();
  g.restore();

  // 비네트
  const vig = g.createRadialGradient(cx, cy, ARENA_H * 0.45, cx, cy, ARENA_W * 0.66);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vig;
  g.fillRect(0, 0, ARENA_W, ARENA_H);
  return c;
};

// ------------------------------ 캐릭터 ------------------------------

type PlayerLook = {
  id: number; nickname: string; color: string; alive: boolean;
  isMe: boolean; isHolder: boolean; pos: Vec; facing: Vec;
  t: number; danger: number; bombLive: boolean;
};

const drawPlayer = (ctx: CanvasRenderingContext2D, p: PlayerLook) => {
  const { x, y } = p.pos;
  ctx.save();
  if (!p.alive) ctx.globalAlpha = 0.45;

  // 그림자
  ctx.beginPath();
  ctx.ellipse(x, y + R * 0.9, R * 0.95, R * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fill();

  // 폭탄 든 사람: 빨간 맥박
  if (p.isHolder && p.bombLive) {
    const speed = 5 + p.danger * 20;
    const pulse = (Math.sin(p.t * speed) + 1) / 2;
    const aura = ctx.createRadialGradient(x, y, R * 0.6, x, y, R + 16 + pulse * 8);
    aura.addColorStop(0, "rgba(255,60,60,0)");
    aura.addColorStop(0.7, `rgba(255,60,60,${0.18 + pulse * 0.25})`);
    aura.addColorStop(1, "rgba(255,60,60,0)");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(x, y, R + 16 + pulse * 8, 0, Math.PI * 2); ctx.fill();
  }

  // 내 캐릭터: 흰 테두리 + 빛
  if (p.isMe && p.alive) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, R + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // 몸통 (구슬처럼 입체감)
  const base = p.alive ? p.color : "#6b7080";
  const body = ctx.createRadialGradient(x - R * 0.4, y - R * 0.45, R * 0.1, x, y, R * 1.05);
  body.addColorStop(0, shade(base, 0.6));
  body.addColorStop(0.5, base);
  body.addColorStop(1, shade(base, -0.5));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 반사광
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.ellipse(x - R * 0.38, y - R * 0.5, R * 0.28, R * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();

  // 눈
  const ex = R * 0.34, ey = y - R * 0.08;
  if (!p.alive) {
    ctx.strokeStyle = "#1b1e27";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (const sx of [-1, 1]) {
      const cx = x + sx * ex, s = R * 0.15;
      ctx.beginPath(); ctx.moveTo(cx - s, ey - s); ctx.lineTo(cx + s, ey + s);
      ctx.moveTo(cx + s, ey - s); ctx.lineTo(cx - s, ey + s); ctx.stroke();
    }
  } else {
    const blink = ((p.t + p.id * 0.731) % 3.6) < 0.12;
    const scared = p.isHolder && p.bombLive;
    const ry = blink ? R * 0.04 : R * (scared ? 0.3 : 0.25);
    const rx = R * (scared ? 0.22 : 0.2);
    for (const sx of [-1, 1]) {
      const cx = x + sx * ex + p.facing.x * R * 0.1;
      const cy = ey + p.facing.y * R * 0.08;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      if (!blink) {
        const pr = R * (scared ? 0.09 : 0.115);
        const px = cx + p.facing.x * R * 0.08, py = cy + p.facing.y * R * 0.1;
        ctx.fillStyle = "#151821";
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 폭탄 들었으면 식은땀
    if (scared) {
      const bob = Math.sin(p.t * 8) * 1.5;
      const sx = x + R * 0.82, sy = y - R * 0.45 + bob;
      ctx.fillStyle = "rgba(160,215,255,0.95)";
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.quadraticCurveTo(sx + 4.5, sy + 1, sx, sy + 3.5);
      ctx.quadraticCurveTo(sx - 4.5, sy + 1, sx, sy - 6);
      ctx.fill();
    }
  }

  // 이름표
  const label = p.isMe ? `${p.nickname} (나)` : p.nickname;
  ctx.font = `${p.isMe ? 800 : 600} 12px ${FONT}`;
  const tw = ctx.measureText(label).width;
  const ty = y + R + 8;
  roundRect(ctx, x - tw / 2 - 7, ty, tw + 14, 19, 9.5);
  ctx.fillStyle = p.isMe ? "rgba(255,255,255,0.92)" : "rgba(8,10,16,0.62)";
  ctx.fill();
  ctx.fillStyle = p.isMe ? "#11141c" : "#e9ecf3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, ty + 10);
  ctx.restore();
};

// ------------------------------ 폭탄 ------------------------------

// 0~1 사이 위치의 2차 베지어 점
const bez = (a: Vec, c: Vec, b: Vec, t: number): Vec => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

/** 폭탄을 그리고, 심지 끝 위치를 돌려준다 */
const drawBomb = (ctx: CanvasRenderingContext2D, at: Vec, t: number, danger: number, fuseLeft: number, lit: boolean): Vec => {
  const shake = danger > 0.55 ? (danger - 0.55) * 7 : 0;
  const bx = at.x + Math.sin(t * 53) * shake;
  const by = at.y + Math.cos(t * 47) * shake + Math.sin(t * 3) * 1.5;
  const r = 12;

  ctx.save();
  // 위험할수록 빨간 빛
  if (danger > 0.3) {
    ctx.shadowColor = `rgba(255,60,60,${Math.min(1, danger)})`;
    ctx.shadowBlur = 8 + danger * 16;
  }
  const g = ctx.createRadialGradient(bx - 4, by - 5, 1, bx, by, r);
  g.addColorStop(0, "#6b7180");
  g.addColorStop(0.45, "#2a2e38");
  g.addColorStop(1, "#0a0b0f");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 막판엔 빨갛게 깜빡
  if (danger > 0.66) {
    const flash = (Math.sin(t * (10 + danger * 20)) + 1) / 2;
    ctx.fillStyle = `rgba(255,50,40,${flash * 0.45})`;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  }

  // 반사광
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath(); ctx.ellipse(bx - 4.5, by - 5, 3.2, 1.8, -0.7, 0, Math.PI * 2); ctx.fill();

  // 뚜껑
  ctx.save();
  ctx.translate(bx + r * 0.62, by - r * 0.62);
  ctx.rotate(Math.PI / 4);
  const cap = ctx.createLinearGradient(-5, 0, 5, 0);
  cap.addColorStop(0, "#5c616e"); cap.addColorStop(0.5, "#a9afbd"); cap.addColorStop(1, "#4a4e59");
  ctx.fillStyle = cap;
  roundRect(ctx, -5, -4, 10, 6, 1.5);
  ctx.fill();
  ctx.restore();

  // 심지 (남은 시간만큼 짧아짐)
  const a = { x: bx + r * 0.8, y: by - r * 0.85 };
  const c = { x: bx + r * 1.9, y: by - r * 1.6 };
  const b = { x: bx + r * 1.2, y: by - r * 2.5 };
  const len = 0.15 + 0.85 * Math.max(0, Math.min(1, fuseLeft));
  ctx.strokeStyle = "#c9a46a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  const STEPS = 12;
  for (let i = 1; i <= STEPS; i++) {
    const pt = bez(a, c, b, (i / STEPS) * len);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  const tip = bez(a, c, b, len);

  // 불꽃
  if (lit) {
    const flick = 5 + Math.random() * 3;
    const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, flick * 2.2);
    glow.addColorStop(0, "rgba(255,255,230,1)");
    glow.addColorStop(0.3, "rgba(255,210,90,0.9)");
    glow.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, flick * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  return tip;
};

// ------------------------------ 화면 글씨 ------------------------------

const banner = (ctx: CanvasRenderingContext2D, title: string, sub: string | null, color: string, age: number) => {
  const k = Math.min(1, age / 0.25);
  const scale = 0.85 + 0.15 * (1 - Math.pow(1 - k, 3));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(ARENA_W / 2, ARENA_H / 2);
  ctx.scale(scale, scale);
  ctx.font = `900 40px ${FONT}`;
  const w = Math.max(ctx.measureText(title).width + 64, 280);
  const h = sub ? 108 : 80;
  roundRect(ctx, -w / 2, -h / 2, w, h, 20);
  ctx.fillStyle = "rgba(8,10,16,0.8)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = k * 0.6;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = k;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(title, 0, sub ? -14 : 2);
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(sub, 0, 28);
  }
  ctx.restore();
};

const drawTimer = (ctx: CanvasRenderingContext2D, remaining: number, t: number) => {
  const frac = remaining / ROUND_MS;
  const color = remaining < 5_000 ? "#ff5a5a" : remaining < 10_000 ? "#ffd166" : "#9ece6a";
  const urgent = remaining < 5_000;
  const pulse = urgent ? 1 + Math.max(0, Math.sin(t * 12)) * 0.06 : 1;
  const w = 150, h = 50;
  ctx.save();
  ctx.translate(ARENA_W / 2, 20 + h / 2);
  ctx.scale(pulse, pulse);
  roundRect(ctx, -w / 2, -h / 2, w, h, 25);
  ctx.fillStyle = "rgba(8,10,16,0.72)";
  ctx.fill();
  ctx.strokeStyle = urgent ? "rgba(255,90,90,0.6)" : "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 원형 게이지
  const rx = -w / 2 + 26;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.arc(rx, 0, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(rx, 0, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💣", rx, 1);

  ctx.font = `900 26px ${FONT}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = urgent ? 12 : 0;
  ctx.textAlign = "left";
  ctx.fillText((remaining / 1000).toFixed(1), rx + 24, 1);
  ctx.restore();
};

const drawCountdown = (ctx: CanvasRenderingContext2D, msLeft: number) => {
  const n = Math.max(1, Math.ceil(msLeft / 1000));
  const inSec = (msLeft % 1000) / 1000; // 1 → 0
  const scale = 1 + Math.pow(inSec, 3) * 0.7;
  ctx.save();
  ctx.fillStyle = "rgba(5,7,12,0.55)";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.translate(ARENA_W / 2, ARENA_H / 2 - 10);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, (1 - inSec) * 3 + 0.3);
  ctx.font = `900 130px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,180,70,0.9)";
  ctx.shadowBlur = 30;
  const g = ctx.createLinearGradient(0, -60, 0, 60);
  g.addColorStop(0, "#fff6d6"); g.addColorStop(1, "#ffb347");
  ctx.fillStyle = g;
  ctx.fillText(String(n), 0, 0);
  ctx.restore();
  ctx.save();
  roundRect(ctx, ARENA_W / 2 - 54, ARENA_H / 2 + 62, 108, 32, 16);
  ctx.fillStyle = "rgba(8,10,16,0.8)";
  ctx.fill();
  ctx.font = `800 16px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd9a0";
  ctx.fillText("준비!", ARENA_W / 2, ARENA_H / 2 + 79);
  ctx.restore();
};

// ------------------------------ 한 프레임 그리기 ------------------------------

export type FrameInput = {
  view: BombRoomView | null;
  positions: Map<number, Vec>;
  myId: number | null;
  serverNow: number;
  dt: number;
};

export const renderFrame = (canvas: HTMLCanvasElement, fx: BombFx, input: FrameInput) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { view: v, positions, myId, serverNow, dt } = input;
  const t = performance.now() / 1000;

  // 선명하게 (레티나 대응)
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== ARENA_W * dpr) { canvas.width = ARENA_W * dpr; canvas.height = ARENA_H * dpr; }
  if (!fx.floor || fx.floor.dpr !== dpr) fx.floor = { dpr, canvas: buildFloor(dpr) };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fx.floor.canvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!v) return;

  const playing = v.status === "playing";
  const bombLive = playing || v.status === "countdown";
  const remaining = playing ? Math.max(0, v.phaseEndsAt - serverNow) : ROUND_MS;
  const danger = playing ? 1 - remaining / ROUND_MS : 0;

  // 화면 흔들림 (폭발)
  const shakeLeft = fx.shakeUntil - Date.now();
  ctx.save();
  if (shakeLeft > 0) {
    const p = (shakeLeft / 550) * 9;
    ctx.translate(rand(-p, p), rand(-p, p));
  }

  // 막판 5초: 가장자리 붉게
  if (playing && remaining < 5_000) {
    const pulse = (Math.sin(t * 9) + 1) / 2;
    const red = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, ARENA_H * 0.4, ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.7);
    red.addColorStop(0, "rgba(255,30,30,0)");
    red.addColorStop(1, `rgba(255,30,30,${0.12 + pulse * 0.18})`);
    ctx.fillStyle = red;
    ctx.fillRect(-20, -20, ARENA_W + 40, ARENA_H + 40);
  }

  // 바라보는 방향 (눈동자) 갱신
  for (const p of v.players) {
    const pos = positions.get(p.userId);
    if (!pos) continue;
    const prev = fx.prevPos.get(p.userId);
    const face = fx.facing.get(p.userId) ?? { x: 0, y: 0.3 };
    if (prev) {
      const dx = pos.x - prev.x, dy = pos.y - prev.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.4) {
        const k = Math.min(1, dt * 12);
        face.x += (dx / d - face.x) * k;
        face.y += (dy / d - face.y) * k;
      }
    }
    fx.facing.set(p.userId, face);
    fx.prevPos.set(p.userId, { x: pos.x, y: pos.y });
  }

  // 폭탄 넘김 효과 (바닥 링)
  if (fx.pass) {
    const age = (Date.now() - fx.pass.at) / 1000;
    const pos = positions.get(fx.pass.userId);
    if (pos && age < 0.6) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,90,70,${1 - age / 0.6})`;
      ctx.lineWidth = 4 * (1 - age / 0.6) + 1;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, R + 4 + age * 90, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (age >= 0.6) fx.pass = null;
  }

  // 캐릭터: 탈락자 먼저, 아래쪽(y 큰) 사람이 앞으로
  const ordered = [...v.players].sort((a, b) =>
    Number(a.alive) - Number(b.alive) || (positions.get(a.userId)?.y ?? 0) - (positions.get(b.userId)?.y ?? 0));
  for (const p of ordered) {
    const pos = positions.get(p.userId);
    if (!pos) continue;
    drawPlayer(ctx, {
      id: p.userId, nickname: p.nickname, color: p.color, alive: p.alive,
      isMe: p.userId === myId, isHolder: p.userId === v.bombHolder,
      pos, facing: fx.facing.get(p.userId) ?? { x: 0, y: 0.3 }, t, danger, bombLive,
    });
  }

  // 폭탄 (머리 위)
  if (bombLive && v.bombHolder !== null) {
    const pos = positions.get(v.bombHolder);
    if (pos) {
      const tip = drawBomb(ctx, { x: pos.x, y: pos.y - R - 20 }, t, danger, remaining / ROUND_MS, playing);
      if (playing) spawnSparks(fx, tip, dt);
    }
  }

  // 폭발
  const boom = fx.boom;
  if (boom) {
    const pos = positions.get(boom.userId);
    const age = (Date.now() - boom.at) / 1000;
    if (pos && !boom.spawned) { spawnExplosion(fx, pos); boom.spawned = true; }
    if (pos && age < 1.3) {
      const k = age / 1.3;
      const fr = 24 + Math.pow(k, 0.5) * 150;
      const fire = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, fr);
      fire.addColorStop(0, `rgba(255,250,220,${0.95 * (1 - k)})`);
      fire.addColorStop(0.35, `rgba(255,190,70,${0.8 * (1 - k)})`);
      fire.addColorStop(0.7, `rgba(255,80,40,${0.45 * (1 - k)})`);
      fire.addColorStop(1, "rgba(255,60,30,0)");
      ctx.fillStyle = fire;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, fr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,230,180,${Math.max(0, 0.8 - k * 1.4)})`;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 20 + k * 420, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 파티클
  ctx.save();
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
    const k = p.life / p.maxLife; // 1 → 0
    if (p.kind === "spark") { p.vy += 380 * dt; }
    else if (p.kind === "debris") { const f = Math.pow(0.04, dt); p.vx *= f; p.vy *= f; }
    else if (p.kind === "smoke") { const f = Math.pow(0.3, dt); p.vx *= f; p.vy *= f; p.size += 22 * dt; }
    else { p.vy += 30 * dt; p.vx += Math.sin(t * 3 + i) * 20 * dt; p.rot += p.vr * dt; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.kind === "smoke") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === "confetti") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.rot * 1.7));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  ctx.restore(); // 흔들림 끝

  // 폭발 직후 번쩍
  if (boom) {
    const age = (Date.now() - boom.at) / 1000;
    if (age < 0.18) {
      ctx.fillStyle = `rgba(255,245,220,${0.55 * (1 - age / 0.18)})`;
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    }
  }

  // 글씨 / 안내
  const nick = (id: number | null) => v.players.find(p => p.userId === id)?.nickname ?? "?";
  const age = (Date.now() - fx.statusAt) / 1000;
  if (v.status === "countdown") {
    drawCountdown(ctx, Math.max(0, v.phaseEndsAt - serverNow));
  } else if (playing) {
    drawTimer(ctx, remaining, t);
  } else if (v.status === "boom") {
    const left = v.players.filter(p => p.alive).length;
    banner(ctx, `💥 ${nick(v.lastExploded)} 탈락!`, `남은 인원 ${left}명`, "#ffb347", age);
  } else if (v.status === "done") {
    banner(ctx, v.winnerId !== null ? `🏆 ${nick(v.winnerId)} 우승!` : "게임 끝", v.winnerId === myId ? "축하해요! 최후의 1인이에요" : null, "#ffd166", age);
  } else if (v.status === "lobby") {
    ctx.save();
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.sin(t * 2) * 0.1})`;
    ctx.fillText(`대기 중 · ${v.players.length}명 입장`, ARENA_W / 2, ARENA_H - 28);
    ctx.restore();
  }
};
