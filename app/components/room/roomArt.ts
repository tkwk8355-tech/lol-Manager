// =============================================================
// 방꾸미기 가구 그림 (전부 코드로 그린 오리지널 그림)
// - 가구 기준 좌표: lx = 가로(0~w), ly = 깊이(0 = 뒤, d = 앞), z = 높이 (칸)
// - 뒤에 있는 부분부터 그려야 앞이 덮는다
// - 새 가구: lib/roomShared.ts CATALOG에 추가하고 여기 ART / WALL_ART에 같은 key로 함수 추가
// =============================================================

type Pt = { x: number; y: number };
type P3 = [number, number, number];

export type Painter = {
  ctx: CanvasRenderingContext2D;
  w: number; d: number;
  /** 회전해서 좌우가 뒤집혔는지 (화면 좌표로 그리는 그림용) */
  mirror?: boolean;
  pt: (lx: number, ly: number, z: number) => Pt;
  box: (lx: number, ly: number, z: number, w: number, d: number, h: number, color: string, top?: string) => void;
  quad: (pts: P3[], fill: string, stroke?: boolean) => void;
  /** ly 위치의 세로 면에 사각형 (앞면 장식) */
  front: (ly: number, lx: number, z: number, w: number, h: number, fill: string, stroke?: boolean) => void;
  disc: (cx: number, cy: number, z: number, rx: number, ry: number, fill: string, stroke?: boolean) => void;
  ball: (lx: number, ly: number, z: number, r: number, fill: string) => void;
};

export type WallPainter = {
  ctx: CanvasRenderingContext2D;
  w: number; z0: number; h: number;
  pt: (u: number, z: number, out?: number) => Pt;
  rect: (u: number, z: number, w: number, h: number, fill: string, stroke?: boolean, out?: number) => void;
  box: (u: number, out: number, z: number, w: number, d: number, h: number, color: string) => void;
  disc: (cu: number, cz: number, r: number, fill: string, stroke?: boolean) => void;
  /** 벽 면에 2D로 그리기. 안에서 좌표는 (u*S, -z*S) */
  plane: (draw: (c: CanvasRenderingContext2D) => void, out?: number) => void;
  S: number;
};

const LINE = "rgba(74, 52, 40, 0.55)";

const strokeLine = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, width: number) => {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.stroke();
};

const path = (ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, stroke = true) => {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke(); }
};

const BOOKS = ["#e76f51", "#f4a261", "#2a9d8f", "#8ab17d", "#e9c46a", "#6d83c9", "#c77dff", "#ef8fa6"];

// ------------------------------ 바닥 가구 ------------------------------

export const ART: Record<string, (p: Painter) => void> = {
  bed: (P) => {
    P.box(0, 0, 0, 2, 0.22, 1.1, "#b97f55");
    P.front(0.22, 0.25, 0.75, 1.5, 0.2, "#c99068");
    P.box(0.05, 0.2, 0, 1.9, 2.75, 0.35, "#c8956a");
    P.box(0.12, 0.25, 0.35, 1.76, 2.6, 0.22, "#fffaf3");
    P.box(0.3, 0.36, 0.57, 1.4, 0.55, 0.14, "#ffffff");
    P.box(0.1, 1.15, 0.4, 1.8, 1.75, 0.22, "#f29b8b", "#f7ad9f");
    P.box(0.1, 1.15, 0.62, 1.8, 0.28, 0.02, "#fff1e8");
    P.ball(1.4, 2.2, 0.66, 2.2, "#ffffff");
    P.ball(0.7, 1.8, 0.66, 2.2, "#ffffff");
  },

  desk: (P) => {
    for (const [x, y] of [[0.08, 0.1], [1.82, 0.1], [0.08, 0.8], [1.82, 0.8]]) P.box(x, y, 0, 0.1, 0.1, 0.9, "#b88a5c");
    P.box(0, 0, 0.9, 2, 1, 0.1, "#e0b183");
    P.quad([[0.55, 0.3, 1.0], [1.35, 0.3, 1.0], [1.35, 0.3, 1.52], [0.55, 0.3, 1.52]], "#3b4252");
    P.quad([[0.6, 0.31, 1.05], [1.3, 0.31, 1.05], [1.3, 0.31, 1.47], [0.6, 0.31, 1.47]], "#86b4ea", false);
    P.box(0.55, 0.3, 1.0, 0.8, 0.5, 0.03, "#c9ced6");
    P.box(1.6, 0.5, 1.0, 0.16, 0.16, 0.16, "#ffffff");
    P.box(0.15, 0.55, 1.0, 0.3, 0.25, 0.06, "#ffd6a5");
  },

  chair: (P) => {
    P.box(0.2, 0.15, 0.55, 0.6, 0.1, 0.65, "#f2c46d");
    for (const [x, y] of [[0.22, 0.22], [0.71, 0.22], [0.22, 0.71], [0.71, 0.71]]) P.box(x, y, 0, 0.07, 0.07, 0.5, "#c99a45");
    P.box(0.18, 0.2, 0.5, 0.64, 0.62, 0.1, "#f2c46d", "#f7d38d");
  },

  sofa: (P) => {
    P.box(0, 0, 0, 2, 0.32, 1.0, "#6aa2c8");
    P.box(0, 0.1, 0, 0.26, 0.9, 0.7, "#6aa2c8");
    P.box(0.26, 0.32, 0, 1.48, 0.68, 0.42, "#7fb3d5");
    P.box(0.28, 0.34, 0.42, 0.7, 0.62, 0.14, "#a6cde6");
    P.box(1.02, 0.34, 0.42, 0.7, 0.62, 0.14, "#a6cde6");
    P.box(0.4, 0.33, 0.56, 0.35, 0.12, 0.3, "#ffd166");
    P.box(1.74, 0.1, 0, 0.26, 0.9, 0.7, "#6aa2c8");
  },

  armchair: (P) => {
    P.box(0.05, 0.05, 0, 0.9, 0.28, 0.95, "#e9a6a6");
    P.box(0.05, 0.1, 0, 0.2, 0.85, 0.65, "#e9a6a6");
    P.box(0.25, 0.33, 0, 0.5, 0.62, 0.4, "#f2b8b8");
    P.box(0.26, 0.35, 0.4, 0.48, 0.58, 0.12, "#f8d0d0");
    P.box(0.75, 0.1, 0, 0.2, 0.85, 0.65, "#e9a6a6");
  },

  lowtable: (P) => {
    for (const [x, y] of [[0.18, 0.22], [1.72, 0.22], [0.18, 0.72], [1.72, 0.72]]) P.box(x, y, 0, 0.1, 0.1, 0.38, "#b88a5c");
    P.box(0.1, 0.15, 0.38, 1.8, 0.7, 0.1, "#e8c9a0");
    P.disc(1.4, 0.5, 0.485, 0.2, 0.17, "#ffffff");
    P.ball(1.4, 0.5, 0.53, 4, "#f6b26b");
    P.box(0.45, 0.38, 0.48, 0.22, 0.22, 0.18, "#ffffff");
    P.ball(0.85, 0.62, 0.53, 3.5, "#f6a6b2");
  },

  bookshelf: (P) => {
    P.box(0.05, 0.12, 0, 0.9, 0.8, 2.2, "#a8714a");
    P.front(0.92, 0.1, 0.08, 0.8, 2.04, "#6e4630");
    let k = 0;
    for (const z of [0.1, 0.77, 1.44]) {
      let x = 0.13;
      while (x < 0.82) {
        const bw = 0.07 + ((k * 37) % 5) * 0.015;
        const bh = 0.36 + ((k * 53) % 4) * 0.06;
        if (x + bw > 0.87) break;
        P.front(0.925, x, z, bw, bh, BOOKS[k % BOOKS.length]);
        x += bw + 0.012; k++;
      }
      if (z > 0.1) P.front(0.93, 0.1, z - 0.05, 0.8, 0.05, "#a8714a");
    }
  },

  dresser: (P) => {
    P.box(0.05, 0.18, 0, 1.9, 0.8, 1.0, "#f3e3cf");
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      P.front(0.985, 0.13 + col * 0.9, 0.1 + row * 0.44, 0.82, 0.38, "#fbf1e4");
      P.ball(0.54 + col * 0.9, 0.99, 0.29 + row * 0.44, 2.4, "#c08a5a");
    }
    P.box(1.52, 0.45, 1.0, 0.12, 0.12, 0.2, "#c08a5a");
    P.ball(1.58, 0.51, 1.32, 8, "#ffe3a3");
    P.quad([[0.4, 0.5, 1.0], [0.75, 0.5, 1.0], [0.75, 0.5, 1.3], [0.4, 0.5, 1.3]], "#8b5e3c");
    P.quad([[0.45, 0.501, 1.04], [0.7, 0.501, 1.04], [0.7, 0.501, 1.26], [0.45, 0.501, 1.26]], "#bfe3ff", false);
  },

  wardrobe: (P) => {
    P.box(0.05, 0.12, 0, 1.9, 0.85, 2.4, "#c48b5f");
    P.front(0.975, 0.12, 0.1, 0.86, 2.2, "#d39b6c");
    P.front(0.975, 1.02, 0.1, 0.86, 2.2, "#d39b6c");
    P.front(0.98, 0.9, 1.0, 0.05, 0.38, "#7a5236");
    P.front(0.98, 1.05, 1.0, 0.05, 0.38, "#7a5236");
    P.box(0, 0.08, 2.4, 2, 0.93, 0.08, "#b57d52");
  },

  fridge: (P) => {
    P.box(0.08, 0.12, 0, 0.84, 0.82, 2.1, "#eef3f7");
    P.front(0.945, 0.1, 1.35, 0.8, 0.03, "#c2cbd4", false);
    P.front(0.95, 0.74, 1.45, 0.05, 0.4, "#9aa6b2");
    P.front(0.95, 0.74, 0.75, 0.05, 0.45, "#9aa6b2");
    P.front(0.95, 0.22, 0.95, 0.26, 0.28, "#fff6a8");
    P.ball(0.3, 0.95, 1.75, 3, "#ff7b7b");
    P.ball(0.48, 0.95, 1.62, 3, "#7bc4ff");
    P.ball(0.25, 0.95, 1.55, 3, "#8fd694");
  },

  counter: (P) => {
    P.box(0, 0.12, 0, 2, 0.88, 0.92, "#f1f1ee");
    P.front(1.0, 0.07, 0.08, 0.88, 0.74, "#ffffff");
    P.front(1.0, 1.05, 0.08, 0.88, 0.74, "#ffffff");
    P.ball(0.88, 1.0, 0.65, 2.2, "#9aa4ad");
    P.ball(1.12, 1.0, 0.65, 2.2, "#9aa4ad");
    P.box(-0.02, 0.1, 0.92, 2.04, 0.92, 0.08, "#a7b0b8");
    P.quad([[0.25, 0.32, 1.001], [0.95, 0.32, 1.001], [0.95, 0.82, 1.001], [0.25, 0.82, 1.001]], "#7d8790");
    P.box(0.55, 0.16, 1.0, 0.08, 0.08, 0.32, "#c9d1d8");
    P.box(0.55, 0.16, 1.28, 0.08, 0.22, 0.05, "#c9d1d8");
    P.disc(1.5, 0.55, 1.0, 0.22, 0.22, "#3d4249");
    P.box(1.35, 0.42, 1.02, 0.3, 0.28, 0.2, "#e86f5a");
  },

  tv: (P) => {
    P.box(0.1, 0.3, 0, 1.8, 0.6, 0.5, "#8a6a52");
    P.front(0.9, 0.2, 0.08, 0.75, 0.32, "#a3826a");
    P.front(0.9, 1.05, 0.08, 0.75, 0.32, "#a3826a");
    P.box(0.95, 0.5, 0.5, 0.1, 0.1, 0.08, "#2d3240");
    P.box(0.2, 0.45, 0.58, 1.6, 0.08, 0.87, "#2d3240");
    P.front(0.535, 0.27, 0.65, 1.46, 0.73, "#5b86c9", false);
    P.front(0.536, 0.3, 1.0, 0.5, 0.3, "rgba(255,255,255,0.22)", false);
    P.box(1.55, 0.6, 0.5, 0.2, 0.2, 0.12, "#4a4f5c");
  },

  gamingpc: (P) => {
    for (const [x, y] of [[0.06, 0.1], [1.84, 0.1], [0.06, 0.8], [1.84, 0.8]]) P.box(x, y, 0, 0.1, 0.1, 0.9, "#22252d");
    P.box(0, 0, 0.9, 2, 1, 0.08, "#3a3f4b");
    P.box(1.55, 0.2, 0.98, 0.35, 0.6, 0.72, "#2a2e38");
    P.front(0.8, 1.6, 1.08, 0.25, 0.52, "#8a5cff", false);
    P.box(0.62, 0.3, 0.98, 0.12, 0.12, 0.22, "#22252d");
    P.quad([[0.15, 0.3, 1.2], [1.25, 0.3, 1.2], [1.25, 0.3, 1.78], [0.15, 0.3, 1.78]], "#1b1e26");
    P.quad([[0.2, 0.31, 1.24], [1.2, 0.31, 1.24], [1.2, 0.31, 1.74], [0.2, 0.31, 1.74]], "#3d5aa8", false);
    P.quad([[0.25, 0.312, 1.3], [0.7, 0.312, 1.3], [0.7, 0.312, 1.6], [0.25, 0.312, 1.6]], "#5dd39e", false);
    P.box(0.25, 0.55, 0.98, 0.9, 0.28, 0.04, "#2a2e38");
    P.quad([[0.27, 0.8, 1.025], [1.13, 0.8, 1.025], [1.13, 0.83, 1.025], [0.27, 0.83, 1.025]], "#ff5ca8", false);
    P.disc(1.3, 0.7, 0.985, 0.08, 0.1, "#ff5ca8");
  },

  arcade: (P) => {
    P.box(0.1, 0.12, 0, 0.8, 0.7, 2.0, "#7b5cff");
    P.front(0.82, 0.15, 1.72, 0.7, 0.22, "#ffd166");
    P.front(0.82, 0.18, 1.05, 0.64, 0.58, "#1d1f3a");
    const px = [["#ff5ca8", 0.3, 1.35], ["#4fd1ff", 0.5, 1.2], ["#ffe066", 0.62, 1.45], ["#5dff9c", 0.4, 1.15]] as const;
    for (const [c, x, z] of px) P.front(0.821, x, z, 0.07, 0.07, c, false);
    P.box(0.1, 0.82, 0.9, 0.8, 0.16, 0.1, "#ff6fa3");
    P.ball(0.32, 0.9, 1.06, 3.2, "#ff3d6e");
    P.ball(0.58, 0.9, 1.03, 2.6, "#4fd1ff");
    P.ball(0.72, 0.9, 1.03, 2.6, "#ffe066");
    P.front(0.82, 0.4, 0.4, 0.2, 0.12, "#ffd166");
  },

  floorlamp: (P) => {
    const { ctx } = P;
    const b = P.pt(0.5, 0.5, 1.72), t = P.pt(0.5, 0.5, 2.2), g = P.pt(0.5, 0.5, 0);
    const glow = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, 46);
    glow.addColorStop(0, "rgba(255,226,150,0.45)"); glow.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(g.x, g.y, 46, 23, 0, 0, Math.PI * 2); ctx.fill();
    P.disc(0.5, 0.5, 0, 0.22, 0.22, "#6d6a75");
    strokeLine(ctx, P.pt(0.5, 0.5, 0.05), P.pt(0.5, 0.5, 1.75), "#6d6a75", 3);
    path(ctx, [{ x: b.x - 17, y: b.y }, { x: t.x - 9, y: t.y }, { x: t.x + 9, y: t.y }, { x: b.x + 17, y: b.y }], "#ffe1a0");
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 17, 6, 0, 0, Math.PI); ctx.fillStyle = "#ffd27a"; ctx.fill(); ctx.strokeStyle = LINE; ctx.stroke();
  },

  cushion: (P) => {
    P.box(0.15, 0.15, 0, 0.7, 0.7, 0.2, "#f6a6b2", "#f9bcc6");
    P.ball(0.5, 0.5, 0.21, 2, "#e98a9a");
  },

  plant: (P) => {
    const { ctx } = P;
    P.box(0.3, 0.3, 0, 0.4, 0.4, 0.42, "#d98b5f");
    P.box(0.27, 0.27, 0.42, 0.46, 0.46, 0.06, "#e7a173");
    P.quad([[0.32, 0.32, 0.481], [0.68, 0.32, 0.481], [0.68, 0.68, 0.481], [0.32, 0.68, 0.481]], "#6b4a33", false);
    const base = P.pt(0.5, 0.5, 0.48);
    const leaves = [-1.15, -0.6, -0.05, 0.5, 1.05, -0.3, 0.25];
    leaves.forEach((a, i) => {
      const len = i < 5 ? 19 : 14;
      const cx = base.x + Math.sin(a) * len * 0.75, cy = base.y - Math.cos(a) * len * 0.95 - 4;
      ctx.beginPath(); ctx.ellipse(cx, cy, 6.5, len * 0.62, a, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "#4c9a4a" : "#62b25c"; ctx.fill();
      ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.stroke();
    });
  },

  cat: (P) => {
    const { ctx } = P;
    const c = P.pt(0.5, 0.5, 0);
    ctx.save();
    ctx.translate(c.x, c.y);
    if (P.mirror) ctx.scale(-1, 1);
    ctx.fillStyle = "rgba(60,40,20,0.18)"; ctx.beginPath(); ctx.ellipse(0, 1, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    // 꼬리
    ctx.beginPath(); ctx.moveTo(12, -6); ctx.quadraticCurveTo(24, -4, 18, -16);
    ctx.strokeStyle = "#e39a52"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.stroke();
    // 몸
    ctx.beginPath(); ctx.ellipse(2, -9, 15, 10, 0, 0, Math.PI * 2); ctx.fillStyle = "#f3b26b"; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.strokeStyle = "#e39a52"; ctx.lineWidth = 2.2;
    for (const x of [0, 6]) { ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(x + 2, -12); ctx.stroke(); }
    // 머리 + 귀
    path(ctx, [{ x: -18, y: -22 }, { x: -16, y: -32 }, { x: -11, y: -25 }], "#f3b26b");
    path(ctx, [{ x: -8, y: -25 }, { x: -3, y: -32 }, { x: -2, y: -22 }], "#f3b26b");
    ctx.beginPath(); ctx.arc(-10, -18, 9, 0, Math.PI * 2); ctx.fillStyle = "#f3b26b"; ctx.fill(); ctx.strokeStyle = LINE; ctx.stroke();
    // 자는 눈 + 볼
    ctx.strokeStyle = "#5b3a24"; ctx.lineWidth = 1.3;
    for (const x of [-14, -6]) { ctx.beginPath(); ctx.arc(x, -18, 2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,120,120,0.45)";
    ctx.beginPath(); ctx.arc(-16, -14.5, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-4, -14.5, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  rug: (P) => {
    P.box(0.1, 0.1, 0, 1.8, 2.8, 0.03, "#e7b7a4", "#ecc2b1");
    P.quad([[0.3, 0.3, 0.031], [1.7, 0.3, 0.031], [1.7, 2.7, 0.031], [0.3, 2.7, 0.031]], "#f5dcd0", false);
    P.quad([[1.0, 0.7, 0.032], [1.45, 1.5, 0.032], [1.0, 2.3, 0.032], [0.55, 1.5, 0.032]], "#e7b7a4", false);
  },

  roundrug: (P) => {
    P.disc(1, 1, 0.02, 0.92, 0.92, "#9fd3c0");
    P.disc(1, 1, 0.022, 0.62, 0.62, "#c7e8dc", false);
    P.disc(1, 1, 0.024, 0.3, 0.3, "#9fd3c0", false);
  },

  // ---------- 추가 가구 ----------
  nightstand: (P) => {
    P.box(0.15, 0.2, 0, 0.7, 0.65, 0.6, "#d9a877");
    P.front(0.855, 0.22, 0.3, 0.56, 0.22, "#e6bb8e");
    P.ball(0.5, 0.86, 0.41, 2, "#8b5e3c");
    P.box(0.44, 0.44, 0.6, 0.12, 0.12, 0.12, "#8b5e3c");
    P.ball(0.5, 0.5, 0.88, 7, "#ffe3a3");
  },

  stool: (P) => {
    for (const [x, y] of [[0.3, 0.3], [0.62, 0.3], [0.3, 0.62], [0.62, 0.62]]) P.box(x, y, 0, 0.07, 0.07, 0.5, "#b88a5c");
    P.box(0.25, 0.25, 0.5, 0.5, 0.5, 0.1, "#ef8fa6", "#f5a9bc");
  },

  beanbag: (P) => {
    const { ctx } = P;
    const c = P.pt(0.5, 0.5, 0);
    ctx.fillStyle = "rgba(60,40,20,0.15)"; ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, 24, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 8, 22, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ff9f6b"; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c.x + (P.mirror ? -5 : 5), c.y - 19, 15, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffb68a"; ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(c.x - 8, c.y - 14, 5, 3, -0.4, 0, Math.PI * 2); ctx.fill();
  },

  teddy: (P) => {
    const { ctx } = P;
    const c = P.pt(0.5, 0.5, 0);
    const brown = "#c68a54", light = "#e8c39b";
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = "rgba(60,40,20,0.16)"; ctx.beginPath(); ctx.ellipse(0, 1, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
    const blob = (x: number, y: number, rx: number, ry: number, fill: string) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    };
    blob(-8, -3, 5, 4, brown); blob(8, -3, 5, 4, brown);
    blob(0, -11, 10, 10, brown); blob(0, -9, 5.5, 5.5, light);
    blob(-11, -14, 4, 5, brown); blob(11, -14, 4, 5, brown);
    blob(-8, -30, 4, 4, brown); blob(8, -30, 4, 4, brown);
    blob(0, -25, 9, 8, brown); blob(0, -22.5, 4.5, 3.5, light);
    ctx.fillStyle = "#3a2618";
    ctx.beginPath(); ctx.arc(-3.5, -27, 1.3, 0, Math.PI * 2); ctx.arc(3.5, -27, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -23.5, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ef5b7b"; ctx.beginPath(); ctx.moveTo(-4, -17); ctx.lineTo(0, -15); ctx.lineTo(4, -17); ctx.lineTo(4, -13); ctx.lineTo(0, -15); ctx.lineTo(-4, -13); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  cactus: (P) => {
    const { ctx } = P;
    P.box(0.33, 0.33, 0, 0.34, 0.34, 0.32, "#e0a37a");
    P.quad([[0.36, 0.36, 0.321], [0.64, 0.36, 0.321], [0.64, 0.64, 0.321], [0.36, 0.64, 0.321]], "#7a5638", false);
    const b = P.pt(0.5, 0.5, 0.32);
    const pill = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, w / 2);
      ctx.fillStyle = "#5aa469"; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    };
    pill(b.x - 9, b.y - 14, 7, 14); pill(b.x + 9, b.y - 10, 7, 12);
    ctx.fillStyle = "#5aa469"; ctx.fillRect(b.x - 9, b.y - 17, 18, 5);
    pill(b.x, b.y, 11, 32);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.x - 1, b.y - 4); ctx.lineTo(b.x - 1, b.y - 26); ctx.stroke();
    ctx.fillStyle = "#ff7aa8"; ctx.beginPath(); ctx.arc(b.x, b.y - 33, 3.5, 0, Math.PI * 2); ctx.fill();
  },

  monstera: (P) => {
    const { ctx } = P;
    P.box(0.27, 0.27, 0, 0.46, 0.46, 0.5, "#f4f1ea");
    P.quad([[0.31, 0.31, 0.501], [0.69, 0.31, 0.501], [0.69, 0.69, 0.501], [0.31, 0.69, 0.501]], "#6b4a33", false);
    const base = P.pt(0.5, 0.5, 0.5);
    const leaves: [number, number][] = [[-1.0, 34], [-0.45, 42], [0.15, 46], [0.7, 40], [1.15, 30], [-0.15, 30], [0.45, 28]];
    leaves.forEach(([a, len], i) => {
      const tip = { x: base.x + Math.sin(a) * len, y: base.y - Math.cos(a) * len };
      ctx.strokeStyle = "#3f7d3a"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo(base.x + Math.sin(a) * len * 0.3, tip.y + 12, tip.x, tip.y + 4); ctx.stroke();
      ctx.save(); ctx.translate(tip.x, tip.y); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "#3f8f45" : "#4fa552"; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = i % 2 ? "#2f6f35" : "#3a8a40"; ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) for (const k of [-4, 1]) { ctx.beginPath(); ctx.moveTo(s * 3, k); ctx.lineTo(s * 10, k - 2); ctx.stroke(); }
      ctx.restore();
    });
  },

  speaker: (P) => {
    P.box(0.3, 0.3, 0, 0.4, 0.4, 1.1, "#2f3542");
    const circle = (cz: number, r: number, fill: string) => {
      const pts: P3[] = [];
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; pts.push([0.5 + Math.cos(a) * r, 0.705, cz + Math.sin(a) * r]); }
      P.quad(pts, fill);
    };
    circle(0.35, 0.14, "#57606f"); circle(0.35, 0.06, "#1e222b");
    circle(0.82, 0.08, "#57606f");
  },

  guitar: (P) => {
    const { ctx } = P;
    const c = P.pt(0.5, 0.5, 0);
    ctx.save(); ctx.translate(c.x, c.y); if (P.mirror) ctx.scale(-1, 1); ctx.rotate(-0.18);
    ctx.strokeStyle = "#3a3f4b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(0, -14); ctx.lineTo(10, 2); ctx.stroke();
    ctx.fillStyle = "#6b4226"; ctx.fillRect(-2, -54, 4, 30);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.strokeRect(-2, -54, 4, 30);
    ctx.fillStyle = "#4a2c18"; ctx.beginPath(); ctx.roundRect(-3.5, -62, 7, 9, 2); ctx.fill();
    const body = (y: number, r: number) => { ctx.beginPath(); ctx.arc(0, y, r, 0, Math.PI * 2); ctx.fill(); };
    ctx.fillStyle = "#e07a3f"; body(-8, 12); body(-24, 9);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, -8, 12, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -24, 9, 0.6, Math.PI - 0.6, true); ctx.stroke();
    ctx.fillStyle = "#f2a46b"; body(-11, 6);
    ctx.fillStyle = "#3a2214"; body(-15, 3.5);
    ctx.fillStyle = "#3a2214"; ctx.fillRect(-4, -3, 8, 2);
    ctx.restore();
  },

  washer: (P) => {
    P.box(0.1, 0.12, 0, 0.8, 0.78, 1.0, "#f2f4f7");
    P.front(0.905, 0.12, 0.8, 0.76, 0.14, "#d6dce3");
    P.ball(0.75, 0.91, 0.87, 2.5, "#6c7a89");
    P.front(0.906, 0.2, 0.84, 0.3, 0.06, "#7bd389", false);
    const ring = (r: number, fill: string) => {
      const pts: P3[] = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([0.5 + Math.cos(a) * r, 0.906, 0.42 + Math.sin(a) * r]); }
      P.quad(pts, fill);
    };
    ring(0.27, "#c9d1d9"); ring(0.2, "#8ec5ea"); ring(0.08, "rgba(255,255,255,0.5)");
  },

  diningtable: (P) => {
    for (const [x, y] of [[0.2, 0.2], [1.7, 0.2], [0.2, 1.7], [1.7, 1.7]]) P.box(x, y, 0, 0.1, 0.1, 0.8, "#a87447");
    P.box(0.1, 0.1, 0.8, 1.8, 1.8, 0.1, "#c98f5a", "#d6a06c");
    P.quad([[0.82, 0.1, 0.901], [1.18, 0.1, 0.901], [1.18, 1.9, 0.901], [0.82, 1.9, 0.901]], "#fff8ee", false);
    for (const [x, y] of [[0.5, 0.55], [1.5, 0.55], [0.5, 1.45], [1.5, 1.45]]) P.disc(x, y, 0.905, 0.2, 0.2, "#ffffff");
    P.ball(1.5, 1.45, 0.95, 3.5, "#f4a261");
    P.ball(0.5, 0.55, 0.95, 3.5, "#8ab17d");
    P.box(0.93, 0.93, 0.9, 0.14, 0.14, 0.2, "#7fb3d5");
    P.ball(0.96, 0.96, 1.18, 3.5, "#ff7aa8"); P.ball(1.06, 1.0, 1.2, 3.5, "#ffd166"); P.ball(1.0, 1.06, 1.25, 3.5, "#ff9f6b");
  },

  aquarium: (P) => {
    P.box(0.1, 0.25, 0, 1.8, 0.6, 0.6, "#3c4a5c");
    P.box(0.1, 0.25, 0.6, 1.8, 0.6, 0.85, "#9fe0ff", "#c5eeff");
    P.front(0.852, 0.12, 0.62, 1.76, 0.1, "#e7d3a8", false);
    for (const [x, h] of [[0.3, 0.45], [0.42, 0.3], [1.55, 0.5], [1.66, 0.35]]) P.front(0.853, x, 0.7, 0.06, h, "#4caf50", false);
    const fish = (x: number, z: number, color: string, flip: boolean) => {
      P.front(0.854, x, z, 0.16, 0.08, color, false);
      P.quad(flip ? [[x + 0.16, 0.854, z + 0.04], [x + 0.24, 0.854, z + 0.09], [x + 0.24, 0.854, z - 0.01]] : [[x, 0.854, z + 0.04], [x - 0.08, 0.854, z + 0.09], [x - 0.08, 0.854, z - 0.01]], color, false);
    };
    fish(0.75, 1.05, "#ff8c42", false); fish(1.15, 0.85, "#ffd23f", true); fish(0.95, 1.22, "#ff5ca8", false);
    for (const [x, z] of [[1.4, 1.0], [1.43, 1.15], [1.38, 1.28]]) P.ball(x, 0.86, z, 1.8, "rgba(255,255,255,0.8)");
    P.box(0.05, 0.2, 1.45, 1.9, 0.7, 0.06, "#2c3a4a");
  },

  vending: (P) => {
    P.box(0.08, 0.15, 0, 0.84, 0.75, 2.2, "#e63946");
    P.front(0.9, 0.12, 1.98, 0.76, 0.16, "#ffffff");
    P.front(0.901, 0.14, 0.75, 0.52, 1.18, "#dff3ff");
    const cans = ["#ffbe0b", "#3a86ff", "#8ac926", "#ff006e"];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) P.front(0.902, 0.18 + k * 0.12, 0.82 + r * 0.28, 0.08, 0.18, cans[(r + k) % 4], false);
    P.front(0.901, 0.7, 0.95, 0.16, 0.95, "#2b2d42");
    for (let k = 0; k < 4; k++) P.ball(0.78, 0.91, 1.7 - k * 0.18, 2, "#ffd166");
    P.front(0.901, 0.14, 0.18, 0.52, 0.28, "#2b2d42");
  },

  trophy: (P) => {
    const { ctx } = P;
    P.box(0.25, 0.25, 0, 0.5, 0.5, 0.8, "#6d4c8c");
    P.front(0.751, 0.32, 0.33, 0.36, 0.16, "#ffd23f");
    P.box(0.38, 0.38, 0.8, 0.24, 0.24, 0.1, "#c9a227");
    P.box(0.46, 0.46, 0.9, 0.08, 0.08, 0.18, "#e0b830");
    const b = P.pt(0.5, 0.5, 1.08);
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#e0b830";
    ctx.beginPath(); ctx.arc(b.x - 11, b.y - 16, 5, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x + 11, b.y - 16, 5, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x - 12, b.y - 24); ctx.lineTo(b.x + 12, b.y - 24);
    ctx.quadraticCurveTo(b.x + 11, b.y - 2, b.x, b.y); ctx.quadraticCurveTo(b.x - 11, b.y - 2, b.x - 12, b.y - 24);
    const g = ctx.createLinearGradient(b.x - 12, 0, b.x + 12, 0);
    g.addColorStop(0, "#f7d154"); g.addColorStop(0.4, "#fff3b0"); g.addColorStop(1, "#c9a227");
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(b.x, b.y - 24, 12, 3.5, 0, 0, Math.PI * 2); ctx.fillStyle = "#c9a227"; ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "900 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("1", b.x, b.y - 13);
  },

  piano: (P) => {
    P.box(0.05, 0.1, 0, 1.9, 0.55, 1.35, "#2b2b33");
    P.quad([[0.7, 0.66, 0.85], [1.3, 0.66, 0.85], [1.3, 0.66, 1.15], [0.7, 0.66, 1.15]], "#fffaf0");
    P.box(0.12, 0.85, 0, 0.08, 0.08, 0.7, "#2b2b33");
    P.box(1.8, 0.85, 0, 0.08, 0.08, 0.7, "#2b2b33");
    P.box(0.05, 0.65, 0.7, 1.9, 0.32, 0.1, "#2b2b33");
    P.quad([[0.12, 0.68, 0.801], [1.88, 0.68, 0.801], [1.88, 0.94, 0.801], [0.12, 0.94, 0.801]], "#fafafa");
    for (let i = 0; i < 16; i++) {
      const x = 0.12 + i * 0.11;
      P.quad([[x, 0.68, 0.802], [x, 0.94, 0.802]].concat([[x, 0.94, 0.802]]) as P3[], "#cfcfcf", true);
      if (i % 7 !== 2 && i % 7 !== 6) P.box(x + 0.075, 0.68, 0.8, 0.05, 0.14, 0.03, "#111111");
    }
  },

  xmastree: (P) => {
    const { ctx } = P;
    P.box(0.36, 0.36, 0, 0.28, 0.28, 0.25, "#c0392b");
    P.box(0.46, 0.46, 0.25, 0.08, 0.08, 0.15, "#6b4226");
    const b = P.pt(0.5, 0.5, 0.35);
    const tiers: [number, number, number][] = [[0, 30, 26], [-18, 24, 22], [-34, 17, 18]];
    for (const [dy, hw, h] of tiers) {
      ctx.beginPath(); ctx.moveTo(b.x - hw, b.y + dy); ctx.quadraticCurveTo(b.x, b.y + dy + 6, b.x + hw, b.y + dy); ctx.lineTo(b.x, b.y + dy - h - 8); ctx.closePath();
      ctx.fillStyle = "#2f8f4e"; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    }
    const orn = ["#ff4d6d", "#ffd23f", "#4dabf7", "#ffffff", "#ff922b"];
    [[-14, -4], [10, -2], [0, -14], [-9, -24], [9, -28], [-3, -40], [17, -6], [4, -48]].forEach(([dx, dy], i) => {
      ctx.beginPath(); ctx.arc(b.x + dx, b.y + dy, 2.6, 0, Math.PI * 2); ctx.fillStyle = orn[i % orn.length]; ctx.fill();
    });
    const sx = b.x, sy = b.y - 62;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 3 : 7; ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = "#ffd23f"; ctx.fill(); ctx.strokeStyle = LINE; ctx.stroke();
    P.box(0.05, 0.62, 0, 0.3, 0.3, 0.25, "#4dabf7");
    P.box(0.05, 0.75, 0, 0.3, 0.04, 0.26, "#ffffff");
    P.box(0.68, 0.7, 0, 0.26, 0.26, 0.2, "#ff4d6d");
  },

  dog: (P) => {
    const { ctx } = P;
    const c = P.pt(0.5, 0.5, 0);
    ctx.save(); ctx.translate(c.x, c.y); if (P.mirror) ctx.scale(-1, 1);
    const blob = (x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke();
    };
    ctx.fillStyle = "rgba(60,40,20,0.16)"; ctx.beginPath(); ctx.ellipse(0, 1, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(13, -9); ctx.quadraticCurveTo(22, -14, 19, -22); ctx.strokeStyle = "#f7e7d3"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.stroke();
    blob(3, -9, 15, 10, "#fff4e6");
    blob(-6, -2, 4, 3, "#fff4e6"); blob(6, -2, 4, 3, "#fff4e6");
    blob(-10, -21, 10, 9, "#fff4e6");
    blob(-18, -20, 3.5, 7, "#c98b5a", 0.3); blob(-2, -20, 3.5, 7, "#c98b5a", -0.3);
    ctx.fillStyle = "#3a2618";
    ctx.beginPath(); ctx.arc(-13, -22, 1.4, 0, Math.PI * 2); ctx.arc(-7, -22, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-10, -18, 2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff8fa3"; ctx.beginPath(); ctx.ellipse(-10, -15, 1.8, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e63946"; ctx.fillRect(-15, -13.5, 10, 2.2);
    ctx.restore();
  },

  heartrug: (P) => {
    const pts: P3[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([1 + x / 19, 1 - y / 19 + 0.05, 0.02]);
    }
    P.quad(pts, "#ff8fab");
    P.quad(pts.map(([x, y, z]) => [1 + (x - 1) * 0.65, 1 + (y - 1) * 0.65, z + 0.002] as P3), "#ffc2d1", false);
  },

  striperug: (P) => {
    P.box(0.1, 0.1, 0, 2.8, 1.8, 0.03, "#f1e3c8");
    const colors = ["#7fb3d5", "#f4a261", "#7fb3d5"];
    colors.forEach((c, i) => P.quad([[0.35 + i * 0.8, 0.1, 0.031], [0.65 + i * 0.8, 0.1, 0.031], [0.65 + i * 0.8, 1.9, 0.031], [0.35 + i * 0.8, 1.9, 0.031]], c, false));
  },
};

// ------------------------------ 벽 장식 ------------------------------

const star = (W: WallPainter, cu: number, cz: number, r: number, fill: string) => {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(W.pt(cu + Math.cos(a) * rr, cz - Math.sin(a) * rr, 0.03));
  }
  path(W.ctx, pts, fill);
};

export const WALL_ART: Record<string, (w: WallPainter) => void> = {
  window: (W) => {
    const { z0, h, w } = W;
    W.rect(-0.02, z0, w + 0.04, h, "#fffaf2");
    W.rect(0.12, z0 + 0.1, w - 0.24, h - 0.2, "#bfe3ff", true, 0.02);
    W.rect(0.3, z0 + 0.62, 0.22, 0.36, "rgba(255,255,255,0.55)", false, 0.025);
    W.rect(w / 2 - 0.04, z0 + 0.1, 0.08, h - 0.2, "#fffaf2", false, 0.03);
    W.rect(0.12, z0 + h / 2 - 0.03, w - 0.24, 0.06, "#fffaf2", false, 0.03);
    W.box(-0.06, 0, z0 - 0.08, w + 0.12, 0.16, 0.08, "#efe3d2");
    W.rect(-0.18, z0 - 0.12, 0.24, h + 0.3, "#f4a7a0", true, 0.05);
    W.rect(w - 0.06, z0 - 0.12, 0.24, h + 0.3, "#f4a7a0", true, 0.05);
    W.rect(-0.22, z0 + h + 0.15, w + 0.44, 0.06, "#b48a5a", true, 0.06);
  },

  picture: (W) => {
    const { z0, h } = W;
    W.rect(0.1, z0, 0.8, h, "#8b5e3c");
    W.rect(0.17, z0 + 0.07, 0.66, h - 0.14, "#cfe9ff", false, 0.015);
    path(W.ctx, [[0.17, z0 + 0.07], [0.38, z0 + 0.42], [0.52, z0 + 0.28], [0.68, z0 + 0.5], [0.83, z0 + 0.3], [0.83, z0 + 0.07]].map(([u, z]) => W.pt(u, z, 0.02)), "#7cc47f", false);
    W.disc(0.66, z0 + 0.58, 0.06, "#ffd166", false);
  },

  poster: (W) => {
    const { z0, h } = W;
    W.rect(0.15, z0, 0.7, h, "#2f3b6b");
    star(W, 0.5, z0 + 0.72, 0.2, "#ffe066");
    W.rect(0.25, z0 + 0.3, 0.5, 0.07, "#ff8fab", false, 0.02);
    W.rect(0.3, z0 + 0.16, 0.4, 0.06, "#9fd3ff", false, 0.02);
    W.rect(0.13, z0 + h - 0.08, 0.12, 0.1, "rgba(255,255,255,0.7)", false, 0.025);
    W.rect(0.75, z0 + h - 0.08, 0.12, 0.1, "rgba(255,255,255,0.7)", false, 0.025);
  },

  wallshelf: (W) => {
    const { z0 } = W;
    W.box(0.25, 0, z0 - 0.25, 0.06, 0.25, 0.25, "#9b7148");
    W.box(1.69, 0, z0 - 0.25, 0.06, 0.25, 0.25, "#9b7148");
    W.box(0, 0, z0, 2, 0.35, 0.07, "#b48a5a");
    W.box(0.2, 0.06, z0 + 0.07, 0.1, 0.24, 0.36, "#e76f51");
    W.box(0.32, 0.06, z0 + 0.07, 0.1, 0.24, 0.3, "#2a9d8f");
    W.box(0.44, 0.06, z0 + 0.07, 0.08, 0.24, 0.38, "#e9c46a");
    W.box(1.0, 0.1, z0 + 0.07, 0.2, 0.18, 0.18, "#d98b5f");
    const p = W.pt(1.1, z0 + 0.36, 0.19);
    W.ctx.beginPath(); W.ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); W.ctx.fillStyle = "#62b25c"; W.ctx.fill(); W.ctx.strokeStyle = LINE; W.ctx.stroke();
    W.box(1.45, 0.1, z0 + 0.07, 0.16, 0.16, 0.12, "#ffd166");
    W.box(1.49, 0.14, z0 + 0.19, 0.08, 0.08, 0.14, "#ffd166");
  },

  clock: (W) => {
    const { z0 } = W;
    const cz = z0 + 0.35;
    W.disc(0.5, cz, 0.32, "#f6a6b2");
    W.disc(0.5, cz, 0.25, "#ffffff", false);
    const c = W.pt(0.5, cz, 0.03);
    strokeLine(W.ctx, c, W.pt(0.5, cz + 0.17, 0.03), "#3a3f4b", 2);
    strokeLine(W.ctx, c, W.pt(0.62, cz, 0.03), "#3a3f4b", 2);
    W.ctx.beginPath(); W.ctx.arc(c.x, c.y, 2, 0, Math.PI * 2); W.ctx.fillStyle = "#e76f51"; W.ctx.fill();
  },
  mirror: (W) => {
    W.plane((c) => {
      const S = W.S, cx = 0.5 * S, cz = -(W.z0 + W.h / 2) * S;
      c.beginPath(); c.ellipse(cx, cz, 0.36 * S, 0.72 * S, 0, 0, Math.PI * 2); c.fillStyle = "#d4a373"; c.fill(); c.strokeStyle = LINE; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.ellipse(cx, cz, 0.29 * S, 0.64 * S, 0, 0, Math.PI * 2);
      const g = c.createLinearGradient(cx - 12, cz - 25, cx + 12, cz + 25);
      g.addColorStop(0, "#eaf6ff"); g.addColorStop(0.5, "#bcdcf2"); g.addColorStop(1, "#e3f1fb");
      c.fillStyle = g; c.fill();
      c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - 5, cz - 14); c.lineTo(cx + 3, cz - 22); c.moveTo(cx - 5, cz - 4); c.lineTo(cx + 6, cz - 15); c.stroke();
    });
  },

  corkboard: (W) => {
    W.rect(0.05, W.z0, 1.9, W.h, "#b07d4f");
    W.rect(0.12, W.z0 + 0.07, 1.76, W.h - 0.14, "#d9a86c", false, 0.015);
    W.plane((c) => {
      const S = W.S, z = W.z0;
      const note = (u: number, zz: number, w: number, h: number, color: string, rot: number) => {
        c.save(); c.translate(u * S, -zz * S); c.rotate(rot); c.fillStyle = color; c.fillRect(-w * S / 2, -h * S / 2, w * S, h * S);
        c.strokeStyle = "rgba(0,0,0,0.15)"; c.lineWidth = 1; c.strokeRect(-w * S / 2, -h * S / 2, w * S, h * S);
        c.fillStyle = "rgba(0,0,0,0.25)"; for (let i = 0; i < 3; i++) c.fillRect(-w * S / 2 + 3, -h * S / 2 + 5 + i * 4, w * S - 6, 1.2);
        c.beginPath(); c.arc(0, -h * S / 2 + 2, 2.2, 0, Math.PI * 2); c.fillStyle = "#e63946"; c.fill(); c.restore();
      };
      note(0.45, z + 0.62, 0.42, 0.42, "#fff3a3", -0.08);
      note(1.0, z + 0.45, 0.38, 0.4, "#ffd6e0", 0.06);
      note(1.5, z + 0.6, 0.42, 0.36, "#cdeefe", -0.05);
      c.fillStyle = "#ffffff"; c.save(); c.translate(1.05 * S, -(z + 0.8) * S); c.rotate(0.04); c.fillRect(-8, -6, 16, 12); c.fillStyle = "#7cc47f"; c.fillRect(-6, -1, 12, 5); c.restore();
    });
  },

  clanflag: (W) => {
    const z0 = W.z0, h = W.h;
    W.rect(0.08, z0 + h - 0.06, 0.84, 0.06, "#8b5e3c", true, 0.04);
    W.plane((c) => {
      const S = W.S;
      c.beginPath(); c.moveTo(0.15 * S, -(z0 + h - 0.06) * S); c.lineTo(0.85 * S, -(z0 + h - 0.06) * S); c.lineTo(0.85 * S, -(z0 + 0.1) * S);
      c.lineTo(0.5 * S, -(z0 + 0.32) * S); c.lineTo(0.15 * S, -(z0 + 0.1) * S); c.closePath();
      const g = c.createLinearGradient(0, -(z0 + h) * S, 0, -z0 * S); g.addColorStop(0, "#5b7cfa"); g.addColorStop(1, "#3b5bdb");
      c.fillStyle = g; c.fill(); c.strokeStyle = LINE; c.lineWidth = 1.5; c.stroke();
      c.strokeStyle = "#ffd23f"; c.lineWidth = 2; c.beginPath(); c.moveTo(0.2 * S, -(z0 + h - 0.16) * S); c.lineTo(0.8 * S, -(z0 + h - 0.16) * S); c.stroke();
      c.fillStyle = "#ffffff"; c.font = `900 ${0.42 * S}px Pretendard, 'Malgun Gothic', sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("또", 0.5 * S, -(z0 + h * 0.58) * S);
    });
  },

  neon: (W) => {
    W.rect(0.05, W.z0, 1.9, W.h, "#1e1b2e");
    W.plane((c) => {
      const S = W.S, cz = -(W.z0 + W.h / 2) * S;
      c.font = `900 ${0.5 * S}px 'Arial Rounded MT Bold', Pretendard, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      c.shadowColor = "#ff4fd8"; c.shadowBlur = 12; c.strokeStyle = "#ff8be8"; c.lineWidth = 2.5;
      c.strokeText("GG", 0.8 * S, cz);
      c.shadowColor = "#3ff0ff"; c.strokeStyle = "#9ff8ff"; c.beginPath();
      const hx = 1.5 * S, hy = cz + 2, r = 0.12 * S;
      c.moveTo(hx, hy + r * 1.2); c.bezierCurveTo(hx - r * 2, hy - r * 0.2, hx - r * 0.8, hy - r * 1.8, hx, hy - r * 0.6);
      c.bezierCurveTo(hx + r * 0.8, hy - r * 1.8, hx + r * 2, hy - r * 0.2, hx, hy + r * 1.2); c.stroke();
      c.shadowBlur = 0;
    });
  },

  lights: (W) => {
    W.plane((c) => {
      const S = W.S, top = -(W.z0 + W.h) * S, sag = 0.35 * S;
      c.strokeStyle = "#3a3f4b"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0.05 * S, top); c.quadraticCurveTo(0.8 * S, top + sag * 2, 1.5 * S, top); c.quadraticCurveTo(2.2 * S, top + sag * 2, 2.95 * S, top); c.stroke();
      const colors = ["#ff6b6b", "#ffd93d", "#6bcB77", "#4d96ff", "#ff8fd8"];
      for (let i = 0; i < 12; i++) {
        const t = (i + 0.5) / 12, x = (0.05 + t * 2.9) * S;
        const local = (t * 2) % 1; const y = top + sag * 2 * 2 * local * (1 - local) * 1.0 + 6;
        c.shadowColor = colors[i % 5]; c.shadowBlur = 8;
        c.beginPath(); c.ellipse(x, y, 3, 4.5, 0, 0, Math.PI * 2); c.fillStyle = colors[i % 5]; c.fill();
      }
      c.shadowBlur = 0;
    });
  },
};
