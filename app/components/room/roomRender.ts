// =============================================================
// 방꾸미기: 비스듬한(아이소메트릭) 방 그리기
// - 좌표: 바닥 x(오른쪽 아래로) · y(왼쪽 아래로) · z(위) 단위는 칸
// - 벽: 왼쪽 벽 = x=0 면, 오른쪽 벽 = y=0 면
// - 가구 그림은 roomArt.ts, 여기는 투영 · 벽/바닥 · 정렬 · 클릭 판정
// =============================================================

import {
  CATALOG_MAP, ROOM_SIZE as N, WALL_HEIGHT as WH, footprint, isWallPlacement,
  type FloorPlacement, type Placement, type RoomData, type WallPlacement,
} from "@/lib/roomShared";
import { ART, WALL_ART, type Painter, type WallPainter } from "./roomArt";

export const TW = 64; // 바닥 한 칸 가로 (화면 px)
export const TH = 32; // 바닥 한 칸 세로
export const ZS = 32; // 높이 1칸
export const ROOM_W = N * TW + 80; // 592
export const ROOM_H = WH * ZS + N * TH + 70; // 422
const OX = ROOM_W / 2;
const OY = 26 + WH * ZS;
const T = 0.16; // 벽 두께
const LINE = "rgba(74, 52, 40, 0.55)";

export type V3 = [number, number, number];
export const iso = (x: number, y: number, z = 0) => ({ x: OX + (x - y) * (TW / 2), y: OY + (x + y) * (TH / 2) - z * ZS });

/** 화면 → 바닥 좌표 (칸, 소수) */
export const screenToFloor = (sx: number, sy: number) => {
  const a = (sx - OX) / (TW / 2), b = (sy - OY) / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
};

/** 화면 → 벽 위치 (어느 벽, 벽 따라 몇 칸) */
export const screenToWall = (sx: number) => {
  const a = (sx - OX) / (TW / 2);
  return a >= 0 ? { wall: "R" as const, u: a } : { wall: "L" as const, u: -a };
};

// ------------------------------ 색 ------------------------------

export const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (t - c) * p);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

const polyPath = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) => {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
};

const fillPoly = (ctx: CanvasRenderingContext2D, pts: V3[], fill: string | CanvasGradient, stroke: string | null = LINE, lw = 1.2) => {
  polyPath(ctx, pts.map(p => iso(...p)));
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.stroke(); }
};

/** 축에 맞춘 상자: 윗면 · 왼쪽 앞면(+y) · 오른쪽 앞면(+x) */
export const drawBox = (ctx: CanvasRenderingContext2D, x: number, y: number, z: number, w: number, d: number, h: number, color: string, top?: string) => {
  const x2 = x + w, y2 = y + d, z2 = z + h;
  if (h > 0.001) {
    fillPoly(ctx, [[x, y2, z], [x2, y2, z], [x2, y2, z2], [x, y2, z2]], shade(color, -0.04));
    fillPoly(ctx, [[x2, y, z], [x2, y2, z], [x2, y2, z2], [x2, y, z2]], shade(color, -0.2));
  }
  fillPoly(ctx, [[x, y, z2], [x2, y, z2], [x2, y2, z2], [x, y2, z2]], top ?? shade(color, 0.14));
};

/** 벽 면 위에 2D로 그리기: 안에서 (u*S, -z*S) 좌표를 쓴다 */
export const PLANE_S = 40;
// 왼쪽 벽은 u가 화면 오른쪽→왼쪽으로 커져서 글자가 뒤집히므로, 폭 w 안에서 좌우를 한 번 더 뒤집는다
const withWallPlane = (ctx: CanvasRenderingContext2D, wall: "L" | "R", u0: number, out: number, draw: (c: CanvasRenderingContext2D) => void, w = N) => {
  const P = (u: number, z: number): V3 => (wall === "L" ? [out, u0 + u, z] : [u0 + u, out, z]);
  const o = iso(...P(0, 0)), ex = iso(...P(1, 0)), ez = iso(...P(0, 1));
  ctx.save();
  ctx.transform((ex.x - o.x) / PLANE_S, (ex.y - o.y) / PLANE_S, -(ez.x - o.x) / PLANE_S, -(ez.y - o.y) / PLANE_S, o.x, o.y);
  if (wall === "L") { ctx.translate(w * PLANE_S, 0); ctx.scale(-1, 1); }
  draw(ctx);
  ctx.restore();
};

// ------------------------------ 벽지 · 바닥 ------------------------------

type WallStyle = { base: string; left: string; deco?: "stripe" | "dots" | "cloud" | "stars" | "brick" | "panel" | "check"; accent?: string };
const WALLPAPERS: Record<string, WallStyle> = {
  wp_cream: { base: "#f7ecdc", left: "#efe0ca" },
  wp_pink: { base: "#f9d9dc", left: "#f2c9cd", deco: "stripe", accent: "rgba(255,255,255,0.5)" },
  wp_mint: { base: "#d6f0e3", left: "#c6e7d6", deco: "dots", accent: "rgba(255,255,255,0.75)" },
  wp_sky: { base: "#cfe6fb", left: "#bcdaf6", deco: "cloud", accent: "rgba(255,255,255,0.9)" },
  wp_night: { base: "#2c3466", left: "#252c58", deco: "stars", accent: "#ffe9a8" },
  wp_brick: { base: "#c8664f", left: "#b85a45", deco: "brick", accent: "rgba(255,236,220,0.55)" },
  wp_wood: { base: "#c99a6b", left: "#bb8d5f", deco: "panel", accent: "rgba(80,45,20,0.25)" },
  wp_lavender: { base: "#e6ddf7", left: "#dad0f0", deco: "check", accent: "rgba(150,120,210,0.22)" },
};

type FloorStyle = { a: string; b: string; kind: "plank" | "tile" | "carpet" | "marble" | "grass" };
const FLOORS: Record<string, FloorStyle> = {
  fl_wood: { a: "#d8a878", b: "#cf9d6c", kind: "plank" },
  fl_birch: { a: "#efdcc0", b: "#e7d1b1", kind: "plank" },
  fl_pink: { a: "#f6d3da", b: "#efc2cc", kind: "tile" },
  fl_check: { a: "#f4f1ea", b: "#5d6470", kind: "tile" },
  fl_carpet: { a: "#b9bcc3", b: "#b0b3ba", kind: "carpet" },
  fl_dark: { a: "#8a5a3b", b: "#7d5034", kind: "plank" },
  fl_marble: { a: "#f2f1ee", b: "#e6e4df", kind: "marble" },
  fl_grass: { a: "#8fcf6e", b: "#82c463", kind: "grass" },
};

// 같은 무늬가 매번 같은 자리에 오도록 고정 난수
const rand = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const drawWalls = (ctx: CanvasRenderingContext2D, wpKey: string) => {
  const st = WALLPAPERS[wpKey] ?? WALLPAPERS.wp_cream;
  // 왼쪽 벽 (x = 0)
  fillPoly(ctx, [[0, 0, 0], [0, N, 0], [0, N, WH], [0, 0, WH]], st.left);
  // 오른쪽 벽 (y = 0)
  fillPoly(ctx, [[0, 0, 0], [N, 0, 0], [N, 0, WH], [0, 0, WH]], st.base);

  // 무늬 (벽 면을 잘라서)
  const deco = (wall: "L" | "R") => {
    const P = (u: number, z: number): V3 => (wall === "L" ? [0, u, z] : [u, 0, z]);
    ctx.save();
    polyPath(ctx, [P(0, 0), P(N, 0), P(N, WH), P(0, WH)].map(p => iso(...p)));
    ctx.clip();
    ctx.fillStyle = st.accent ?? "#fff";
    ctx.strokeStyle = st.accent ?? "#fff";
    if (st.deco === "stripe") {
      for (let u = 0.25; u < N; u += 0.5) fillPoly(ctx, [P(u, 0), P(u + 0.18, 0), P(u + 0.18, WH), P(u, WH)], st.accent!, null);
    } else if (st.deco === "dots") {
      for (let u = 0.25; u < N; u += 0.5) for (let z = 0.3; z < WH; z += 0.45) {
        const q = iso(...P(u + ((Math.round(z / 0.45) % 2) * 0.25), z));
        ctx.beginPath(); ctx.ellipse(q.x, q.y, 2.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (st.deco === "cloud") {
      for (let i = 0; i < 5; i++) {
        const q = iso(...P(0.8 + i * 1.6 + rand(i + (wall === "L" ? 9 : 0)) * 0.6, 1.4 + rand(i + 3) * 1.2));
        for (const [dx, dy, r] of [[0, 0, 9], [10, -4, 11], [21, 0, 8], [10, 3, 9]]) {
          ctx.beginPath(); ctx.arc(q.x + dx, q.y + dy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (st.deco === "stars") {
      for (let i = 0; i < 26; i++) {
        const q = iso(...P(rand(i + (wall === "L" ? 50 : 0)) * N, 0.4 + rand(i + 99) * (WH - 0.5)));
        const r = 1 + rand(i + 7) * 1.8;
        ctx.globalAlpha = 0.5 + rand(i + 3) * 0.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const m = iso(...P(wall === "R" ? 6.2 : 5.5, 2.3));
      ctx.beginPath(); ctx.arc(m.x, m.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WALLPAPERS.wp_night.base;
      ctx.beginPath(); ctx.arc(m.x + 5, m.y - 3, 10, 0, Math.PI * 2); ctx.fill();
    } else if (st.deco === "brick" || st.deco === "panel" || st.deco === "check") {
      withWallPlane(ctx, wall, 0, 0, (c) => {
        const S = PLANE_S;
        c.strokeStyle = st.accent!; c.fillStyle = st.accent!; c.lineWidth = st.deco === "brick" ? 3 : 2;
        if (st.deco === "brick") {
          for (let r = 0; r * 0.25 < WH; r++) {
            const z = r * 0.25;
            c.beginPath(); c.moveTo(0, -z * S); c.lineTo(N * S, -z * S); c.stroke();
            for (let u = (r % 2) * 0.3; u < N; u += 0.6) { c.beginPath(); c.moveTo(u * S, -z * S); c.lineTo(u * S, -(z + 0.25) * S); c.stroke(); }
          }
        } else if (st.deco === "panel") {
          for (let u = 0.5; u < N; u += 0.5) { c.beginPath(); c.moveTo(u * S, 0); c.lineTo(u * S, -WH * S); c.stroke(); }
          c.fillStyle = "rgba(255,255,255,0.1)";
          for (let u = 0; u < N; u += 1) c.fillRect(u * S + 3, -WH * S, 6, WH * S);
        } else {
          for (let u = 0; u < N; u += 0.5) c.fillRect(u * S, -WH * S, 0.25 * S, WH * S);
          for (let z = 0; z < WH; z += 0.5) c.fillRect(0, -(z + 0.25) * S, N * S, 0.25 * S);
        }
      });
    }
    ctx.restore();
  };
  if (st.deco) { deco("L"); deco("R"); }

  // 걸레받이
  fillPoly(ctx, [[0, 0, 0], [0, N, 0], [0, N, 0.18], [0, 0, 0.18]], shade(st.left, -0.25), null);
  fillPoly(ctx, [[0, 0, 0], [N, 0, 0], [N, 0, 0.18], [0, 0, 0.18]], shade(st.base, -0.25), null);
  // 벽 윗면(두께) + 끝 단면
  const cap = "#f4efe8", edge = "#d9d0c4";
  fillPoly(ctx, [[0, 0, WH], [0, N, WH], [-T, N, WH], [-T, -T, WH]], cap);
  fillPoly(ctx, [[0, 0, WH], [N, 0, WH], [N, -T, WH], [-T, -T, WH]], cap);
  fillPoly(ctx, [[0, N, 0], [0, N, WH], [-T, N, WH], [-T, N, 0]], edge);
  fillPoly(ctx, [[N, 0, 0], [N, 0, WH], [N, -T, WH], [N, -T, 0]], shade(edge, -0.1));
};

const drawFloor = (ctx: CanvasRenderingContext2D, flKey: string) => {
  const st = FLOORS[flKey] ?? FLOORS.fl_wood;
  // 바닥 두께 (앞 단면)
  fillPoly(ctx, [[0, N, 0], [N, N, 0], [N, N, -0.35], [0, N, -0.35]], shade(st.a, -0.3));
  fillPoly(ctx, [[N, 0, 0], [N, N, 0], [N, N, -0.35], [N, 0, -0.35]], shade(st.a, -0.42));
  fillPoly(ctx, [[0, 0, 0], [N, 0, 0], [N, N, 0], [0, N, 0]], st.a);
  ctx.save();
  polyPath(ctx, [[0, 0, 0], [N, 0, 0], [N, N, 0], [0, N, 0]].map(p => iso(...(p as V3))));
  ctx.clip();
  if (st.kind === "tile") {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) fillPoly(ctx, [[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], st.b, null);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    for (let i = 1; i < N; i++) {
      let a = iso(i, 0), b = iso(i, N); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = iso(0, i); b = iso(N, i); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  } else if (st.kind === "plank") {
    // 판자: y 방향으로 길게, 이음새는 엇갈리게
    for (let i = 0; i < N * 2; i++) {
      const y0 = i / 2;
      if (i % 2) fillPoly(ctx, [[0, y0, 0], [N, y0, 0], [N, y0 + 0.5, 0], [0, y0 + 0.5, 0]], st.b, null);
      ctx.strokeStyle = "rgba(90,55,30,0.18)"; ctx.lineWidth = 1;
      const a = iso(0, y0), b = iso(N, y0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      for (let x = (i % 4) * 0.75 + 0.6; x < N; x += 3) {
        const p = iso(x, y0), q = iso(x, y0 + 0.5);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
  } else if (st.kind === "marble") {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) fillPoly(ctx, [[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], st.b, null);
    ctx.strokeStyle = "rgba(140,140,150,0.28)"; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let x = rand(i) * N, y = rand(i + 40) * N;
      ctx.beginPath();
      let q = iso(x, y); ctx.moveTo(q.x, q.y);
      for (let k = 0; k < 4; k++) { x += (rand(i * 7 + k) - 0.3) * 0.7; y += (rand(i * 11 + k) - 0.5) * 0.5; q = iso(x, y); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    for (let i = 1; i < N; i++) {
      let a = iso(i, 0), b = iso(i, N); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = iso(0, i); b = iso(N, i); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  } else if (st.kind === "grass") {
    ctx.strokeStyle = "rgba(60,130,50,0.45)"; ctx.lineWidth = 1.2;
    for (let i = 0; i < 220; i++) {
      const p = iso(rand(i) * N, rand(i + 300) * N);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1.5, p.y - 4); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 1.5, p.y - 4); ctx.stroke();
    }
    const petals = ["#ffffff", "#ffe066", "#ffb3c6"];
    for (let i = 0; i < 18; i++) {
      const p = iso(rand(i + 900) * N, rand(i + 700) * N);
      ctx.fillStyle = petals[i % 3];
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -1.6], [0, 1.6]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, 1.7, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#f4a261"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 260; i++) {
      const p = iso(rand(i) * N, rand(i + 500) * N);
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
  }
  ctx.restore();
  // 벽과 닿는 그늘
  ctx.save();
  ctx.globalAlpha = 0.18;
  fillPoly(ctx, [[0, 0, 0], [0.5, 0, 0], [0.5, N, 0], [0, N, 0]], "#3a2a1c", null);
  fillPoly(ctx, [[0, 0, 0], [N, 0, 0], [N, 0.5, 0], [0, 0.5, 0]], "#3a2a1c", null);
  ctx.restore();
};

// ------------------------------ 가구 ------------------------------

const makePainter = (ctx: CanvasRenderingContext2D, p: FloorPlacement): Painter => {
  const c = CATALOG_MAP[p.k];
  const lw = c?.w ?? 1, ld = c?.d ?? 1;
  // 가구 기준(앞 = ly 끝) → 방 좌표. 회전하면 앞면이 오른쪽(+x)을 본다
  const W = (lx: number, ly: number, z: number): V3 => (p.r === 1 ? [p.x + ly, p.y + lx, z] : [p.x + lx, p.y + ly, z]);
  const pt = (lx: number, ly: number, z: number) => iso(...W(lx, ly, z));
  return {
    ctx, w: lw, d: ld, pt, mirror: p.r === 1,
    box: (lx, ly, z, w, d, h, color, top) =>
      p.r === 1 ? drawBox(ctx, p.x + ly, p.y + lx, z, d, w, h, color, top) : drawBox(ctx, p.x + lx, p.y + ly, z, w, d, h, color, top),
    quad: (pts, fill, stroke = true) => fillPoly(ctx, pts.map(q => W(...q)), fill, stroke ? LINE : null),
    front: (ly, lx, z, w, h, fill, stroke = true) => fillPoly(ctx, [W(lx, ly, z), W(lx + w, ly, z), W(lx + w, ly, z + h), W(lx, ly, z + h)], fill, stroke ? LINE : null),
    disc: (cx, cy, z, rx, ry, fill, stroke = true) => {
      const pts: V3[] = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(W(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z)); }
      fillPoly(ctx, pts, fill, stroke ? LINE : null);
    },
    ball: (lx, ly, z, r, fill) => {
      const q = pt(lx, ly, z);
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    },
  };
};

const makeWallPainter = (ctx: CanvasRenderingContext2D, p: WallPlacement): WallPainter => {
  const c = CATALOG_MAP[p.k];
  const W = (u: number, out: number, z: number): V3 => (p.wall === "L" ? [out, p.u + u, z] : [p.u + u, out, z]);
  return {
    ctx, w: c?.w ?? 1, z0: c?.z ?? 1, h: c?.h ?? 1, pt: (u, z, out = 0) => iso(...W(u, out, z)),
    rect: (u, z, w, h, fill, stroke = true, out = 0.01) => fillPoly(ctx, [W(u, out, z), W(u + w, out, z), W(u + w, out, z + h), W(u, out, z + h)], fill, stroke ? LINE : null),
    box: (u, out, z, w, d, h, color) =>
      p.wall === "L" ? drawBox(ctx, out, p.u + u, z, d, w, h, color) : drawBox(ctx, p.u + u, out, z, w, d, h, color),
    disc: (cu, cz, r, fill, stroke = true) => {
      const pts: V3[] = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(W(cu + Math.cos(a) * r, 0.02, cz + Math.sin(a) * r * 1.0)); }
      fillPoly(ctx, pts, fill, stroke ? LINE : null);
    },
    plane: (draw, out = 0.03) => withWallPlane(ctx, p.wall, p.u, out, draw, c?.w ?? 1),
    S: PLANE_S,
  };
};

/** 앞뒤 순서: 뒤(x+y 작은 것)부터 */
const depthKey = (p: FloorPlacement) => {
  const f = footprint(p);
  const rugFirst = CATALOG_MAP[p.k]?.cat === "rug" ? -1000 : 0;
  return rugFirst + (p.x + f.w / 2) + (p.y + f.d / 2);
};

/** 선택/미리보기 테두리용 상자 꼭짓점 (화면) */
export const itemHull = (p: Placement) => {
  const c = CATALOG_MAP[p.k];
  if (isWallPlacement(p)) {
    const w = c?.w ?? 1, z = c?.z ?? 1, h = c?.h ?? 1;
    const W = (u: number, zz: number): V3 => (p.wall === "L" ? [0, p.u + u, zz] : [p.u + u, 0, zz]);
    return [W(0, z), W(w, z), W(w, z + h), W(0, z + h)].map(q => iso(...q));
  }
  const { w, d } = footprint(p);
  const h = Math.max(0.1, c?.h ?? 1);
  const { x, y } = p;
  return ([[x, y, h], [x + w, y, h], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0], [x, y + d, h]] as V3[]).map(q => iso(...q));
};

const inPoly = (px: number, py: number, pts: { x: number; y: number }[]) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** 화면 좌표에 있는 가구 번호 (앞에 있는 것 우선, 없으면 -1) */
export const hitItem = (items: Placement[], sx: number, sy: number) => {
  const order = drawOrder(items);
  for (let i = order.length - 1; i >= 0; i--) {
    if (inPoly(sx, sy, itemHull(items[order[i]]))) return order[i];
  }
  return -1;
};

const drawOrder = (items: Placement[]) => {
  const wall = items.map((p, i) => i).filter(i => isWallPlacement(items[i]));
  const floor = items.map((p, i) => i).filter(i => !isWallPlacement(items[i]));
  floor.sort((a, b) => depthKey(items[a] as FloorPlacement) - depthKey(items[b] as FloorPlacement));
  return [...wall, ...floor];
};

const drawItem = (ctx: CanvasRenderingContext2D, p: Placement) => {
  if (isWallPlacement(p)) WALL_ART[p.k]?.(makeWallPainter(ctx, p));
  else ART[p.k]?.(makePainter(ctx, p));
};

export type DrawOpts = {
  selected?: number;
  /** 옮기는 중인 가구 미리보기 */
  ghost?: { p: Placement; ok: boolean; index: number } | null;
  showGrid?: boolean;
};

export const drawRoom = (ctx: CanvasRenderingContext2D, room: RoomData, opts: DrawOpts = {}) => {
  ctx.clearRect(0, 0, ROOM_W, ROOM_H);
  drawWalls(ctx, room.wallpaper);
  drawFloor(ctx, room.flooring);

  if (opts.showGrid) {
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    for (let i = 1; i < N; i++) {
      let a = iso(i, 0), b = iso(i, N); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = iso(0, i); b = iso(N, i); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  const items = room.items.map((p, i) => (opts.ghost && opts.ghost.index === i ? opts.ghost.p : p));
  if (opts.ghost && opts.ghost.index < 0) items.push(opts.ghost.p);
  const ghostIndex = opts.ghost ? (opts.ghost.index < 0 ? items.length - 1 : opts.ghost.index) : -1;

  // 옮기는 가구가 차지할 바닥 칸 표시
  if (opts.ghost && !isWallPlacement(opts.ghost.p)) {
    const g = opts.ghost.p, f = footprint(g);
    fillPoly(ctx, [[g.x, g.y, 0.01], [g.x + f.w, g.y, 0.01], [g.x + f.w, g.y + f.d, 0.01], [g.x, g.y + f.d, 0.01]],
      opts.ghost.ok ? "rgba(80,200,120,0.35)" : "rgba(255,90,90,0.4)", opts.ghost.ok ? "rgba(40,150,80,0.9)" : "rgba(200,40,40,0.9)", 1.5);
  }

  for (const i of drawOrder(items)) {
    ctx.save();
    if (i === ghostIndex) ctx.globalAlpha = opts.ghost!.ok ? 0.85 : 0.55;
    drawItem(ctx, items[i]);
    ctx.restore();
  }

  // 선택 테두리
  const sel = opts.ghost ? ghostIndex : opts.selected ?? -1;
  if (sel >= 0 && items[sel]) {
    const hull = itemHull(items[sel]);
    ctx.save();
    polyPath(ctx, hull);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = opts.ghost && !opts.ghost.ok ? "#ff5a5a" : "#3d8bff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
};

/** 상점 미리보기용: 가구 하나만 가운데에 그린다 */
export const drawItemPreview = (ctx: CanvasRenderingContext2D, key: string, size: number) => {
  const c = CATALOG_MAP[key];
  if (!c) return;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (c.cat === "wall") {
    const p: WallPlacement = { k: key, wall: "R", u: 0 };
    const w = c.w ?? 1, z = c.z ?? 1, h = c.h ?? 1;
    const a = iso(0, 0, z), b = iso(w, 0, z + h);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const s = Math.min(1.6, (size * 0.75) / Math.max(w * TW * 0.6, h * ZS + w * TH / 2));
    ctx.translate(size / 2, size / 2); ctx.scale(s, s); ctx.translate(-cx, -cy);
    drawItem(ctx, p);
  } else {
    const p: FloorPlacement = { k: key, x: 0, y: 0, r: 0 };
    const w = c.w ?? 1, d = c.d ?? 1, h = c.h ?? 1;
    const top = iso(0, 0, h).y, bottom = iso(w, d, 0).y;
    const left = iso(0, d).x, right = iso(w, 0).x;
    const s = Math.min(1.5, (size * 0.8) / Math.max(right - left, bottom - top));
    ctx.translate(size / 2, size / 2); ctx.scale(s, s); ctx.translate(-(left + right) / 2, -(top + bottom) / 2);
    drawItem(ctx, p);
  }
  ctx.restore();
};

/** 벽지/바닥 미리보기: 작은 방 모서리 */
export const drawSurfacePreview = (ctx: CanvasRenderingContext2D, key: string, size: number) => {
  const c = CATALOG_MAP[key];
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  const s = size / ROOM_W * 1.05;
  ctx.translate(size / 2, size / 2); ctx.scale(s, s); ctx.translate(-ROOM_W / 2, -ROOM_H / 2);
  drawWalls(ctx, c?.cat === "wallpaper" ? key : "wp_cream");
  drawFloor(ctx, c?.cat === "flooring" ? key : "fl_wood");
  ctx.restore();
};
