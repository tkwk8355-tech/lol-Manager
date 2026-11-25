"use client";

// =============================================================
// 미니게임: 에임 연습
// - 30초 동안 화면에 떠 있는 과녁 3개를 최대한 빨리 클릭한다 (맞히면 새 과녁이 생김).
// - 점수 = 맞힌 수 × 100 + 정중앙 보너스 − 빗나간 수 × 50 (서버에서 다시 계산해서 저장)
// - 오른쪽에 이번 주 / 전체 클랜 랭킹.
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import styles from "./AimGame.module.css";
import { AIM_DURATION_MS, AIM_HIT_POINTS, AIM_MAX_BONUS, AIM_MISS_PENALTY } from "@/lib/aimGameShared";

const W = 960;
const H = 560;
const TARGET_COUNT = 3;
const R_START = 32; // 시간이 갈수록 과녁이 작아진다
const R_END = 20;
const EDGE = 60;
const MIN_GAP = 110;
const COUNTDOWN_MS = 3_000;
const SOUND_KEY = "aim-sound";
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

type Phase = "ready" | "countdown" | "playing" | "result";
type Target = { x: number; y: number; r: number; bornAt: number };
type Fx =
  | { kind: "ring"; x: number; y: number; r: number; at: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; at: number; color: string; big: boolean }
  | { kind: "shard"; x: number; y: number; vx: number; vy: number; at: number; life: number; color: string };

type Result = { score: number; hits: number; misses: number; avgMs: number; best: number; isNewBest: boolean; weekRank: number | null };
type RankRow = { userId: number; nickname: string; score: number; hits: number; misses: number; avgMs: number };
type RankRes = { ranking: RankRow[]; me: (RankRow & { rank: number }) | null; total: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// ------------------------------ 효과음 ------------------------------

let audioCtx: AudioContext | null = null;
const beep = (freq: number, to: number, ms: number, type: OscillatorType, vol: number) => {
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
  } catch { /* 소리 못 내는 환경이면 무시 */ }
};

// ------------------------------ 메인 ------------------------------

export default function AimGame() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rank, setRank] = useState<RankRes | null>(null);
  const [sound, setSound] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("ready");
  const phaseAtRef = useRef(0);
  const targetsRef = useRef<Target[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const statsRef = useRef({ hits: 0, misses: 0, bonus: 0, score: 0, combo: 0 });
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const soundRef = useRef(true);
  const floorRef = useRef<HTMLCanvasElement | null>(null);
  const periodRef = useRef<"week" | "all">("week");

  useEffect(() => {
    try { const s = localStorage.getItem(SOUND_KEY); if (s !== null) { setSound(s === "1"); soundRef.current = s === "1"; } } catch { /* 무시 */ }
  }, []);
  const toggleSound = () => {
    setSound(s => {
      soundRef.current = !s;
      try { localStorage.setItem(SOUND_KEY, !s ? "1" : "0"); } catch { /* 무시 */ }
      return !s;
    });
  };

  const goPhase = (p: Phase) => { phaseRef.current = p; phaseAtRef.current = performance.now(); setPhase(p); };

  // ---------- 랭킹 ----------
  const loadRank = useCallback(async (p: "week" | "all") => {
    const res = await fetch(`/api/minigame/aim?period=${p}`).catch(() => null);
    if (res?.ok) setRank(await res.json());
  }, []);
  useEffect(() => { periodRef.current = period; loadRank(period); }, [period, loadRank]);

  // ---------- 과녁 ----------
  const currentR = (now: number) => {
    if (phaseRef.current !== "playing") return R_START;
    const k = Math.min(1, (now - phaseAtRef.current) / AIM_DURATION_MS);
    return R_START + (R_END - R_START) * k;
  };
  const spawnTarget = (now: number): Target => {
    const r = currentR(now);
    for (let i = 0; i < 40; i++) {
      const x = rand(EDGE, W - EDGE), y = rand(EDGE + 40, H - EDGE);
      const ok = targetsRef.current.every(t => Math.hypot(t.x - x, t.y - y) > MIN_GAP)
        && (!mouseRef.current || Math.hypot(mouseRef.current.x - x, mouseRef.current.y - y) > 70);
      if (ok) return { x, y, r, bornAt: now };
    }
    return { x: rand(EDGE, W - EDGE), y: rand(EDGE + 40, H - EDGE), r, bornAt: now };
  };
  const fillTargets = (now: number) => {
    while (targetsRef.current.length < TARGET_COUNT) targetsRef.current.push(spawnTarget(now));
  };

  // ---------- 시작 / 끝 ----------
  const start = async () => {
    setError(""); setResult(null);
    const res = await fetch("/api/minigame/aim", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }),
    }).catch(() => null);
    if (!res?.ok) { setError("시작하지 못했어요. 로그인 상태를 확인해 주세요."); return; }
    statsRef.current = { hits: 0, misses: 0, bonus: 0, score: 0, combo: 0 };
    targetsRef.current = [];
    fxRef.current = [];
    goPhase("countdown");
  };

  const finish = async () => {
    goPhase("result");
    targetsRef.current = [];
    const { hits, misses, bonus } = statsRef.current;
    const res = await fetch("/api/minigame/aim", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", hits, misses, bonus }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok || !json) { setError(json?.error ?? "기록 저장에 실패했어요."); return; }
    setResult(json);
    if (soundRef.current && json.isNewBest) { beep(660, 990, 160, "triangle", 0.12); setTimeout(() => beep(990, 1480, 220, "triangle", 0.12), 140); }
    loadRank(periodRef.current);
  };

  // ---------- 클릭 ----------
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    e.preventDefault();
    const p = toCanvas(e);
    const now = performance.now();
    const st = statsRef.current;
    const idx = targetsRef.current.findIndex(t => Math.hypot(t.x - p.x, t.y - p.y) <= t.r);
    if (idx >= 0) {
      const t = targetsRef.current[idx];
      const closeness = 1 - Math.hypot(t.x - p.x, t.y - p.y) / t.r; // 1 = 정중앙
      const bonus = Math.round(AIM_MAX_BONUS * closeness);
      const perfect = closeness > 0.75;
      st.hits++; st.bonus += bonus; st.combo++;
      st.score += AIM_HIT_POINTS + bonus;
      targetsRef.current.splice(idx, 1);
      targetsRef.current.push(spawnTarget(now));
      const color = perfect ? "#ffd166" : "#ff5d6c";
      fxRef.current.push({ kind: "ring", x: t.x, y: t.y, r: t.r, at: now, color });
      fxRef.current.push({ kind: "text", x: t.x, y: t.y - t.r - 6, text: perfect ? `PERFECT +${AIM_HIT_POINTS + bonus}` : `+${AIM_HIT_POINTS + bonus}`, at: now, color, big: perfect });
      for (let i = 0; i < 12; i++) {
        const a = rand(0, Math.PI * 2), s = rand(120, 360);
        fxRef.current.push({ kind: "shard", x: t.x, y: t.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, at: now, life: rand(0.25, 0.5), color: i % 3 === 0 ? "#ffffff" : color });
      }
      if (soundRef.current) beep(perfect ? 1250 : 900, perfect ? 1900 : 1300, 70, "triangle", 0.09);
    } else {
      st.misses++; st.combo = 0;
      st.score -= AIM_MISS_PENALTY;
      fxRef.current.push({ kind: "text", x: p.x, y: p.y - 14, text: `-${AIM_MISS_PENALTY}`, at: now, color: "#9aa3b5", big: false });
      fxRef.current.push({ kind: "ring", x: p.x, y: p.y, r: 6, at: now, color: "#9aa3b5" });
      if (soundRef.current) beep(220, 140, 80, "square", 0.04);
    }
  };

  // ---------- 그리기 루프 ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ph = phaseRef.current;
      const since = now - phaseAtRef.current;
      if (ph === "countdown" && since >= COUNTDOWN_MS) { goPhase("playing"); fillTargets(performance.now()); }
      else if (ph === "playing" && since >= AIM_DURATION_MS) { finish(); }
      draw(now, dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildFloor = (dpr: number) => {
    const c = document.createElement("canvas");
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.72);
    bg.addColorStop(0, "#1f2a3a"); bg.addColorStop(0.6, "#141b27"); bg.addColorStop(1, "#0a0e15");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(120,200,255,0.05)"; g.lineWidth = 1;
    for (let x = 48; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 48; y < H; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.66);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
    return c;
  };

  const drawTarget = (ctx: CanvasRenderingContext2D, t: Target, now: number) => {
    const age = (now - t.bornAt) / 1000;
    const k = Math.min(1, age / 0.14);
    const pop = k < 1 ? 1 - Math.pow(1 - k, 3) * 1 + Math.sin(k * Math.PI) * 0.12 : 1;
    const r = t.r * pop;
    if (r <= 0.5) return;
    ctx.save();
    ctx.shadowColor = "rgba(255,70,90,0.55)";
    ctx.shadowBlur = 16;
    const rings = [
      { f: 1, c: "#ff4d5e" }, { f: 0.78, c: "#ffffff" }, { f: 0.56, c: "#ff4d5e" }, { f: 0.32, c: "#ffffff" }, { f: 0.14, c: "#ff4d5e" },
    ];
    for (const ring of rings) {
      ctx.beginPath(); ctx.arc(t.x, t.y, r * ring.f, 0, Math.PI * 2);
      ctx.fillStyle = ring.c; ctx.fill();
      ctx.shadowBlur = 0;
    }
    const shine = ctx.createRadialGradient(t.x - r * 0.4, t.y - r * 0.4, 0, t.x, t.y, r);
    shine.addColorStop(0, "rgba(255,255,255,0.35)"); shine.addColorStop(0.5, "rgba(255,255,255,0)"); shine.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fillStyle = shine; ctx.fill();
    ctx.restore();
  };

  const draw = (now: number, dt: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; floorRef.current = null; }
    floorRef.current ??= buildFloor(dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(floorRef.current, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ph = phaseRef.current;
    const since = now - phaseAtRef.current;
    const st = statsRef.current;

    // 과녁
    for (const t of targetsRef.current) drawTarget(ctx, t, now);

    // 효과
    fxRef.current = fxRef.current.filter(f => {
      const age = (now - f.at) / 1000;
      if (f.kind === "ring") {
        if (age > 0.35) return false;
        const k = age / 0.35;
        ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + k * 30, 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === "text") {
        if (age > 0.7) return false;
        const k = age / 0.7;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `900 ${f.big ? 17 : 15}px ${FONT}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeText(f.text, f.x, f.y - k * 34);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * 34);
      } else {
        if (age > f.life) return false;
        const k = age / f.life;
        f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(0.02, dt); f.vy *= Math.pow(0.02, dt);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, 2.6 * (1 - k) + 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return true;
    });

    // 위쪽 정보
    if (ph === "playing" || ph === "result") {
      const left = ph === "playing" ? Math.max(0, AIM_DURATION_MS - since) : 0;
      const frac = left / AIM_DURATION_MS;
      const urgent = left < 5_000 && ph === "playing";
      // 시간 바
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 0, W, 5);
      const bar = ctx.createLinearGradient(0, 0, W, 0);
      bar.addColorStop(0, urgent ? "#ff5a5a" : "#4fd1ff"); bar.addColorStop(1, urgent ? "#ff9e64" : "#7aa2f7");
      ctx.fillStyle = bar; ctx.fillRect(0, 0, W * frac, 5);

      const pill = (x: number, label: string, value: string, color: string, align: "left" | "right") => {
        ctx.font = `900 24px ${FONT}`;
        const vw = ctx.measureText(value).width;
        ctx.font = `700 12px ${FONT}`;
        const lw = ctx.measureText(label).width;
        const w = Math.max(vw, lw) + 32, h = 54;
        const px = align === "left" ? x : x - w;
        roundRect(ctx, px, 18, w, h, 14);
        ctx.fillStyle = "rgba(8,10,16,0.66)"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillText(label, px + 16, 38);
        ctx.font = `900 24px ${FONT}`; ctx.fillStyle = color; ctx.fillText(value, px + 16, 63);
      };
      const acc = st.hits + st.misses > 0 ? Math.round((st.hits / (st.hits + st.misses)) * 100) : 100;
      pill(18, "점수", Math.max(0, st.score).toLocaleString(), "#ffffff", "left");
      pill(W - 18, "남은 시간", (left / 1000).toFixed(1), urgent ? "#ff5a5a" : "#4fd1ff", "right");
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`🎯 ${st.hits}   ✕ ${st.misses}   명중률 ${acc}%${st.combo >= 5 ? `   🔥 ${st.combo}연속` : ""}`, W / 2, 34);
    }

    // 카운트다운
    if (ph === "countdown") {
      const msLeft = Math.max(0, COUNTDOWN_MS - since);
      const n = Math.max(1, Math.ceil(msLeft / 1000));
      const inSec = (msLeft % 1000) / 1000;
      ctx.fillStyle = "rgba(5,7,12,0.45)"; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const s = 1 + Math.pow(inSec, 3) * 0.7;
      ctx.scale(s, s);
      ctx.font = `900 130px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(79,209,255,0.9)"; ctx.shadowBlur = 30;
      const g = ctx.createLinearGradient(0, -60, 0, 60);
      g.addColorStop(0, "#e8fbff"); g.addColorStop(1, "#4fd1ff");
      ctx.fillStyle = g; ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }

    // 조준선
    const m = mouseRef.current;
    if (m && (ph === "playing" || ph === "countdown")) {
      ctx.save();
      ctx.strokeStyle = "#5dff9c"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 3;
      const gap = 5, len = 9;
      ctx.beginPath();
      ctx.moveTo(m.x - gap - len, m.y); ctx.lineTo(m.x - gap, m.y);
      ctx.moveTo(m.x + gap, m.y); ctx.lineTo(m.x + gap + len, m.y);
      ctx.moveTo(m.x, m.y - gap - len); ctx.lineTo(m.x, m.y - gap);
      ctx.moveTo(m.x, m.y + gap); ctx.lineTo(m.x, m.y + gap + len);
      ctx.stroke();
      ctx.fillStyle = "#5dff9c";
      ctx.beginPath(); ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  // ---------- 화면 ----------
  const playing = phase === "playing" || phase === "countdown";
  const accuracy = result && result.hits + result.misses > 0 ? Math.round((result.hits / (result.hits + result.misses)) * 100) : 0;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>🎯 에임 연습</h2>
          <p className={styles.sub}>30초 동안 과녁을 최대한 빨리 맞히세요. 정중앙일수록 보너스, 빗나가면 감점이에요.</p>
        </div>
        <button className={styles.soundBtn} onClick={toggleSound} aria-label={sound ? "소리 끄기" : "소리 켜기"}>
          {sound ? "🔊 소리 켜짐" : "🔇 소리 꺼짐"}
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.stageCol}>
          <div className={styles.stage}>
            <canvas
              ref={canvasRef}
              className={`${styles.canvas} ${playing ? styles.aiming : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={e => { mouseRef.current = toCanvas(e); }}
              onPointerLeave={() => { mouseRef.current = null; }}
              onContextMenu={e => e.preventDefault()}
            />

            {phase === "ready" && (
              <div className={styles.overlay}>
                <div className={styles.card}>
                  <div className={styles.bigIcon}>🎯</div>
                  <h3>준비됐나요?</h3>
                  <ul className={styles.rules}>
                    <li>과녁은 항상 3개, 맞히면 바로 새로 생겨요</li>
                    <li>시간이 갈수록 과녁이 작아져요</li>
                    <li>맞히면 +{AIM_HIT_POINTS} (정중앙 최대 +{AIM_MAX_BONUS}) · 빗나가면 −{AIM_MISS_PENALTY}</li>
                  </ul>
                  <button className={`btn-primary ${styles.startBtn}`} onClick={start}>시작하기</button>
                </div>
              </div>
            )}

            {phase === "result" && (
              <div className={styles.overlay}>
                <div className={styles.card}>
                  {result ? (
                    <>
                      {result.isNewBest && <div className={styles.newBest}>🎉 개인 신기록!</div>}
                      <div className={styles.scoreLabel}>점수</div>
                      <div className={styles.score}>{result.score.toLocaleString()}</div>
                      <div className={styles.stats}>
                        <div><b>{result.hits}</b><span>맞힘</span></div>
                        <div><b>{accuracy}%</b><span>명중률</span></div>
                        <div><b>{result.avgMs ? `${result.avgMs}ms` : "-"}</b><span>평균 간격</span></div>
                      </div>
                      <div className={styles.meta}>
                        내 최고 {result.best.toLocaleString()}점{result.weekRank ? ` · 이번 주 ${result.weekRank}위` : ""}
                      </div>
                      <button className={`btn-primary ${styles.startBtn}`} onClick={start}>다시 하기</button>
                    </>
                  ) : error ? (
                    <>
                      <p className={styles.errorText}>{error}</p>
                      <button className={`btn-primary ${styles.startBtn}`} onClick={start}>다시 하기</button>
                    </>
                  ) : (
                    <div className={styles.saving}>기록 저장 중…</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {error && phase === "ready" && <div className={styles.error}>{error}</div>}
        </div>

        <aside className={`ui-card ${styles.rank}`}>
          <div className={styles.rankHead}>
            <b>🏆 클랜 랭킹</b>
            <div className={styles.tabs}>
              <button className={period === "week" ? styles.on : ""} onClick={() => setPeriod("week")}>이번 주</button>
              <button className={period === "all" ? styles.on : ""} onClick={() => setPeriod("all")}>전체</button>
            </div>
          </div>
          {!rank ? (
            <p className={styles.empty}>불러오는 중…</p>
          ) : rank.ranking.length === 0 ? (
            <p className={styles.empty}>{period === "week" ? "이번 주 기록이 아직 없어요. 1등을 차지해 보세요!" : "아직 기록이 없어요."}</p>
          ) : (
            <ol className={styles.rankList}>
              {rank.ranking.map((r, i) => (
                <li key={r.userId} className={r.userId === user?.userId ? styles.mine : ""}>
                  <span className={styles.pos}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                  <span className={styles.name}>{r.nickname}</span>
                  <span className={styles.pts}>{r.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
          {rank?.me && !rank.ranking.some(r => r.userId === rank.me!.userId) && (
            <div className={styles.myRow}>
              <span className={styles.pos}>{rank.me.rank}</span>
              <span className={styles.name}>{rank.me.nickname} (나)</span>
              <span className={styles.pts}>{rank.me.score.toLocaleString()}</span>
            </div>
          )}
          {rank && rank.total > 0 && <p className={styles.rankFoot}>참가 {rank.total}명 · 1인 최고 기록 기준</p>}
        </aside>
      </div>
    </div>
  );
}
