"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";

interface FriendEntry { friendId: number; friendName: string; }
interface MemberRow { id: number; nickname: string; friends: FriendEntry[]; }

// 지인 관계는 DB에 단방향(member_id → friend_id)으로 저장되지만
// 화면에서는 양방향으로 보고, 서로 이어진 사람들을 하나의 "묶음"으로 표시한다.
interface Edge { from: number; to: number; }
interface Group { ids: number[]; edges: Edge[]; }

const MAX_FRIENDS = 3;

function buildGroups(members: MemberRow[]) {
  const known = new Set(members.map((m) => m.id));
  const edges: Edge[] = [];
  for (const m of members) for (const f of m.friends) {
    if (known.has(f.friendId)) edges.push({ from: m.id, to: f.friendId });
  }

  // union-find
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  for (const e of edges) {
    if (!parent.has(e.from)) parent.set(e.from, e.from);
    if (!parent.has(e.to)) parent.set(e.to, e.to);
    const a = find(e.from), b = find(e.to);
    if (a !== b) parent.set(a, b);
  }

  const byRoot = new Map<number, Group>();
  parent.forEach((_, id) => {
    const r = find(id);
    if (!byRoot.has(r)) byRoot.set(r, { ids: [], edges: [] });
    byRoot.get(r)!.ids.push(id);
  });
  for (const e of edges) byRoot.get(find(e.from))!.edges.push(e);

  // 이웃(양방향) 맵
  const neighbors = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
    if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
    neighbors.get(e.from)!.add(e.to);
    neighbors.get(e.to)!.add(e.from);
  }

  const groupOf = new Map<number, number>();
  parent.forEach((_, id) => groupOf.set(id, find(id)));

  return { groups: [...byRoot.values()], edges, neighbors, groupOf, grouped: new Set(parent.keys()) };
}

function includesQ(name: string, q: string) {
  return name.toLowerCase().replace(/\s/g, "").includes(q.toLowerCase().replace(/\s/g, ""));
}

// 묶음을 "중심 인물 — 연결된 사람들" 줄로 쪼갠다.
// 남은 연결이 가장 많은 사람을 중심으로 한 줄을 만들고, 그 연결을 지운 뒤 반복 → 모든 연결이 정확히 한 번씩 나온다.
interface Line { hub: number; others: number[]; }
function toLines(ids: number[], edges: Edge[]): Line[] {
  const order = new Map(ids.map((id, i) => [id, i]));
  const left = new Map<string, [number, number]>();
  for (const e of edges) {
    const a = Math.min(e.from, e.to), b = Math.max(e.from, e.to);
    left.set(`${a}-${b}`, [a, b]);
  }
  const lines: Line[] = [];
  while (left.size > 0) {
    const deg = new Map<number, number>();
    left.forEach(([a, b]) => { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); });
    const hub = [...deg.keys()].sort((x, y) => deg.get(y)! - deg.get(x)! || order.get(x)! - order.get(y)!)[0];
    const others: number[] = [];
    left.forEach(([a, b], k) => {
      if (a === hub || b === hub) { others.push(a === hub ? b : a); left.delete(k); }
    });
    others.sort((x, y) => order.get(x)! - order.get(y)!);
    lines.push({ hub, others });
  }
  return lines;
}

export default function FriendsPage() {
  const { user, loading: authLoading, openAuthModal, isAdmin } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  // 관리 모달: null = 닫힘, 0 = 클랜원 선택 단계, 그 외 = 해당 클랜원 관리
  const [modalId, setModalId] = useState<number | null>(null);
  const [pickSearch, setPickSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeModal = () => { setModalId(null); setPickSearch(""); setConfirmKey(null); };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/friends");
      const json = await res.json();
      if (!res.ok) setError(json.error || "불러오기 실패");
      else setMembers(json.members);
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [user, authLoading, load]);

  const nameOf = useMemo(() => new Map(members.map((m) => [m.id, m.nickname])), [members]);
  const { groups, neighbors, groupOf } = useMemo(() => buildGroups(members), [members]);

  async function addFriend(memberId: number, friendId: number) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, friendId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "추가 실패"); return; }
      await load();
      setPickSearch("");
      showToast(`${nameOf.get(memberId)} ↔ ${nameOf.get(friendId)} 연결했어요`);
    } catch { setError("네트워크 오류"); }
    finally { setBusy(false); }
  }

  async function removeFriend(a: number, b: number) {
    setBusy(true); setError(""); setConfirmKey(null);
    try {
      const res = await fetch(`/api/friends?memberId=${a}&friendId=${b}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "삭제 실패"); return; }
      await load();
      showToast(`${nameOf.get(a)} ↔ ${nameOf.get(b)} 연결을 끊었어요`);
    } catch { setError("네트워크 오류"); }
    finally { setBusy(false); }
  }

  // 2번 눌러야 삭제 (confirm 팝업 대신)
  function RemoveBtn({ a, b, label = "×" }: { a: number; b: number; label?: string }) {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const armed = confirmKey === key;
    return (
      <button
        type="button"
        className={`fr2-x${armed ? " armed" : ""}`}
        disabled={busy}
        title="연결 삭제"
        onClick={(e) => { e.stopPropagation(); if (armed) removeFriend(a, b); else setConfirmKey(key); }}
        onBlur={() => armed && setConfirmKey(null)}
      >
        {armed ? "삭제" : label}
      </button>
    );
  }

  // ===== 화면용 데이터 =====
  const q = search.trim();

  // 이름 (운영진은 누르면 그 사람 지인 관리)
  function NameBtn({ id, hub = false }: { id: number; hub?: boolean }) {
    const name = nameOf.get(id) ?? "?";
    const hit = !!q && includesQ(name, q);
    return (
      <button
        type="button"
        className={`fr3-name${hub ? " hub" : ""}${hit ? " hit" : ""}${isAdmin ? " clickable" : ""}`}
        onClick={() => isAdmin && setModalId(id)}
        title={isAdmin ? `${name} 지인 관리` : name}
      >
        {name}
      </button>
    );
  }

  const sortedGroups = [...groups]
    .map((g) => ({
      ...g,
      ids: [...g.ids].sort((a, b) => (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0) || (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? "")),
    }))
    .sort((a, b) => b.ids.length - a.ids.length || (nameOf.get(a.ids[0]) ?? "").localeCompare(nameOf.get(b.ids[0]) ?? ""));
  const visibleGroups = q ? sortedGroups.filter((g) => g.ids.some((id) => includesQ(nameOf.get(id) ?? "", q))) : sortedGroups;

  // 모달
  const modalMember = modalId ? members.find((m) => m.id === modalId) ?? null : null;
  const modalNeighbors = modalMember ? [...(neighbors.get(modalMember.id) ?? [])] : [];
  const modalOut = modalMember ? modalMember.friends.length : 0;
  const pickQ = pickSearch.trim();
  const memberPick = modalId === 0
    ? members.filter((m) => !pickQ || includesQ(m.nickname, pickQ))
    : [];
  const friendPick = modalMember
    ? members.filter((m) => m.id !== modalMember.id && !modalNeighbors.includes(m.id) && (!pickQ || includesQ(m.nickname, pickQ)))
    : [];

  if (authLoading) return null;
  if (!user) return (
    <div className="scrim">
      <div className="party-login-notice">
        지인 관리를 보려면 로그인이 필요합니다.
        <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
      </div>
    </div>
  );
  if (user.role === "captain" || user.scrimOnly) return (
    <div className="scrim"><div className="party-login-notice">접근 권한이 없습니다.</div></div>
  );

  return (
    <div className="fr">
      <div className="ui-page-head">
        <div>
          <h2>지인 관리</h2>
          <p>서로 지인으로 이어진 클랜원은 파티 시 한 묶음으로 함께 배치됩니다. 1인당 직접 등록 최대 {MAX_FRIENDS}명.</p>
        </div>
        {isAdmin && (
          <div className="ui-page-actions">
            <button className="btn-primary" onClick={() => { setModalId(0); setPickSearch(""); }}>+ 지인 연결</button>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="fr-toolbar">
        <input className="ui-input" placeholder="클랜원 이름으로 찾기" value={search} onChange={(e) => setSearch(e.target.value)} />
        {q && !loading && (
          <span className="fr3-stats">검색 결과 <b>{visibleGroups.length}</b>개 묶음</span>
        )}
      </div>

      {loading ? <p className="ui-empty">불러오는 중...</p> : (
        <div className="fr3-list">
          {visibleGroups.map((g) => (
            <div key={g.ids[0]} className="ui-card fr3-row">
              <span className="fr3-size">{g.ids.length}명</span>
              <div className="fr3-lines">
                {toLines(g.ids, g.edges).map((line) => (
                  <div key={line.hub} className="fr3-line">
                    <NameBtn id={line.hub} hub />
                    <span className="fr3-link" aria-hidden>—</span>
                    <span className="fr3-peers">
                      {line.others.map((o) => (
                        <span key={o} className="fr3-peer">
                          <NameBtn id={o} />
                          {isAdmin && <RemoveBtn a={line.hub} b={o} />}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {visibleGroups.length === 0 && (
            <p className="ui-empty">{q ? "검색된 묶음이 없습니다." : "아직 등록된 지인이 없습니다."}</p>
          )}
        </div>
      )}

      {/* 관리 모달 */}
      {modalId !== null && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal fr2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{modalMember ? modalMember.nickname : "클랜원 선택"}</span>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            {modalId === 0 && (
              <>
                <input
                  autoFocus
                  className="ui-input fr-full"
                  placeholder="지인을 연결할 클랜원 검색"
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && memberPick[0]) { setModalId(memberPick[0].id); setPickSearch(""); } }}
                />
                <div className="fr-pick-list">
                  {memberPick.slice(0, 40).map((m) => {
                    const n = neighbors.get(m.id)?.size ?? 0;
                    return (
                      <button key={m.id} className="fr-pick" onClick={() => { setModalId(m.id); setPickSearch(""); }}>
                        <span>{m.nickname}</span>
                        <small>{n > 0 ? `연결 ${n}명` : "묶음 없음"}</small>
                      </button>
                    );
                  })}
                  {memberPick.length === 0 && <p className="fr-hint">검색된 클랜원이 없습니다.</p>}
                </div>
              </>
            )}

            {modalMember && (
              <>
                <button className="fr-back" onClick={() => { setModalId(0); setPickSearch(""); setConfirmKey(null); }}>← 다른 클랜원 선택</button>

                <div className="fr-sec">
                  <div className="fr-sec-title">
                    연결된 지인 <small>{modalNeighbors.length}명</small>
                    <span className="fr2-quota">직접 등록 {modalOut}/{MAX_FRIENDS}</span>
                  </div>
                  {modalNeighbors.length === 0
                    ? <p className="fr-hint">연결된 지인이 없습니다.</p>
                    : modalNeighbors.map((fid) => {
                      const mine = modalMember.friends.some((f) => f.friendId === fid);
                      return (
                        <div key={fid} className="fr-item">
                          <span className="fr2-item-name">
                            <b>{nameOf.get(fid)}</b>
                            <small>{mine ? "내가 등록" : "상대가 등록"}</small>
                          </span>
                          <RemoveBtn a={modalMember.id} b={fid} label="삭제" />
                        </div>
                      );
                    })}
                </div>

                {modalOut < MAX_FRIENDS ? (
                  <div className="fr-sec">
                    <div className="fr-sec-title">지인 추가</div>
                    <input
                      autoFocus
                      className="ui-input fr-full"
                      placeholder="클랜원 검색 (Enter로 첫 번째 추가)"
                      value={pickSearch}
                      onChange={(e) => setPickSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && friendPick[0] && !busy) addFriend(modalMember.id, friendPick[0].id); }}
                    />
                    <div className="fr-pick-list short">
                      {friendPick.slice(0, 30).map((c) => {
                        const cg = groupOf.get(c.id);
                        const sameGroup = cg !== undefined && cg === groupOf.get(modalMember.id);
                        const where = cg === undefined ? "묶음 없음" : sameGroup ? "같은 묶음" : `다른 묶음 · ${groups.find((g) => g.ids.includes(c.id))?.ids.length ?? 0}명`;
                        return (
                          <button key={c.id} className="fr-pick" disabled={busy} onClick={() => addFriend(modalMember.id, c.id)}>
                            <span>{c.nickname}</span>
                            <small>{where}</small>
                          </button>
                        );
                      })}
                      {friendPick.length === 0 && <p className="fr-hint">추가 가능한 클랜원이 없습니다.</p>}
                    </div>
                  </div>
                ) : (
                  <p className="fr-hint">직접 등록한 지인이 최대({MAX_FRIENDS}명)입니다. 다른 클랜원 쪽에서 연결하거나 기존 연결을 삭제하세요.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="fr2-toast">{toast}</div>}
    </div>
  );
}
