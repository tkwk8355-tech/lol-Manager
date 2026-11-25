"use client";

// =============================================================
// 미니게임: 폭탄돌리기
// - 방 목록 → 방 입장 → 방장이 "고!" → 3초 카운트다운 → 15초 라운드 → 폭탄 든 사람 탈락
// - WASD(또는 방향키)로 이동. 폭탄 든 사람이 다른 사람과 부딪히면 폭탄이 넘어간다.
// - 내 위치는 화면에서 바로 움직이고(예측), 0.05초마다 서버에 보내 방 상태를 받아온다.
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import styles from "./BombGame.module.css";
import { createFx, renderFrame, spawnConfetti, type Vec } from "./bombRender";
import {
  ARENA_H, ARENA_W, HOLDER_SPEED, PLAYER_R, SPEED,
  type BombRoomSummary, type BombRoomView,
} from "@/lib/bombGameShared";

const SYNC_INTERVAL_MS = 50;
const ROOM_LIST_INTERVAL_MS = 2_000;
const SNAP_DISTANCE = 60; // 서버 위치와 이만큼 벌어지면 서버 위치로 맞춘다

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

const STATUS_LABEL: Record<BombRoomView["status"], string> = {
  lobby: "대기 중", countdown: "곧 시작", playing: "진행 중", boom: "펑!", done: "게임 끝",
};

const postBomb = async (body: Record<string, unknown>) => {
  const res = await fetch("/api/minigame/bomb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || "요청 실패"), { status: res.status });
  return json;
};

export default function BombGame() {
  const [roomId, setRoomId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const enterRoom = useCallback((id: number) => { setNotice(""); setRoomId(id); }, []);
  const exitRoom = useCallback((message?: string) => { setRoomId(null); setNotice(message ?? ""); }, []);

  return roomId === null
    ? <RoomList notice={notice} onEnter={enterRoom} />
    : <BombRoom roomId={roomId} onExit={exitRoom} />;
}

// ------------------------------ 방 목록 ------------------------------

function RoomList({ notice, onEnter }: { notice: string; onEnter: (id: number) => void }) {
  const [rooms, setRooms] = useState<BombRoomSummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setError(notice); }, [notice]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/minigame/bomb").catch(() => null);
      if (!alive || !res?.ok) return;
      const json = await res.json();
      setRooms(json.rooms ?? []);
    };
    load();
    const t = setInterval(load, ROOM_LIST_INTERVAL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const json = await postBomb(body);
      onEnter(json.room.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.listHead}>
        <div>
          <h2 className={styles.title}>💣 폭탄돌리기</h2>
          <p className={styles.sub}>폭탄을 든 채로 다른 사람에게 부딪히면 폭탄이 넘어가요. 15초 뒤 폭탄을 들고 있는 사람이 탈락하고, 마지막 1명이 우승이에요.</p>
        </div>
        <form className={styles.createForm} onSubmit={e => { e.preventDefault(); run({ action: "create", name }); }}>
          <input className={styles.input} placeholder="방 이름 (선택)" value={name} maxLength={30} onChange={e => setName(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={busy}>+ 방 만들기</button>
        </form>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {rooms.length === 0 && <p className="ui-empty">열린 방이 없어요. 방을 만들어 친구들을 불러 보세요.</p>}
      <div className={styles.roomList}>
        {rooms.map(r => (
          <div key={r.id} className={`ui-card ${styles.roomRow}`}>
            <div className={styles.roomMain}>
              <span className={styles.roomName}>{r.name}</span>
              <span className={styles.roomMeta}>방장 {r.hostNickname} · {r.playerCount}명</span>
            </div>
            <span className={`${styles.badge} ${styles[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            <button className="btn-secondary" disabled={busy} onClick={() => run({ action: "join", roomId: r.id })}>입장</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------ 게임 방 ------------------------------

function BombRoom({ roomId, onExit }: { roomId: number; onExit: (message?: string) => void }) {
  const { user } = useAuth();
  const myId = user?.userId ?? null;
  const [view, setView] = useState<BombRoomView | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<BombRoomView | null>(null);
  const myPosRef = useRef<Vec | null>(null);
  const myPosVersionRef = useRef(0);
  const renderPosRef = useRef(new Map<number, Vec>());
  const keysRef = useRef(new Set<string>());
  const clockOffsetRef = useRef(0); // 서버시간 - 내 시간
  const fxRef = useRef(createFx()); // 화면 효과 상태 (bombRender.ts)

  const serverNow = () => Date.now() + clockOffsetRef.current;

  const canMove = (v: BombRoomView | null) => {
    const me = v?.players.find(p => p.userId === myId);
    return !!me && me.alive && (v!.status === "lobby" || v!.status === "playing" || v!.status === "done");
  };

  const applyView = useCallback((room: BombRoomView) => {
    const prev = viewRef.current;
    clockOffsetRef.current = room.serverNow - Date.now();
    const me = room.players.find(p => p.userId === myId);
    if (me) {
      const local = myPosRef.current;
      const far = local && Math.hypot(local.x - me.x, local.y - me.y) > SNAP_DISTANCE;
      if (!local || me.posVersion !== myPosVersionRef.current || far) {
        myPosRef.current = { x: me.x, y: me.y };
        myPosVersionRef.current = me.posVersion;
      }
    }
    const fx = fxRef.current;
    if (room.status !== prev?.status) fx.statusAt = Date.now();
    if (room.status === "boom" && prev?.status !== "boom" && room.lastExploded !== null) {
      fx.boom = { userId: room.lastExploded, at: Date.now(), spawned: false };
    }
    if (room.status === "done" && prev?.status !== "done" && room.winnerId !== null) spawnConfetti(fx);
    if (room.status === "playing" && prev?.status === "playing"
        && room.bombHolder !== null && room.bombHolder !== prev.bombHolder) {
      fx.pass = { userId: room.bombHolder, at: Date.now() };
    }
    viewRef.current = room;
    setView(room);
  }, [myId]);

  // 서버 동기화 루프
  useEffect(() => {
    let running = true;
    const loop = async () => {
      while (running) {
        const startedAt = Date.now();
        const v = viewRef.current;
        const pos = canMove(v) ? myPosRef.current : null;
        try {
          const json = await postBomb({ action: "sync", roomId, ...(pos ? { x: pos.x, y: pos.y } : {}) });
          if (running) applyView(json.room);
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 404 || status === 401) { if (running) onExit((err as Error).message); return; }
        }
        await new Promise(r => setTimeout(r, Math.max(0, SYNC_INTERVAL_MS - (Date.now() - startedAt))));
      }
    };
    loop();
    return () => { running = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, applyView, onExit]);

  // 페이지를 떠나면 방에서 나간다.
  useEffect(() => {
    const leave = () => {
      fetch("/api/minigame/bomb", {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", roomId }),
      }).catch(() => {});
    };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); };
  }, [roomId]);

  // 키 입력
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || !KEY_DIRS[e.code]) return;
      e.preventDefault();
      keysRef.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => { keysRef.current.delete(e.code); };
    const clear = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // 이동 + 그리기 루프
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const v = viewRef.current;
      const pos = myPosRef.current;
      if (v && pos && canMove(v)) {
        let dx = 0, dy = 0;
        keysRef.current.forEach(code => { dx += KEY_DIRS[code][0]; dy += KEY_DIRS[code][1]; });
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const speed = v.bombHolder === myId ? HOLDER_SPEED : SPEED;
          pos.x = Math.min(ARENA_W - PLAYER_R, Math.max(PLAYER_R, pos.x + (dx / len) * speed * dt));
          pos.y = Math.min(ARENA_H - PLAYER_R, Math.max(PLAYER_R, pos.y + (dy / len) * speed * dt));
        }
      }
      draw(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const draw = (dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const v = viewRef.current;

    // 다른 사람 위치는 부드럽게 따라가게 보간, 내 위치는 바로 사용
    const positions = new Map<number, Vec>();
    for (const p of v?.players ?? []) {
      if (p.userId === myId && myPosRef.current) { positions.set(p.userId, myPosRef.current); continue; }
      const rp = renderPosRef.current.get(p.userId) ?? { x: p.x, y: p.y };
      const k = Math.min(1, dt * 14);
      if (Math.hypot(p.x - rp.x, p.y - rp.y) > 150) { rp.x = p.x; rp.y = p.y; }
      rp.x += (p.x - rp.x) * k;
      rp.y += (p.y - rp.y) * k;
      renderPosRef.current.set(p.userId, rp);
      positions.set(p.userId, rp);
    }

    renderFrame(canvas, fxRef.current, { view: v, positions, myId, serverNow: serverNow(), dt });
  };

  const act = async (action: "start" | "lobby") => {
    setError("");
    try { applyView((await postBomb({ action, roomId })).room); }
    catch (err) { setError((err as Error).message); }
  };

  const leave = async () => {
    await postBomb({ action: "leave", roomId }).catch(() => {});
    onExit();
  };

  const isHost = !!view && view.hostId === myId;
  const aliveCount = view?.players.filter(p => p.alive).length ?? 0;
  const me = view?.players.find(p => p.userId === myId);
  const holderNick = view?.players.find(p => p.userId === view.bombHolder)?.nickname;

  return (
    <div className={styles.page}>
      <div className={styles.roomBar}>
        <button className="btn-secondary" onClick={leave}>← 나가기</button>
        <span className={styles.roomTitle}>{view?.name ?? "불러오는 중…"}</span>
        {view && view.round > 0 && <span className={styles.round}>라운드 {view.round} · 생존 {aliveCount}명</span>}
        <span className={styles.spacer} />
        {isHost && view?.status === "lobby" && (
          <button className="btn-primary" disabled={view.players.length < 2} onClick={() => act("start")}>
            {view.players.length < 2 ? "2명 이상 필요" : "💣 고!"}
          </button>
        )}
        {isHost && view?.status === "done" && (
          <>
            <button className="btn-secondary" onClick={() => act("lobby")}>대기실로</button>
            <button className="btn-primary" onClick={() => act("start")}>💣 한 판 더</button>
          </>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.status}>
        {view?.status === "lobby" && (isHost ? "다 모이면 ‘고!’를 눌러 시작하세요. 기다리는 동안 WASD로 움직여 볼 수 있어요." : "방장이 시작할 때까지 기다려 주세요. WASD로 움직여 볼 수 있어요.")}
        {view?.status === "countdown" && (view.bombHolder === myId ? "💣 폭탄이 나한테 있어요! 시작하면 다른 사람에게 부딪히세요." : `💣 ${holderNick ?? ""}에게 폭탄이 있어요. 도망치세요!`)}
        {view?.status === "playing" && (me && !me.alive ? "탈락했어요. 관전 중…" : view.bombHolder === myId ? "💣 폭탄이 나한테 있어요! 빨리 넘기세요!" : `💣 ${holderNick ?? ""}에게서 도망치세요!`)}
        {view?.status === "boom" && "다음 라운드를 준비 중…"}
        {view?.status === "done" && (view.winnerId === myId ? "🏆 우승했어요!" : isHost ? "‘한 판 더’로 바로 다시 시작할 수 있어요." : "방장이 다시 시작할 때까지 기다려 주세요.")}
      </div>

      <div className={styles.arenaWrap}>
        <canvas ref={canvasRef} className={styles.arena} />
      </div>

      <div className={styles.players}>
        {view?.players.map(p => (
          <span key={p.userId} className={`${styles.chip} ${p.alive ? "" : styles.dead}`}>
            <i style={{ background: p.color }} />
            {p.nickname}
            {p.userId === view.hostId && <em>방장</em>}
            {p.userId === view.bombHolder && " 💣"}
          </span>
        ))}
      </div>
      <p className={styles.help}>이동: W A S D (방향키도 돼요) · 폭탄 든 사람은 조금 더 빨라요</p>
    </div>
  );
}
