// =============================================================
// 테트리스 효과음 (음원 파일 없이 Web Audio로 합성)
// - 첫 키 입력/클릭 뒤에 AudioContext를 만든다 (브라우저 자동재생 정책).
// - 이동 소리는 꾹 누를 때 너무 시끄럽지 않게 간격을 둔다.
// =============================================================

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let lastMoveAt = 0;

const audio = () => {
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
};

export const setSoundEnabled = (on: boolean) => { enabled = on; };

/** 클릭/키 입력 처리 중에 불러서 오디오를 미리 깨워 둔다 */
export const unlockAudio = () => { audio(); };

type ToneOpts = { type?: OscillatorType; from: number; to?: number; ms: number; vol: number; delay?: number; attack?: number };

const tone = ({ type = "triangle", from, to, ms, vol, delay = 0, attack = 0.004 }: ToneOpts) => {
  const ac = audio();
  if (!ac || !master) return;
  const t = ac.currentTime + delay;
  const end = t + ms / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, end);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(end + 0.02);
};

const noise = (ms: number, vol: number, cutoff: number, delay = 0) => {
  const ac = audio();
  if (!ac || !master) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + ms / 1000 + 0.02);
};

// 도레미 (C5 = 523Hz 기준)
const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

export const sfx = {
  move: () => {
    const now = performance.now();
    if (now - lastMoveAt < 35) return;
    lastMoveAt = now;
    tone({ from: 620, ms: 28, vol: 0.05 });
  },
  rotate: () => tone({ type: "square", from: 760, to: 980, ms: 45, vol: 0.035 }),
  hold: () => { tone({ type: "sine", from: 440, to: 660, ms: 80, vol: 0.09 }); tone({ type: "sine", from: 660, to: 880, ms: 70, vol: 0.06, delay: 0.06 }); },
  lock: () => tone({ type: "sine", from: 200, to: 120, ms: 60, vol: 0.12 }),
  hardDrop: () => { tone({ type: "sine", from: 170, to: 55, ms: 120, vol: 0.28 }); noise(70, 0.12, 1400); },
  clear: (lines: number) => {
    if (lines >= 4) {
      // 테트리스! 위로 올라가는 화음 + 반짝임
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) =>
        tone({ type: "triangle", from: f, ms: 260, vol: 0.12, delay: i * 0.05 }));
      tone({ type: "sine", from: NOTE.C6, ms: 500, vol: 0.08, delay: 0.3 });
      noise(250, 0.05, 6000, 0.05);
      return;
    }
    const scale = [NOTE.C5, NOTE.E5, NOTE.G5];
    for (let i = 0; i < lines; i++) tone({ type: "triangle", from: scale[i] * (1 + (lines - 1) * 0.12), ms: 160, vol: 0.11, delay: i * 0.055 });
    noise(110, 0.04, 4000);
  },
  count: () => tone({ type: "square", from: 440, ms: 110, vol: 0.06 }),
  go: () => { tone({ type: "square", from: 880, ms: 220, vol: 0.07 }); tone({ type: "triangle", from: 1320, ms: 220, vol: 0.05 }); },
  finish: () => {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone({ type: "triangle", from: f, ms: 220, vol: 0.12, delay: i * 0.1 }));
    [NOTE.C6, NOTE.E6, NOTE.G6].forEach(f => tone({ type: "triangle", from: f, ms: 700, vol: 0.07, delay: 0.42 }));
  },
  gameOver: () => {
    tone({ type: "sawtooth", from: 420, to: 70, ms: 700, vol: 0.08 });
    noise(500, 0.06, 900, 0.05);
  },
};
