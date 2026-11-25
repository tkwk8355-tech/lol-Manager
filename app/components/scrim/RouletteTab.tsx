"use client";

// =============================================================
// 내전 > 룰렛 탭
// - 자유롭게 항목을 추가하고 룰렛을 돌려 하나를 뽑는다.
// - "다음"을 누르면 뽑힌 항목은 룰렛에서 빠지고 뽑힌 순서에 기록된다.
// - 항목/기록은 이 브라우저에만 저장된다(localStorage).
// =============================================================

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "scrim-roulette-v1";
const SPIN_MS = 4200;
const COLORS = [
  "#4171d6", "#e05a6b", "#3fae74", "#e2a33b", "#8b6cf0",
  "#2fb3c4", "#d9708f", "#7aa83f", "#d97a3a", "#5d7fe0",
];

// 마지막 칸이 첫 칸과 같은 색이 되지 않도록 보정
function colorAt(i: number, n: number) {
  if (n > 1 && i === n - 1 && i % COLORS.length === 0) return COLORS[1];
  return COLORS[i % COLORS.length];
}

type Saved = { items: string[]; picked: string[] };

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], picked: [] };
    const s = JSON.parse(raw);
    return {
      items: Array.isArray(s.items) ? s.items.filter((x: unknown) => typeof x === "string") : [],
      picked: Array.isArray(s.picked) ? s.picked.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch { return { items: [], picked: [] }; }
}

function randInt(n: number) {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  } catch { return Math.floor(Math.random() * n); }
}

// 각도(위쪽 0도, 시계방향) → SVG 좌표
function pt(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export default function RouletteTab() {
  const [items, setItems] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = loadSaved();
    setItems(s.items); setPicked(s.picked); setLoaded(true);
    return () => { if (spinTimer.current) clearTimeout(spinTimer.current); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, picked })); } catch { /* 저장 불가 시 무시 */ }
  }, [items, picked, loaded]);

  const locked = spinning || result !== null;

  function addFromText(text: string) {
    // 쉼표/줄바꿈으로 여러 개 한 번에 추가 가능
    const names = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    setItems((prev) => {
      const next = [...prev];
      for (const n of names) if (!next.includes(n)) next.push(n.slice(0, 20));
      return next;
    });
    setInput("");
  }
  function removeItem(name: string) { setItems((prev) => prev.filter((x) => x !== name)); }

  function spin() {
    if (locked || items.length === 0) return;
    const idx = randInt(items.length);
    const seg = 360 / items.length;
    // 칸 안에서 가장자리는 피해서 멈춤
    const target = idx * seg + seg * (0.15 + Math.random() * 0.7);
    const cur = ((rotation % 360) + 360) % 360;
    const delta = ((360 - target - cur) % 360 + 360) % 360;
    setRotation(rotation + 360 * 6 + delta);
    setSpinning(true);
    spinTimer.current = setTimeout(() => { setSpinning(false); setResult(items[idx]); }, SPIN_MS);
  }

  function next() {
    if (result === null) return;
    setItems((prev) => prev.filter((x) => x !== result));
    setPicked((prev) => [...prev, result]);
    setResult(null);
  }

  function resetAll() {
    if (spinning) return;
    // 뽑힌 항목을 다시 룰렛으로 되돌린다
    setItems((prev) => [...picked.filter((p) => !prev.includes(p)), ...prev]);
    setPicked([]); setResult(null);
  }
  function clearAll() {
    if (spinning) return;
    if (!confirm("항목과 기록을 모두 지울까요?")) return;
    setItems([]); setPicked([]); setResult(null);
  }

  // ---------- 휠 ----------
  const size = 360, c = size / 2, r = c - 6;
  const n = items.length;
  const seg = n ? 360 / n : 360;
  const fontSize = n <= 6 ? 16 : n <= 10 ? 14 : n <= 16 ? 12 : 10;
  const maxChars = n <= 8 ? 8 : n <= 16 ? 6 : 4;

  return (
    <div className="rl-wrap">
      <div className="rl-stage">
        <div className="rl-wheel-box">
          <div className="rl-pointer" aria-hidden />
          <svg
            className="rl-wheel"
            viewBox={`0 0 ${size} ${size}`}
            style={{ transform: `rotate(${rotation}deg)`, transitionDuration: spinning ? `${SPIN_MS}ms` : "0ms" }}
          >
            <circle cx={c} cy={c} r={r + 4} className="rl-rim" />
            {n === 0 && <circle cx={c} cy={c} r={r} className="rl-empty" />}
            {n === 1 && <circle cx={c} cy={c} r={r} fill={COLORS[0]} />}
            {n > 1 && items.map((name, i) => {
              const a0 = i * seg, a1 = (i + 1) * seg;
              const [x0, y0] = pt(c, c, r, a0);
              const [x1, y1] = pt(c, c, r, a1);
              const large = seg > 180 ? 1 : 0;
              const color = colorAt(i, n);
              return (
                <path key={name} d={`M${c},${c} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`} fill={color} className="rl-seg" />
              );
            })}
            {n > 0 && items.map((name, i) => {
              const mid = n === 1 ? 0 : i * seg + seg / 2;
              const label = name.length > maxChars ? name.slice(0, maxChars) + "…" : name;
              return (
                <g key={"t" + name} transform={`rotate(${mid} ${c} ${c})`}>
                  <text x={c} y={n === 1 ? c - r * 0.45 : c - r * 0.62} textAnchor="middle" dominantBaseline="middle"
                        className="rl-label" style={{ fontSize }}
                        transform={n === 1 ? undefined : `rotate(-90 ${c} ${c - r * 0.62})`}>
                    {label}
                  </text>
                </g>
              );
            })}
            <circle cx={c} cy={c} r={22} className="rl-hub" />
          </svg>
          <button className="rl-spin-btn" onClick={spin} disabled={locked || n === 0}>
            {spinning ? "…" : "GO"}
          </button>
        </div>

        <div className="rl-result">
          {result !== null ? (
            <>
              <div className="rl-eyebrow">당첨</div>
              <div className="rl-result-name">{result}</div>
              <button className="btn-primary" onClick={next}>다음 →</button>
              <div className="rl-hint">다음을 누르면 룰렛에서 빠지고 다음 차례로 넘어가요</div>
            </>
          ) : spinning ? (
            <div className="rl-result-wait">돌아가는 중…</div>
          ) : (
            <>
              <div className="rl-eyebrow">{picked.length ? `${picked.length + 1}번째 차례` : "준비"}</div>
              <button className="btn-primary rl-big" onClick={spin} disabled={n === 0}>룰렛 돌리기</button>
              <div className="rl-hint">{n === 0 ? "오른쪽에서 항목을 추가하세요" : `남은 항목 ${n}개`}</div>
            </>
          )}
        </div>
      </div>

      <div className="rl-side">
        <section className="rl-panel">
          <div className="rl-panel-head">
            <span>항목 <b>{n}</b></span>
            <span className="rl-actions">
              <button onClick={resetAll} disabled={spinning || picked.length === 0}>되돌리기</button>
              <button onClick={clearAll} disabled={spinning || (n === 0 && picked.length === 0)}>전체 삭제</button>
            </span>
          </div>
          <form className="rl-add" onSubmit={(e) => { e.preventDefault(); addFromText(input); }}>
            <input className="sc-input" value={input} disabled={locked}
                   onChange={(e) => setInput(e.target.value)} placeholder="항목 입력 (쉼표로 여러 개)" />
            <button type="submit" className="btn-primary" disabled={locked || !input.trim()}>추가</button>
          </form>
          {n === 0 ? <div className="rl-empty-msg">아직 항목이 없어요</div> : (
            <ul className="rl-chips">
              {items.map((name, i) => (
                <li key={name} style={{ ["--c" as string]: colorAt(i, n) } as React.CSSProperties}>
                  <i />{name}
                  <button onClick={() => removeItem(name)} disabled={locked} aria-label={`${name} 삭제`}>×</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rl-panel">
          <div className="rl-panel-head"><span>뽑힌 순서 <b>{picked.length}</b></span></div>
          {picked.length === 0 ? <div className="rl-empty-msg">아직 없어요</div> : (
            <ol className="rl-history">
              {picked.map((name, i) => <li key={name + i}><span>{i + 1}</span>{name}</li>)}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
