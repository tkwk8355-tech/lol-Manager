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

  return (
    <div className="scrim">
      <h2 className="scrim-title">지인 관리</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
        클랜원 1인당 지인 최대 3명. 파티 시 함께 묶이는 인원을 지정합니다.
      </p>

      {/* 지인 관리 모달 */}
      {modal && (
        <div className="modal-backdrop" onClick={() => { setModal(null); setMemberSearch(""); setFriendSearch(""); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <span>👥 {modal.id === -1 ? "클랜원 선택" : `${modalMember?.nickname} 지인 관리`}</span>
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
                    placeholder="클랜원 검색..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && memberCandidates.length > 0) {
                        setModal(memberCandidates[0]); setMemberSearch("");
                      }
                    }}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, marginBottom: 6 }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
                    {memberSearch.trim() && memberCandidates.slice(0, 30).map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8,
                        background: "var(--card-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, cursor: "pointer" }}
                        onClick={() => { setModal(m); setMemberSearch(""); }}>
                        <span style={{ flex: 1 }}>{m.nickname}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>지인 {m.friends.length}/3</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 2단계: 지인 관리 */}
            {modal.id !== -1 && modalMember && (
              <>
                <button style={{ fontSize: 12, color: "var(--muted)", background: "none", border: "none",
                  cursor: "pointer", padding: 0, marginBottom: 12 }}
                  onClick={() => { setModal({ id: -1, nickname: "", friends: [] }); setFriendSearch(""); }}>
                  ← 다른 클랜원 선택
                </button>

                {/* 현재 지인 목록 */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>
                    현재 지인 ({modalMember.friends.length}/3)
                  </div>
                  {modalMember.friends.length === 0
                    ? <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>등록된 지인이 없습니다.</p>
                    : modalMember.friends.map((f) => (
                      <div key={f.friendId} style={{ display: "flex", alignItems: "center", gap: 8,
                        background: "var(--card-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontWeight: 700 }}>{f.friendName}</span>
                        <button className="del-btn small" disabled={busy}
                          onClick={() => removeFriend(modalMember.id, f.friendId)}>삭제</button>
                      </div>
                    ))
                  }
                </div>

                {/* 지인 추가 */}
                {modalMember.friends.length < 3 ? (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>지인 추가</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input
                        autoFocus
                        placeholder="클랜원 검색..."
                        value={friendSearch}
                        onChange={(e) => setFriendSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && candidates.length > 0) {
                            addFriend(modalMember.id, candidates[0].id);
                            setFriendSearch("");
                          }
                        }}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8,
                          border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                      />
                      <button className="sync-btn" disabled={busy || candidates.length === 0}
                        onClick={() => { if (candidates.length > 0) { addFriend(modalMember.id, candidates[0].id); setFriendSearch(""); } }}>
                        등록
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                      {candidates.slice(0, 20).map((c) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8,
                          background: "var(--card-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13 }}>
                          <span style={{ flex: 1 }}>{c.nickname}</span>
                          <button className="sync-btn" style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={busy} onClick={() => addFriend(modalMember.id, c.id)}>추가</button>
                        </div>
                      ))}
                      {candidates.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>추가 가능한 클랜원이 없습니다.</p>}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>지인이 최대(3명)입니다.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {/* 지인 추가 버튼 (운영진만) */}
      {isAdmin && (
        <div style={{ marginBottom: 14 }}>
          <button className="sync-btn" onClick={openAddModal}>+ 지인 추가</button>
        </div>
      )}

      {/* 검색 */}
      <div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
        <input
          placeholder="클랜원 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
        />
      </div>

      {loading ? <p>불러오는 중...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {filtered.map((m) => (
              <div key={m.id} className="home-panel" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{m.nickname}</span>
                  {isAdmin && (
                    <button className="edit-btn" style={{ fontSize: 11, padding: "3px 8px" }}
                      onClick={() => { setModal(m); setFriendSearch(""); }}>관리</button>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {m.friends.map((f) => (
                    <div key={f.friendId} style={{ padding: "6px 10px", borderRadius: 8,
                      background: "var(--card-2)", fontSize: 13, fontWeight: 700 }}>
                      {f.friendName}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          {filtered.length === 0 && <p style={{ gridColumn: "1/-1", color: "var(--muted)" }}>등록된 지인이 없습니다.</p>}
        </div>
      )}
    </div>
  );
}
