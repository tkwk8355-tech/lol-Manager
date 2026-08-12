"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";

interface MemberPoint {
  id: number;
  nickname: string;
  totalPoints: number;
}

const ACTIVITY_TIERS = [
  { min: 3300, label: "C", color: "#d9a441" },
  { min: 2800, label: "M", color: "#9d4dc3" },
  { min: 2300, label: "D", color: "#4f7bd0" },
  { min: 1800, label: "E", color: "#2f9e6b" },
  { min: 1300, label: "P", color: "#3aa6a0" },
  { min: 800,  label: "G", color: "#cf9b41" },
  { min: 300,  label: "S", color: "#7e93a3" },
  { min: 0,    label: "B", color: "#8c5230" },
] as const;

function activityTier(points: number) {
  return ACTIVITY_TIERS.find((t) => points >= t.min) ?? null;
}

interface ShopItem {
  id: number;
  name: string;
  cost: number;
  cond: string;
  note: string;
  sort_order: number;
}

const CONDITION_OPTIONS = [
  { value: "", label: "상관없음" },
  { value: "B 이상", label: "B 이상" },
  { value: "S 이상", label: "S 이상" },
  { value: "G 이상", label: "G 이상" },
  { value: "P 이상", label: "P 이상" },
  { value: "E 이상", label: "E 이상" },
  { value: "D 이상", label: "D 이상" },
  { value: "M 이상", label: "M 이상" },
  { value: "C 이상", label: "C 이상" },
  { value: "상이", label: "상이" },
];

const EMPTY_ITEM = { name: "", cost: 0, cond: "", note: "", sort_order: 0 };

export default function PointsPage() {
  const { user, isAdmin, loading: authLoading, openAuthModal } = useAuth();
  const [members, setMembers] = useState<MemberPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"rank" | "log" | "shop">("rank");

  // 포인트 로그
  const [pointLogs, setPointLogs] = useState<any[]>([]);
  const [pointLoading, setPointLoading] = useState(false);
  const [pointForm, setPointForm] = useState({ memberId: "", points: "", comment: "" });
  const [pointMemberQuery, setPointMemberQuery] = useState("");
  const [pointMemberOpen, setPointMemberOpen] = useState(false);
  const pointMemberWrapRef = useRef<HTMLDivElement>(null);
  const pointInputRef = useRef<HTMLInputElement>(null);
  const pointCommentRef = useRef<HTMLInputElement>(null);
  const [pointMsg, setPointMsg] = useState("");

  // 상점 아이템
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [shopItemsLoading, setShopItemsLoading] = useState(false);
  const [itemForm, setItemForm] = useState<{ id?: number } & typeof EMPTY_ITEM | null>(null);
  const [itemErr, setItemErr] = useState("");
  const [itemBusy, setItemBusy] = useState(false);

  // 상점 구매 모달
  const [shopModal, setShopModal] = useState<{ name: string; cost: number; condition: string } | null>(null);
  const [shopMemberId, setShopMemberId] = useState("");
  const [shopErr, setShopErr] = useState("");
  const [shopBusy, setShopBusy] = useState(false);

  async function loadMembers() {
    try {
      const res = await fetch("/api/userinfo");
      const json = await res.json();
      if (res.ok) {
        const sorted: MemberPoint[] = (json.members ?? [])
          .map((m: any) => ({ id: m.id, nickname: m.nickname, totalPoints: m.totalPoints ?? 0 }))
          .sort((a: MemberPoint, b: MemberPoint) => b.totalPoints - a.totalPoints);
        setMembers(sorted);
      }
    } catch {}
    finally { setLoading(false); }
  }

  async function loadPointLogs() {
    setPointLoading(true);
    try {
      const res = await fetch("/api/points");
      const json = await res.json();
      if (res.ok) setPointLogs(json.logs);
    } catch {}
    finally { setPointLoading(false); }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadMembers();
  }, [user, authLoading]);

  useEffect(() => {
    if (isAdmin && subTab === "log") loadPointLogs();
    if (isAdmin && subTab === "shop") loadShopItems();
  }, [isAdmin, subTab]);

  const filteredPointMembers = pointMemberQuery.length > 0
    ? members.filter((m) => m.nickname.toLowerCase().includes(pointMemberQuery.toLowerCase())).slice(0, 8)
    : members.slice(0, 8);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pointMemberWrapRef.current && !pointMemberWrapRef.current.contains(e.target as Node))
        setPointMemberOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectPointMember(m: MemberPoint) {
    setPointForm((p) => ({ ...p, memberId: String(m.id) }));
    setPointMemberQuery(`${m.nickname} (${m.totalPoints}P)`);
    setPointMemberOpen(false);
    pointInputRef.current?.focus();
  }

  async function givePoint(e: React.FormEvent) {
    e.preventDefault();
    setPointMsg("");
    if (!pointForm.memberId || !pointForm.points || !pointForm.comment.trim()) {
      setPointMsg("클랜원, 포인트, 사유를 입력하세요."); return;
    }
    const res = await fetch("/api/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: Number(pointForm.memberId), points: Number(pointForm.points), comment: pointForm.comment }),
    });
    const json = await res.json();
    if (!res.ok) { setPointMsg(json.error || "실패"); return; }
    setPointForm({ memberId: "", points: "", comment: "" });
    setPointMemberQuery("");
    setPointMsg("지급 완료!");
    loadPointLogs();
    loadMembers();
  }

  async function cancelPoint(id: number) {
    if (!confirm("포인트 로그를 취소하시겠습니까?")) return;
    const res = await fetch(`/api/points?id=${id}`, { method: "DELETE" });
    if (res.ok) { loadPointLogs(); loadMembers(); }
  }

  async function loadShopItems() {
    setShopItemsLoading(true);
    try {
      const res = await fetch("/api/shop-items");
      const json = await res.json();
      if (res.ok) setShopItems(json.items);
    } catch {}
    finally { setShopItemsLoading(false); }
  }

  async function saveItem() {
    if (!itemForm) return;
    if (!itemForm.name.trim()) { setItemErr("상품명을 입력하세요."); return; }
    setItemBusy(true); setItemErr("");
    try {
      const method = itemForm.id ? "PUT" : "POST";
      const res = await fetch("/api/shop-items", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      const json = await res.json();
      if (!res.ok) { setItemErr(json.error || "실패"); return; }
      setItemForm(null);
      loadShopItems();
    } catch { setItemErr("네트워크 오류"); }
    finally { setItemBusy(false); }
  }

  async function deleteItem(id: number) {
    if (!confirm("상품을 삭제하시겠습니까?")) return;
    await fetch(`/api/shop-items?id=${id}`, { method: "DELETE" });
    loadShopItems();
  }

  async function submitShopPurchase() {
    if (!shopModal) return;
    if (!shopMemberId) { setShopErr("클랜원을 선택하세요."); return; }
    setShopBusy(true); setShopErr("");
    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: Number(shopMemberId), points: shopModal.cost, comment: `[상점] ${shopModal.name}`, type: "shop" }),
      });
      const json = await res.json();
      if (!res.ok) { setShopErr(json.error || "구매 실패"); return; }
      setShopModal(null); setShopMemberId("");
      loadMembers(); loadPointLogs();
    } catch { setShopErr("네트워크 오류"); }
    finally { setShopBusy(false); }
  }

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="userinfo">
        <div className="party-login-notice">
          포인트 현황을 보려면 로그인이 필요합니다.
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px" }}>
      <div className="scrim-tabs" style={{ marginBottom: 16 }}>
        <button className={subTab === "rank" ? "on" : ""} onClick={() => setSubTab("rank")}>포인트 현황</button>
        <button className={subTab === "log" ? "on" : ""} onClick={() => setSubTab("log")}>적립 / 로그</button>
        <button className={subTab === "shop" ? "on" : ""} onClick={() => setSubTab("shop")}>포인트 상점</button>
      </div>

      {/* 상점 구매 모달 */}
      {shopModal && (
        <div className="modal-backdrop" onClick={() => setShopModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <span>구매: {shopModal.name}</span>
              <button className="modal-close" onClick={() => setShopModal(null)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>조건: {shopModal.condition} / 소모: {shopModal.cost > 0 ? `${shopModal.cost}P` : "포인트 무관"}</p>
              <select value={shopMemberId} onChange={(e) => setShopMemberId(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}>
                <option value="">클랜원 선택</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.nickname} ({m.totalPoints}P)</option>)}
              </select>
              {shopErr && <span style={{ fontSize: 12, color: "var(--loss-text)" }}>{shopErr}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="sync-btn" style={{ flex: 1 }} disabled={shopBusy} onClick={submitShopPurchase}>
                  {shopBusy ? "처리 중..." : "구매"}
                </button>
                <button className="cancel-btn" style={{ flex: 1 }} onClick={() => setShopModal(null)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 포인트 현황 */}
      {subTab === "rank" && (
        <>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>포인트 순으로 정렬됩니다.</p>
          {loading ? <p>불러오는 중...</p> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {members.map((m, i) => {
                const at = activityTier(m.totalPoints);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8,
                    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)", width: 24, flexShrink: 0, textAlign: "center" }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.nickname}
                    </span>
                    {at && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
                        background: `${at.color}22`, color: at.color, border: `1px solid ${at.color}55` }}>
                        {at.label}
                      </span>
                    )}
                    <span style={{ fontWeight: 800, fontSize: 13, flexShrink: 0,
                      color: m.totalPoints > 0 ? "var(--win-text)" : "var(--muted)" }}>
                      {m.totalPoints}P
                    </span>
                  </div>
                );
              })}
              {members.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: 16, color: "var(--muted)", textAlign: "center" }}>데이터가 없습니다.</div>
              )}
            </div>
          )}
        </>
      )}

      {/* 적립 / 로그 */}
      {subTab === "log" && (
        <div>
          <div className="home-panel" style={{ marginBottom: 16 }}>
            <div className="home-panel-head"><h3>포인트 수동 지급</h3></div>
            <form onSubmit={givePoint} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div ref={pointMemberWrapRef} style={{ position: "relative" }}>
                <input
                  value={pointMemberQuery}
                  onChange={(e) => { setPointMemberQuery(e.target.value); setPointMemberOpen(true); if (!e.target.value) setPointForm((p) => ({ ...p, memberId: "" })); }}
                  onFocus={() => setPointMemberOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (filteredPointMembers.length > 0) selectPointMember(filteredPointMembers[0]);
                    } else if (e.key === "Escape") setPointMemberOpen(false);
                  }}
                  placeholder="클랜원 검색"
                  style={{ width: 200, padding: "9px 12px", borderRadius: 8, border: `1px solid ${pointForm.memberId ? "var(--accent)" : "var(--border)"}`, background: "var(--card)", color: "var(--text)", fontSize: 14 }}
                />
                {pointMemberOpen && filteredPointMembers.length > 0 && (
                  <div className="slot-candidates" style={{ zIndex: 50, minWidth: 200 }}>
                    {filteredPointMembers.map((m, i) => (
                      <button key={m.id} className={i === 0 ? "first" : ""} onMouseDown={() => selectPointMember(m)}>
                        {m.nickname} ({m.totalPoints}P)
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input ref={pointInputRef} type="number" placeholder="포인트 (음수 가능)" value={pointForm.points}
                onChange={(e) => setPointForm((p) => ({ ...p, points: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pointCommentRef.current?.focus(); } }}
                style={{ width: 160, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
              <input ref={pointCommentRef} placeholder="사유 (필수)" value={pointForm.comment}
                onChange={(e) => setPointForm((p) => ({ ...p, comment: e.target.value }))}
                style={{ flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
              <button type="submit" className="sync-btn">지급</button>
            </form>
            {pointMsg && <p style={{ marginTop: 8, fontSize: 13, color: "var(--win-text)" }}>{pointMsg}</p>}
          </div>
          <div className="home-panel">
            <div className="home-panel-head"><h3>포인트 전체 로그</h3></div>
            {pointLoading ? <p className="empty">불러오는 중...</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>시간</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>클랜원</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>타입</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>판수</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>포인트</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>사유</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>지급자</th>
                    <th style={{ padding: "6px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pointLogs.map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", color: "var(--muted)", whiteSpace: "nowrap" }}>{l.created_at?.slice(0, 16)}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{l.nickname}</td>
                      <td style={{ padding: "7px 8px" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                          background: l.type === "scrim" ? "rgba(155,89,182,0.18)" : l.type === "shop" ? "rgba(231,76,60,0.18)" : l.type === "manual" ? "rgba(83,131,232,0.18)" : "rgba(46,204,113,0.18)",
                          color: l.type === "scrim" ? "#c39bd3" : l.type === "shop" ? "#f1948a" : l.type === "manual" ? "#7aa2f7" : "#2ecc71" }}>
                          {({ solo: "솔로랭크", flex: "자유랭크", normal: "일반", scrim: "내전", aram: "칼바람", manual: "수동", shop: "상점" } as any)[l.type] ?? l.type}
                        </span>
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--muted)" }}>{l.games > 0 ? `${l.games}판` : "-"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800,
                        color: l.points > 0 ? "var(--win-text)" : "var(--loss-text)" }}>
                        {l.points > 0 ? `+${l.points}` : l.points}P
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{l.comment ?? "-"}</td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{l.given_by_name ?? "-"}</td>
                      <td style={{ padding: "7px 8px" }}>
                        <button className="del-btn small" onClick={() => cancelPoint(l.id)}>취소</button>
                      </td>
                    </tr>
                  ))}
                  {pointLogs.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: "12px 8px", color: "var(--muted)" }}>포인트 내역이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 포인트 상점 */}
      {subTab === "shop" && (
        <div className="home-panel">
          <div className="home-panel-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3>포인트 상점</h3>
            <button className="sync-btn" style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => { setItemForm({ ...EMPTY_ITEM }); setItemErr(""); }}>
              + 상품 추가
            </button>
          </div>

          {/* 상품 추가/수정 폼 */}
          {itemForm && (
            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="상품명 (필수)"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((p) => p && ({ ...p, name: e.target.value }))}
                  style={{ flex: 2, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                />
                <input
                  type="number"
                  placeholder="소모 포인트 (0=무관)"
                  value={itemForm.cost}
                  onChange={(e) => setItemForm((p) => p && ({ ...p, cost: Number(e.target.value) }))}
                  style={{ width: 150, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                />
                <select
                  value={itemForm.cond}
                  onChange={(e) => setItemForm((p) => p && ({ ...p, cond: e.target.value }))}
                  style={{ width: 130, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                >
                  {CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  placeholder="비고"
                  value={itemForm.note}
                  onChange={(e) => setItemForm((p) => p && ({ ...p, note: e.target.value }))}
                  style={{ flex: 2, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                />
                <input
                  type="number"
                  placeholder="정렬순서"
                  value={itemForm.sort_order}
                  onChange={(e) => setItemForm((p) => p && ({ ...p, sort_order: Number(e.target.value) }))}
                  style={{ width: 90, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                />
              </div>
              {itemErr && <span style={{ fontSize: 12, color: "var(--loss-text)" }}>{itemErr}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="sync-btn" style={{ fontSize: 12, padding: "5px 16px" }} disabled={itemBusy} onClick={saveItem}>
                  {itemBusy ? "저장 중..." : itemForm.id ? "수정" : "추가"}
                </button>
                <button className="cancel-btn" style={{ fontSize: 12, padding: "5px 16px" }} onClick={() => setItemForm(null)}>장닫기</button>
              </div>
            </div>
          )}

          {shopItemsLoading ? <p className="empty">불러오는 중...</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 10px" }}>상품명</th>
                  <th style={{ textAlign: "center", padding: "6px 10px" }}>소모 포인트</th>
                  <th style={{ textAlign: "center", padding: "6px 10px" }}>구매 조건</th>
                  <th style={{ textAlign: "left", padding: "6px 10px" }}>비고</th>
                  <th style={{ padding: "6px 10px" }}></th>
                </tr>
              </thead>
              <tbody>
                {shopItems.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800,
                      color: item.cost > 0 ? "var(--loss-text)" : "var(--muted)" }}>
                      {item.cost > 0 ? `${item.cost}P` : "-"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--muted)" }}>
                      {item.cond || "상관없음"}
                    </td>
                    <td style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12 }}>{item.note || "-"}</td>
                    <td style={{ padding: "8px 10px", display: "flex", gap: 6 }}>
                      <button className="sync-btn" style={{ fontSize: 11, padding: "3px 10px" }}
                        onClick={() => { setShopModal({ name: item.name, cost: item.cost, condition: item.cond || "상관없음" }); setShopMemberId(""); setShopErr(""); }}>
                        구매
                      </button>
                      <button className="sync-btn" style={{ fontSize: 11, padding: "3px 10px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)" }}
                        onClick={() => { setItemForm({ id: item.id, name: item.name, cost: item.cost, cond: item.cond ?? "", note: item.note ?? "", sort_order: item.sort_order }); setItemErr(""); }}>
                        수정
                      </button>
                      <button className="del-btn small" onClick={() => deleteItem(item.id)}>삭제</button>
                    </td>
                  </tr>
                ))}
                {shopItems.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "12px 10px", color: "var(--muted)" }}>등록된 상품이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
