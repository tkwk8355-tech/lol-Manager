"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";

interface FriendEntry { friendId: number; friendName: string; }
interface MemberRow { id: number; nickname: string; friends: FriendEntry[]; }

export default function FriendsPage() {
  const { user, loading: authLoading, openAuthModal, isAdmin } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // 지인 추가 모달
  const [modal, setModal] = useState<MemberRow | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") { setModal(null); setMemberSearch(""); setFriendSearch(""); } }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openAddModal() {
    setModal({ id: -1, nickname: "", friends: [] }); // -1 = 클랜원 선택 단계
    setMemberSearch(""); setFriendSearch("");
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
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
      // 모달 내 데이터 갱신 (load 후 members가 업데이트되므로 id로 다시 찾음)
      setModal((prev) => prev && prev.id !== -1 ? members.find((m) => m.id === prev.id) ?? prev : prev);
    } catch { setError("네트워크 오류"); }
    finally { setBusy(false); }
  }

  async function removeFriend(memberId: number, friendId: number) {
    if (!confirm("지인 관계를 삭제할까요?")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/friends?memberId=${memberId}&friendId=${friendId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "삭제 실패"); return; }
      await load();
    } catch { setError("네트워크 오류"); }
    finally { setBusy(false); }
  }

  const filtered = members.filter((m) =>
    m.friends.length > 0 &&
    (!search.trim() || m.nickname.toLowerCase().includes(search.toLowerCase()))
  );

  // 모달에서 추가 가능한 후보 (본인, 이미 지인인 사람 제외)
  const modalMember = modal ? members.find((m) => m.id === modal.id) ?? modal : null;
  const candidates = modalMember
    ? members.filter((m) => {
        if (m.id === modalMember.id) return false;
        if (modalMember.friends.some((f) => f.friendId === m.id)) return false;
        if (!friendSearch.trim()) return true;
        return m.nickname.toLowerCase().includes(friendSearch.toLowerCase());
      })
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
          <p>클랜원 1인당 지인 최대 3명 · 파티 시 함께 묶이는 인원을 지정합니다.</p>
        </div>
        {isAdmin && (
          <div className="ui-page-actions">
            <button className="btn-primary" onClick={openAddModal}>+ 지인 추가</button>
          </div>
        )}
      </div>

      {/* 지인 관리 모달 */}
      {modal && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <span>{modal.id === -1 ? "클랜원 선택" : `${modalMember?.nickname} · 지인 관리`}</span>
              <button className="modal-close" onClick={() => { setModal(null); setMemberSearch(""); setFriendSearch(""); }}>×</button>
            </div>

            {/* 1단계: 클랜원 선택 */}
            {modal.id === -1 && (() => {
              const memberCandidates = members.filter((m) =>
                !memberSearch.trim() || m.nickname.toLowerCase().includes(memberSearch.toLowerCase())
              );
              return (
                <div>
                  <input
                    autoFocus
                    className="ui-input fr-full"
                    placeholder="지인을 등록할 클랜원 검색"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && memberCandidates.length > 0) {
                        setModal(memberCandidates[0]); setMemberSearch("");
                      }
                    }}
                  />
                  <div className="fr-pick-list">
                    {memberSearch.trim() && memberCandidates.slice(0, 30).map((m) => (
                      <button key={m.id} className="fr-pick" onClick={() => { setModal(m); setMemberSearch(""); }}>
                        <span>{m.nickname}</span>
                        <small>지인 {m.friends.length}/3</small>
                      </button>
                    ))}
                    {!memberSearch.trim() && <p className="fr-hint">이름을 입력하면 클랜원이 나와요.</p>}
                  </div>
                </div>
              );
            })()}

            {/* 2단계: 지인 관리 */}
            {modal.id !== -1 && modalMember && (
              <>
                <button className="fr-back" onClick={() => { setModal({ id: -1, nickname: "", friends: [] }); setFriendSearch(""); }}>
                  ← 다른 클랜원 선택
                </button>

                <div className="fr-sec">
                  <div className="fr-sec-title">현재 지인 <small>{modalMember.friends.length}/3</small></div>
                  {modalMember.friends.length === 0
                    ? <p className="fr-hint">등록된 지인이 없습니다.</p>
                    : modalMember.friends.map((f) => (
                      <div key={f.friendId} className="fr-item">
                        <b>{f.friendName}</b>
                        <button className="del-btn small" disabled={busy} onClick={() => removeFriend(modalMember.id, f.friendId)}>삭제</button>
                      </div>
                    ))
                  }
                </div>

                {modalMember.friends.length < 3 ? (
                  <div className="fr-sec">
                    <div className="fr-sec-title">지인 추가</div>
                    <input
                      autoFocus
                      className="ui-input fr-full"
                      placeholder="클랜원 검색 (Enter로 첫 번째 추가)"
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && candidates.length > 0) {
                          addFriend(modalMember.id, candidates[0].id);
                          setFriendSearch("");
                        }
                      }}
                    />
                    <div className="fr-pick-list short">
                      {candidates.slice(0, 20).map((c) => (
                        <div key={c.id} className="fr-item">
                          <span>{c.nickname}</span>
                          <button className="edit-btn" disabled={busy} onClick={() => addFriend(modalMember.id, c.id)}>추가</button>
                        </div>
                      ))}
                      {candidates.length === 0 && <p className="fr-hint">추가 가능한 클랜원이 없습니다.</p>}
                    </div>
                  </div>
                ) : (
                  <p className="fr-hint">지인이 최대(3명)입니다.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="fr-toolbar">
        <input className="ui-input" placeholder="클랜원 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="fr-count">{filtered.length}명</span>
      </div>

      {loading ? <p className="ui-empty">불러오는 중...</p> : (
        <div className="fr-grid">
          {filtered.map((m) => (
            <div key={m.id} className="ui-card fr-card">
              <div className="fr-card-head">
                <b>{m.nickname}</b>
                <span className="fr-badge">{m.friends.length}/3</span>
                {isAdmin && (
                  <button className="edit-btn fr-manage" onClick={() => { setModal(m); setFriendSearch(""); }}>관리</button>
                )}
              </div>
              <div className="fr-chips">
                {m.friends.map((f) => <span key={f.friendId} className="pt-chip">{f.friendName}</span>)}
                {m.friends.length === 0 && <span className="fr-none">지인 없음</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="ui-empty" style={{ gridColumn: "1/-1" }}>등록된 지인이 없습니다.</p>}
        </div>
      )}
    </div>
  );
}
