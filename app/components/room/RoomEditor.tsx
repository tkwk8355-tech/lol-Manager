"use client";

// =============================================================
// 방꾸미기 (콘텐츠 > 방꾸미기)
// - 왼쪽: 내 방. 가구를 끌어서 옮기고, 선택하면 회전 · 보관
// - 오른쪽: 가구 / 벽지·바닥 / 프로필(아이콘 · 테두리) — 가진 건 놓기·적용·착용, 없는 건 포인트로 구매
// - 배치는 [저장]을 눌러야 반영. 아이콘 · 테두리는 고르면 바로 반영
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import ProfileAvatar from "../ProfileAvatar";
import {
  CATALOG, CATALOG_MAP, FREE_FOR_NOW, MAX_COPIES, ROOM_SIZE, availableCount, canPlace, findFreeSpot, footprint, isOnceOnly, isWallPlacement, priceOf,
  type CatalogItem, type Placement, type RoomData,
} from "@/lib/roomShared";
import { ROOM_H, ROOM_W, drawItemPreview, drawRoom, drawSurfacePreview, hitItem, screenToFloor, screenToWall } from "./roomRender";
import styles from "./RoomEditor.module.css";

type Owned = Record<string, number>;
type Res = { owner: { userId: number; nickname: string; role: string; frame: string; icon: string }; room: RoomData; owned: Owned; points: number | null };
type Tab = "furniture" | "surface" | "profile";
type Drag = { index: number; sx: number; sy: number; offX: number; offY: number; moved: boolean; ghost: Placement | null; ok: boolean };

const FURNITURE = CATALOG.filter(c => c.cat === "floor" || c.cat === "rug" || c.cat === "wall");
const SURFACES = CATALOG.filter(c => c.cat === "wallpaper" || c.cat === "flooring");
const FRAMES = CATALOG.filter(c => c.cat === "frame");
const ICONS = CATALOG.filter(c => c.cat === "icon");

const post = async (body: unknown) => {
  const res = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = await res?.json().catch(() => null);
  if (!res?.ok) throw new Error(json?.error ?? "요청에 실패했어요.");
  return json;
};

/** 상점 카드 그림 */
function Thumb({ item }: { item: CatalogItem }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 76;
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (item.cat === "wallpaper" || item.cat === "flooring") drawSurfacePreview(ctx, item.key, size);
    else drawItemPreview(ctx, item.key, size);
  }, [item]);
  return <canvas ref={ref} className={styles.thumb} />;
}

export default function RoomEditor() {
  const { user, loading, openAuthModal } = useAuth();
  const [data, setData] = useState<Res | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState(-1);
  const [tab, setTab] = useState<Tab>("furniture");
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [pendingBuy, setPendingBuy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<RoomData | null>(null);
  const selectedRef = useRef(-1);
  const dragRef = useRef<Drag | null>(null);
  roomRef.current = room;
  selectedRef.current = selected;

  const dirty = !!room && JSON.stringify(room) !== saved;

  // ---------- 불러오기 ----------
  const userId = user?.userId;
  useEffect(() => {
    if (!userId) return;
    fetch("/api/room")
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Res; })
      .then(j => { setData(j); setRoom(j.room); setSaved(JSON.stringify(j.room)); })
      .catch(e => setError(e.message || "불러오지 못했어요."));
  }, [userId]);

  const flash = (text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    window.setTimeout(() => setMsg(m => (m?.text === text ? null : m)), 2600);
  };

  // 저장 안 하고 나가려 하면 확인
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // ---------- 그리기 ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current, r = roomRef.current;
    if (!canvas || !r) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.max(0.5, (canvas.clientWidth || ROOM_W) / ROOM_W) * dpr;
    const pw = Math.round(ROOM_W * scale);
    if (canvas.width !== pw) { canvas.width = pw; canvas.height = Math.round(ROOM_H * scale); }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const d = dragRef.current;
    drawRoom(ctx, r, {
      selected: selectedRef.current,
      ghost: d?.moved && d.ghost ? { p: d.ghost, ok: d.ok, index: d.index } : null,
      showGrid: !!d?.moved,
    });
  }, []);

  useEffect(() => { draw(); }, [room, selected, draw]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, room === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 배치 바꾸기 ----------
  const updateItems = (fn: (items: Placement[]) => Placement[]) => setRoom(r => (r ? { ...r, items: fn(r.items.slice()) } : r));

  const rotateSelected = () => {
    const r = roomRef.current, i = selectedRef.current;
    if (!r || i < 0) return;
    const p = r.items[i];
    if (isWallPlacement(p)) return;
    const np = { ...p, r: (p.r === 1 ? 0 : 1) as 0 | 1 };
    // 돌렸을 때 방 밖으로 나가면 안쪽으로 당겨 본다
    const f = footprint(np);
    np.x = Math.min(np.x, ROOM_SIZE - f.w); np.y = Math.min(np.y, ROOM_SIZE - f.d);
    if (!canPlace(r.items, np, i)) { flash("자리가 좁아서 돌릴 수 없어요.", "err"); return; }
    updateItems(items => { items[i] = np; return items; });
  };

  const removeSelected = () => {
    const i = selectedRef.current;
    if (i < 0) return;
    updateItems(items => { items.splice(i, 1); return items; });
    setSelected(-1);
  };

  const placeNew = (key: string) => {
    const r = roomRef.current;
    if (!r) return;
    const spot = findFreeSpot(r.items, key);
    if (!spot) { flash("빈 자리가 없어요. 다른 가구를 옮기거나 보관해 주세요.", "err"); return; }
    updateItems(items => [...items, spot]);
    setSelected(r.items.length);
  };

  // ---------- 마우스/터치 ----------
  const toRoom = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * ROOM_W, y: ((e.clientY - rect.top) / rect.height) * ROOM_H };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = roomRef.current;
    if (!r || e.button > 0) return;
    const { x, y } = toRoom(e);
    const idx = hitItem(r.items, x, y);
    setSelected(idx);
    selectedRef.current = idx;
    if (idx < 0) { draw(); return; }
    const p = r.items[idx];
    let offX = 0, offY = 0;
    if (isWallPlacement(p)) offX = screenToWall(x).u - p.u;
    else { const f = screenToFloor(x, y); offX = f.x - p.x; offY = f.y - p.y; }
    dragRef.current = { index: idx, sx: e.clientX, sy: e.clientY, offX, offY, moved: false, ghost: null, ok: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current, r = roomRef.current;
    if (!d || !r) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    d.moved = true;
    const { x, y } = toRoom(e);
    const p = r.items[d.index];
    const c = CATALOG_MAP[p.k];
    if (isWallPlacement(p)) {
      const sw = screenToWall(x);
      const w = c?.w ?? 1;
      const off = sw.wall === p.wall ? d.offX : w / 2;
      const u = Math.max(0, Math.min(ROOM_SIZE - w, Math.round(sw.u - off)));
      d.ghost = { k: p.k, wall: sw.wall, u };
    } else {
      const f = screenToFloor(x, y);
      const fp = footprint(p);
      const nx = Math.max(0, Math.min(ROOM_SIZE - fp.w, Math.round(f.x - d.offX)));
      const ny = Math.max(0, Math.min(ROOM_SIZE - fp.d, Math.round(f.y - d.offY)));
      d.ghost = { ...p, x: nx, y: ny };
    }
    d.ok = canPlace(r.items, d.ghost, d.index);
    draw();
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved && d.ghost) {
      if (d.ok) { const g = d.ghost; updateItems(items => { items[d.index] = g; return items; }); }
      else flash("그 자리엔 놓을 수 없어요.", "err");
    }
    draw();
  };

  // 키보드: R 회전 · Delete 보관 · Esc 선택 해제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (selectedRef.current < 0) return;
      if (e.code === "KeyR") { e.preventDefault(); rotateSelected(); }
      else if (e.code === "Delete" || e.code === "Backspace") { e.preventDefault(); removeSelected(); }
      else if (e.code === "Escape") setSelected(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 서버 ----------
  const buy = async (item: CatalogItem) => {
    if (pendingBuy !== item.key) {
      setPendingBuy(item.key);
      window.setTimeout(() => setPendingBuy(k => (k === item.key ? null : k)), 3000);
      return;
    }
    setPendingBuy(null); setBusy(true);
    try {
      const j = await post({ action: "buy", key: item.key });
      setData(d => (d ? { ...d, owned: j.owned, points: j.points } : d));
      flash(`${item.name}을(를) 샀어요! (-${priceOf(item)}P)`);
    } catch (e) {
      flash((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!room) return;
    setBusy(true);
    try {
      const j = await post({ action: "save", ...room });
      setRoom(j.room); setSaved(JSON.stringify(j.room));
      flash("방을 저장했어요.");
    } catch (e) {
      flash((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  const equip = async (kind: "frame" | "icon", key: string) => {
    setBusy(true);
    try {
      await post({ action: kind, key });
      setData(d => (d ? { ...d, owner: { ...d.owner, [kind]: key } } : d));
      window.dispatchEvent(new Event("profile-updated"));
      flash(kind === "frame" ? "프로필 테두리를 바꿨어요." : "프로필 아이콘을 바꿨어요.");
    } catch (e) {
      flash((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  // ---------- 화면 ----------
  if (loading) return null;
  if (!user) {
    return (
      <div className={`ui-card ${styles.guest}`}>
        <div className={styles.guestIcon}>🛋️</div>
        <h2>방꾸미기</h2>
        <p>로그인하면 내 방을 꾸밀 수 있어요.</p>
        <button className="btn-primary" onClick={() => openAuthModal("login")}>로그인</button>
      </div>
    );
  }
  if (error) return <div className={`ui-card ${styles.guest}`}><p>{error}</p></div>;
  if (!data || !room) return <div className={styles.loading}>방을 불러오는 중…</div>;

  const owned = data.owned;
  const linked = data.points !== null;
  const placed = (key: string) => room.items.filter(i => i.k === key).length;
  const sel = selected >= 0 ? room.items[selected] : null;
  const selItem = sel ? CATALOG_MAP[sel.k] : null;

  const buyButton = (item: CatalogItem) => {
    const have = owned[item.key] ?? 0;
    const maxed = isOnceOnly(item.cat) ? have >= 1 : have >= MAX_COPIES;
    const price = priceOf(item);
    if (price === 0 || maxed) return null;
    const short = linked && (data.points ?? 0) < price;
    return (
      <button
        className={`${styles.buyBtn}${pendingBuy === item.key ? ` ${styles.confirm}` : ""}`}
        disabled={busy || !linked || short}
        title={!linked ? "클랜원 명단과 연동된 계정만 살 수 있어요" : short ? "포인트가 부족해요" : ""}
        onClick={() => buy(item)}
      >
        {pendingBuy === item.key ? `확인 (${price}P)` : `💰 ${price}P`}
      </button>
    );
  };

  return (
    <div className={styles.page}>
      <div className="ui-page-head">
        <div>
          <h2>🛋️ 방꾸미기</h2>
          <p>포인트로 가구와 프로필 아이콘 · 테두리를 사서 내 방을 꾸며 보세요. 프로필을 누르면 다른 사람에게 이 방이 보여요.</p>
        </div>
        <div className={styles.headRight}>
          <span className={styles.points}>{linked ? `💰 ${(data.points ?? 0).toLocaleString()}P` : "포인트 연동 안 됨"}</span>
          <button className="btn-secondary" disabled={!dirty || busy} onClick={() => { setRoom(JSON.parse(saved)); setSelected(-1); }}>되돌리기</button>
          <button className="btn-primary" disabled={!dirty || busy} onClick={save}>{dirty ? "저장" : "저장됨"}</button>
        </div>
      </div>

      {FREE_FOR_NOW && <div className={styles.freeNotice}>🎁 지금은 테스트 기간이라 모든 가구 · 프로필이 무료예요. 마음껏 꾸며 보세요!</div>}
      {!FREE_FOR_NOW && !linked && (
        <div className={styles.notice}>클랜원 명단과 연동되지 않은 계정이라 포인트로 살 수 없어요. 기본 가구로 꾸미는 건 가능해요. (연동은 운영진에게 요청)</div>
      )}

      <div className={styles.layout}>
        <div className={styles.stageCol}>
          <div className={styles.stage}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={e => e.preventDefault()}
            />
            {sel && selItem && (
              <div className={styles.toolbar}>
                <b>{selItem.name}</b>
                {!isWallPlacement(sel) && <button onClick={rotateSelected}>↻ 회전 <kbd>R</kbd></button>}
                <button onClick={removeSelected}>📦 보관 <kbd>Del</kbd></button>
                <button onClick={() => setSelected(-1)} aria-label="선택 해제">✕</button>
              </div>
            )}
            {msg && <div className={`${styles.toast} ${msg.kind === "err" ? styles.toastErr : ""}`}>{msg.text}</div>}
          </div>
          <p className={styles.hint}>가구를 눌러 선택 · 끌어서 옮기기 · 벽 장식은 벽을 따라 옮겨져요 · 러그 위엔 가구를 올릴 수 있어요</p>
        </div>

        <aside className={`ui-card ${styles.panel}`}>
          <div className={styles.tabs}>
            <button className={tab === "furniture" ? styles.on : ""} onClick={() => setTab("furniture")}>가구</button>
            <button className={tab === "surface" ? styles.on : ""} onClick={() => setTab("surface")}>벽지 · 바닥</button>
            <button className={tab === "profile" ? styles.on : ""} onClick={() => setTab("profile")}>프로필</button>
          </div>

          {tab === "furniture" && (
            <div className={styles.grid}>
              {FURNITURE.map(item => {
                const avail = availableCount(owned, item.key);
                const left = avail - placed(item.key);
                return (
                  <div key={item.key} className={styles.card}>
                    <Thumb item={item} />
                    <div className={styles.cardName}>{item.name}</div>
                    <div className={styles.cardMeta}>{FREE_FOR_NOW ? `무료 · 남음 ${left}` : avail > 0 ? `보유 ${avail} · 남음 ${left}` : item.price === 0 ? "기본" : `${item.price}P`}</div>
                    <div className={styles.cardBtns}>
                      {left > 0 && <button className={styles.placeBtn} onClick={() => placeNew(item.key)}>놓기</button>}
                      {buyButton(item)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "surface" && (
            <div className={styles.grid}>
              {SURFACES.map(item => {
                const have = availableCount(owned, item.key) > 0;
                const active = room.wallpaper === item.key || room.flooring === item.key;
                return (
                  <div key={item.key} className={`${styles.card}${active ? ` ${styles.active}` : ""}`}>
                    <Thumb item={item} />
                    <div className={styles.cardName}>{item.name}</div>
                    <div className={styles.cardMeta}>{item.cat === "wallpaper" ? "벽지" : "바닥"}{!have && ` · ${priceOf(item)}P`}</div>
                    <div className={styles.cardBtns}>
                      {have && !active && (
                        <button className={styles.placeBtn} onClick={() => setRoom(r => (r ? { ...r, [item.cat === "wallpaper" ? "wallpaper" : "flooring"]: item.key } : r))}>적용</button>
                      )}
                      {active && <span className={styles.using}>사용 중</span>}
                      {buyButton(item)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "profile" && (
            <div className={styles.scroll}>
              <div className={styles.profilePreview}>
                <ProfileAvatar userId={data.owner.userId} nickname={data.owner.nickname} size={64} frame={data.owner.frame} icon={data.owner.icon} />
                <div><b>{data.owner.nickname}</b><span>지금 내 프로필</span></div>
              </div>
              {([["아이콘", ICONS, "icon"], ["테두리", FRAMES, "frame"]] as const).map(([title, list, kind]) => (
                <section key={kind}>
                  <h4 className={styles.sectionTitle}>{title}</h4>
                  <div className={styles.grid}>
                    {list.map(item => {
                      const have = availableCount(owned, item.key) > 0;
                      const active = data.owner[kind] === item.key;
                      return (
                        <div key={item.key} className={`${styles.card}${active ? ` ${styles.active}` : ""}`}>
                          <div className={styles.framePreview}>
                            <ProfileAvatar
                              userId={data.owner.userId} nickname={data.owner.nickname} size={52}
                              frame={kind === "frame" ? item.key : data.owner.frame}
                              icon={kind === "icon" ? item.key : data.owner.icon}
                            />
                          </div>
                          <div className={styles.cardName}>{item.name}</div>
                          <div className={styles.cardMeta}>{FREE_FOR_NOW ? "무료" : item.price === 0 ? "기본" : have ? "보유" : `${item.price}P`}</div>
                          <div className={styles.cardBtns}>
                            {have && !active && <button className={styles.placeBtn} disabled={busy} onClick={() => equip(kind, item.key)}>착용</button>}
                            {active && <span className={styles.using}>착용 중</span>}
                            {buyButton(item)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
