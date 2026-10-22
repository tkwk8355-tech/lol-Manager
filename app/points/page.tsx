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
  const [pointLogSearch, setPointLogSearch] = useState("");
  const [pointPage, setPointPage] = useState(0);
  const [pointTotal, setPointTotal] = useState(0);
  const [pointForm, setPointForm] = useState({ memberId: "", points: "", comment: "" });
  const [pointMemberQuery, setPointMemberQuery] = useState("");
  const [pointMemberOpen, setPointMemberOpen] = useState(false);
  const pointMemberWrapRef = useRef<HTMLDivElement>(null);
  const pointInputRef = useRef<HTMLInputElement>(null);
  const pointCommentRef = useRef<HTMLInputElement>(null);
  const [pointMemberActiveIdx, setPointMemberActiveIdx] = useState(-1);
  const [pointMsg, setPointMsg] = useState("");
  const [rankSearch, setRankSearch] = useState("");

  // 상점 아이템
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [shopItemsLoading, setShopItemsLoading] = useState(false);
  const [itemForm, setItemForm] = useState<{ id?: number } & typeof EMPTY_ITEM | null>(null);
  const [itemErr, setItemErr] = useState("");
  const [itemBusy, setItemBusy] = useState(false);

  // 상점 구매 모달
  const [shopModal, setShopModal] = useState<{ name: string; cost: number; condition: string } | null>(null);
  const [shopMemberId, setShopMemberId] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setShopModal(null); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [shopErr, setShopErr] = useState("");
  const [shopBusy, setShopBusy] = useState(false);

  async function loadMembers() {
    try {
      const res = await fetch("/api/userinfo");
      const json = await res.json();
      if (res.ok) {
        const sorted: MemberPoint[] = (json.members ?? [])
          .filter((m: any) => m.status !== "withdraw" && m.status !== "black")
          .map((m: any) => ({ id: m.id, nickname: m.nickname, totalPoints: m.totalPoints ?? 0 }))
          .sort((a: MemberPoint, b: MemberPoint) => b.totalPoints - a.totalPoints);
        setMembers(sorted);
      }
    } catch {}
    finally { setLoading(false); }
  }

  async function loadPointLogs(page = 0, search = pointLogSearch) {
    setPointLoading(true);
    try {
      const params = new URLSearchParams({ offset: String(page * 50) });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/points?${params}`);
      const json = await res.json();
      if (res.ok) { setPointLogs(json.logs); setPointTotal(json.total ?? 0); }
    } catch {}
    finally { setPointLoading(false); }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadMembers();
  }, [user, authLoading]);

  useEffect(() => {
    if (isAdmin && subTab === "log") { setPointPage(0); loadPointLogs(0); }
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
    setPointMemberActiveIdx(-1);
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
    setPointPage(0); loadPointLogs(0);
    loadMembers();
  }

  async function cancelPoint(id: number) {
    if (!confirm("포인트 로그를 취소하시겠습니까?")) return;
    const res = await fetch(`/api/points?id=${id}`, { method: "DELETE" });
    if (res.ok) { loadPointLogs(pointPage); loadMembers(); }
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
      setPointPage(0); loadMembers(); loadPointLogs(0);
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
  if (user.role === "captain" || user.scrimOnly) return (
    <div className="userinfo"><div className="party-login-notice">접근 권한이 없습니다.</div></div>
  );

  const LOG_TYPE: Record<string, { label: string; cls: string }> = {
    solo: { label: "솔로랭크", cls: "gold" }, flex: { label: "자유랭크", cls: "orange" }, normal: { label: "일반", cls: "green" },
    scrim: { label: "내전", cls: "purple" }, aram: { label: "칼바람", cls: "cyan" }, manual: { label: "수동", cls: "blue" },
    shop: { label: "상점", cls: "red" }, birthday: { label: "생일보너스", cls: "pink" }, rookie_session: { label: "수습", cls: "green" },
  };
  const rankList = members.map((m, i) => ({ ...m, rank: i + 1 })).filter((m) => !rankSearch.trim() || m.nickname.toLowerCase().includes(rankSearch.trim().toLowerCase()));
  const pageCount = Math.ceil(pointTotal / 50);

  return (
    <div className="po">
      <div className="ui-page-head">
        <div>
          <h2>포인트</h2>
          <p>활동 포인트 현황 · 적립 내역 · 포인트 상점</p>
        </div>
      </div>
      <div className="ui-tabs">
        <button className={subTab === "rank" ? "on" : ""} onClick={() => setSubTab("rank")}>포인트 현황</button>
        <button className={subTab === "log" ? "on" : ""} onClick={() => setSubTab("log")}>적립 / 로그</button>
        <button className={subTab === "shop" ? "on" : ""} onClick={() => setSubTab("shop")}>포인트 상점</button>
      </div>

      {/* 상점 구매 모달 */}
      {shopModal && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <span>상품 구매</span>
              <button className="modal-close" onClick={() => setShopModal(null)}>×</button>
            </div>
            <div className="po-buy-item">
              <b>{shopModal.name}</b>
              <span>조건 {shopModal.condition} · {shopModal.cost > 0 ? `${shopModal.cost}P 소모` : "포인트 무관"}</span>
            </div>
            <label className="po-field">
              <span>구매할 클랜원</span>
              <select className="ui-select" value={shopMemberId} onChange={(e) => setShopMemberId(e.target.value)}>
                <option value="">클랜원 선택</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.nickname} ({m.totalPoints}P)</option>)}
              </select>
            </label>
            {shopErr && <div className="po-msg bad">{shopErr}</div>}
            <div className="po-modal-foot">
              <button className="btn-secondary" onClick={() => setShopModal(null)}>취소</button>
              <button className="btn-primary" disabled={shopBusy} onClick={submitShopPurchase}>{shopBusy ? "처리 중..." : "구매"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 포인트 현황 */}
      {subTab === "rank" && (
        loading ? <p className="ui-empty">불러오는 중...</p> : members.length === 0 ? <p className="ui-empty">데이터가 없습니다.</p> : (
          <>
            <div className="po-toolbar">
              <input className="ui-input" placeholder="클랜원 검색" value={rankSearch} onChange={(e) => setRankSearch(e.target.value)} />
              <span className="po-legend">
                활동 등급 {ACTIVITY_TIERS.slice().reverse().map((t) => <span key={t.label} style={{ color: t.color }}>{t.label}</span>)}
              </span>
            </div>
            <div className="po-grid">
              {rankList.map((m) => {
                const at = activityTier(m.totalPoints);
                return (
                  <div key={m.id} className="po-row">
                    <span className={`rk ${m.rank <= 3 ? "top n" + m.rank : ""}`}>{m.rank}</span>
                    <span className="nm">{m.nickname}</span>
                    {at && <span className="po-tier" style={{ color: at.color, background: `${at.color}22` }}>{at.label}</span>}
                    <span className={`pt ${m.totalPoints > 0 ? "" : "zero"}`}>{m.totalPoints.toLocaleString()}P</span>
                  </div>
                );
              })}
              {rankList.length === 0 && <p className="ui-empty" style={{ gridColumn: "1 / -1" }}>검색 결과가 없습니다.</p>}
            </div>
          </>
        )
      )}

      {/* 적립 / 로그 */}
      {subTab === "log" && (
        <div className="po-stack">
          <div className="ui-card ui-card-pad">
            <h3 className="ui-section-title">포인트 수동 지급</h3>
            <form onSubmit={givePoint} className="po-give">
              <div ref={pointMemberWrapRef} className="po-field" style={{ position: "relative" }}>
                <span>클랜원</span>
                <input
                  className={`ui-input ${pointForm.memberId ? "picked" : ""}`}
                  value={pointMemberQuery}
                  onChange={(e) => { setPointMemberQuery(e.target.value); setPointMemberOpen(true); setPointMemberActiveIdx(-1); if (!e.target.value) setPointForm((p) => ({ ...p, memberId: "" })); }}
                  onFocus={() => setPointMemberOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setPointMemberActiveIdx((i) => Math.min(i + 1, filteredPointMembers.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setPointMemberActiveIdx((i) => Math.max(i - 1, -1)); }
                    else if (e.key === "Enter") {
                      e.preventDefault();
                      const picked = pointMemberActiveIdx >= 0 ? filteredPointMembers[pointMemberActiveIdx] : filteredPointMembers.length > 0 ? filteredPointMembers[0] : null;
                      if (picked) selectPointMember(picked);
                      else setPointMemberOpen(false);
                    } else if (e.key === "Escape") { setPointMemberOpen(false); setPointMemberActiveIdx(-1); }
                  }}
                  placeholder="이름 검색"
                />
                {pointMemberOpen && filteredPointMembers.length > 0 && (
                  <div className="slot-candidates" style={{ zIndex: 50, minWidth: 220, top: "100%" }}>
                    {filteredPointMembers.map((m, i) => (
                      <button key={m.id} type="button" className={i === pointMemberActiveIdx ? "active" : ""} onMouseDown={() => selectPointMember(m)}>
                        {m.nickname} ({m.totalPoints}P)
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="po-field">
                <span>포인트</span>
                <input ref={pointInputRef} type="number" className="ui-input" placeholder="음수 가능" value={pointForm.points}
                  onChange={(e) => setPointForm((p) => ({ ...p, points: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pointCommentRef.current?.focus(); } }} />
              </label>
              <label className="po-field grow">
                <span>사유</span>
                <input ref={pointCommentRef} className="ui-input" placeholder="필수" value={pointForm.comment}
                  onChange={(e) => setPointForm((p) => ({ ...p, comment: e.target.value }))} />
              </label>
              <button type="submit" className="btn-primary">지급</button>
            </form>
            {pointMsg && <div className={`po-msg ${pointMsg.includes("완료") ? "ok" : "bad"}`}>{pointMsg}</div>}
          </div>

          <div className="ui-card ui-card-pad">
            <div className="po-log-head">
              <h3 className="ui-section-title" style={{ margin: 0 }}>포인트 전체 로그 <span className="sub">{pointTotal.toLocaleString()}건</span></h3>
              <input className="ui-input" placeholder="클랜원 이름 검색"
                value={pointLogSearch}
                onChange={(e) => { setPointLogSearch(e.target.value); setPointPage(0); loadPointLogs(0, e.target.value); }} />
            </div>
            <div className="ui-table-wrap po-log" style={{ position: "relative" }}>
              {pointLoading && <div className="po-loading">불러오는 중...</div>}
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>시간</th><th>클랜원</th><th>타입</th><th style={{ textAlign: "right" }}>판수</th>
                    <th style={{ textAlign: "right" }}>포인트</th><th>사유</th><th>지급자</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {pointLogs.map((l) => {
                    const t = LOG_TYPE[l.type as string] ?? { label: l.type, cls: "green" };
                    return (
                      <tr key={l.id}>
                        <td className="muted nowrap">{l.created_at?.slice(0, 16)}</td>
                        <td className="b nowrap">{l.nickname}</td>
                        <td><span className={`po-type ${t.cls}`}>{t.label}</span></td>
                        <td className="muted" style={{ textAlign: "right" }}>{l.games > 0 ? `${l.games}판` : "-"}</td>
                        <td style={{ textAlign: "right" }} className={`b ${l.points > 0 ? "plus" : "minus"}`}>{l.points > 0 ? `+${l.points}` : l.points}P</td>
                        <td className="muted ellip">{l.comment ?? "-"}</td>
                        <td className="muted nowrap">{l.given_by_name ?? "-"}</td>
                        <td style={{ textAlign: "right" }}><button className="del-btn small" onClick={() => cancelPoint(l.id)}>취소</button></td>
                      </tr>
                    );
                  })}
                  {pointLogs.length === 0 && (
                    <tr><td colSpan={8} className="ui-empty">포인트 내역이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="po-pager">
                <button className="btn-secondary" disabled={pointPage <= 0} onClick={() => { const p = pointPage - 1; setPointPage(p); loadPointLogs(p); }}>‹ 이전</button>
                <span>{pointPage + 1} / {pageCount}</span>
                <button className="btn-secondary" disabled={pointPage >= pageCount - 1} onClick={() => { const p = pointPage + 1; setPointPage(p); loadPointLogs(p); }}>다음 ›</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 포인트 상점 */}
      {subTab === "shop" && (
        <div className="ui-card ui-card-pad">
          <div className="po-log-head">
            <h3 className="ui-section-title" style={{ margin: 0 }}>포인트 상점 <span className="sub">{shopItems.length}개 상품</span></h3>
            <button className="btn-primary" onClick={() => { setItemForm({ ...EMPTY_ITEM }); setItemErr(""); }}>+ 상품 추가</button>
          </div>

          {itemForm && (
            <div className="po-item-form">
              <label className="po-field grow2"><span>상품명</span>
                <input className="ui-input" placeholder="필수" value={itemForm.name} onChange={(e) => setItemForm((p) => p && ({ ...p, name: e.target.value }))} />
              </label>
              <label className="po-field"><span>소모 포인트</span>
                <input type="number" className="ui-input" placeholder="0 = 무관" value={itemForm.cost} onChange={(e) => setItemForm((p) => p && ({ ...p, cost: Number(e.target.value) }))} />
              </label>
              <label className="po-field"><span>구매 조건</span>
                <select className="ui-select" value={itemForm.cond} onChange={(e) => setItemForm((p) => p && ({ ...p, cond: e.target.value }))}>
                  {CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="po-field grow2"><span>비고</span>
                <input className="ui-input" value={itemForm.note} onChange={(e) => setItemForm((p) => p && ({ ...p, note: e.target.value }))} />
              </label>
              <label className="po-field small"><span>정렬</span>
                <input type="number" className="ui-input" value={itemForm.sort_order} onChange={(e) => setItemForm((p) => p && ({ ...p, sort_order: Number(e.target.value) }))} />
              </label>
              <div className="po-item-actions">
                {itemErr && <span className="po-msg bad">{itemErr}</span>}
                <button className="btn-secondary" onClick={() => setItemForm(null)}>닫기</button>
                <button className="btn-primary" disabled={itemBusy} onClick={saveItem}>{itemBusy ? "저장 중..." : itemForm.id ? "수정" : "추가"}</button>
              </div>
            </div>
          )}

          {shopItemsLoading ? <p className="ui-empty">불러오는 중...</p> : (
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr><th>상품명</th><th style={{ textAlign: "center" }}>소모 포인트</th><th style={{ textAlign: "center" }}>구매 조건</th><th>비고</th><th></th></tr>
                </thead>
                <tbody>
                  {shopItems.map((item) => (
                    <tr key={item.id}>
                      <td className="b">{item.name}</td>
                      <td style={{ textAlign: "center" }} className={`b ${item.cost > 0 ? "minus" : "muted"}`}>{item.cost > 0 ? `${item.cost}P` : "-"}</td>
                      <td style={{ textAlign: "center" }}><span className="ui-badge">{item.cond || "상관없음"}</span></td>
                      <td className="muted">{item.note || "-"}</td>
                      <td>
                        <div className="po-row-actions">
                          <button className="btn-primary po-sm" onClick={() => { setShopModal({ name: item.name, cost: item.cost, condition: item.cond || "상관없음" }); setShopMemberId(""); setShopErr(""); }}>구매</button>
                          <button className="edit-btn" onClick={() => { setItemForm({ id: item.id, name: item.name, cost: item.cost, cond: item.cond ?? "", note: item.note ?? "", sort_order: item.sort_order }); setItemErr(""); }}>수정</button>
                          <button className="del-btn" onClick={() => deleteItem(item.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shopItems.length === 0 && (
                    <tr><td colSpan={5} className="ui-empty">등록된 상품이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
