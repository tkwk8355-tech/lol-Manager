"use client";

// =============================================================
// 경매내전 메인: 경매 목록 / 참여자 관리 탭 + 경매방 입장.
// 이벤트 페이지(/event)의 "경매내전" 탭에서 사용한다. (/auction 은 /event 로 이동)
// =============================================================

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import AuctionRoom from "./AuctionRoom";
import CreateSessionModal from "./CreateSessionModal";
import RosterManager from "./RosterManager";
import { AUCTION_TYPE_LABEL, STATUS_BADGE, STATUS_LABEL, type Member, type RosterEntry, type SessionListItem } from "./shared";

export default function AuctionContent() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"sessions" | "roster">("sessions");
  const [loadingData, setLoadingData] = useState(true);
  const isAdmin = user?.role === "admin" || user?.role === "subadmin";
  const isOwner = user?.role === "admin";
  const myUserId = user?.userId ?? null;

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/auction");
    if (res.ok) { const json = await res.json(); setSessions(json.sessions); }
  }, []);
  const loadRoster = useCallback(async () => {
    const res = await fetch("/api/auction/roster");
    if (res.ok) { const json = await res.json(); setRoster(json.roster); }
  }, []);

  useEffect(() => {
    if (authLoading || !user) { setLoadingData(false); return; }
    Promise.all([
      fetch("/api/userinfo").then(r => r.json()).then(j => {
        if (j.members) setMembers(j.members
          .filter((m: any) => m.mainLine !== "ARAM" && m.status !== "withdraw" && m.status !== "black")
          .map((m: any) => ({ id: m.id, nickname: m.nickname })));
      }),
      loadSessions(),
      loadRoster(),
    ]).finally(() => setLoadingData(false));
  }, [user, authLoading, loadSessions, loadRoster]);

  async function deleteSession(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch("/api/auction?sessionId=" + id, { method: "DELETE" });
    loadSessions();
  }

  if (authLoading || loadingData) return null;
  if (!user) return (
    <div className="party-login-notice">이벤트 시스템을 이용하려면 로그인이 필요합니다.
      <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
    </div>
  );
  if (user.scrimOnly) return <div className="party-login-notice">이벤트 시스템에 접근할 수 없습니다.</div>;

  const activeSession = sessions.find(s => s.id === activeId) ?? null;
  const canSeeRoster = isAdmin || user.showRoster;

  // ---------- 경매방 ----------
  if (activeId) return (
    <div>
      <div className="auc-room-bar">
        <button className="btn-secondary" onClick={() => setActiveId(null)}>← 목록으로</button>
        <span className="auc-room-title">{activeSession?.name || `세션 #${activeId}`}</span>
      </div>
      <AuctionRoom sessionId={activeId} isAdmin={isAdmin} isOwner={isOwner} myUserId={myUserId} />
    </div>
  );

  // ---------- 목록 / 참여자 관리 ----------
  return (
    <div>
      <div className="ev-bar">
        <div className="ev-seg">
          <button className={tab === "sessions" ? "on" : ""} onClick={() => setTab("sessions")}>경매 목록</button>
          {canSeeRoster && <button className={tab === "roster" ? "on" : ""} onClick={() => setTab("roster")}>참여자 관리</button>}
        </div>
        {tab === "sessions" && isAdmin && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ 새 경매</button>}
      </div>

      {tab === "sessions" && (
        <div className="ev-list">
          {sessions.length === 0 && <p className="ui-empty">경매 세션이 없습니다.{isAdmin && " 오른쪽 위 ‘+ 새 경매’로 시작해 보세요."}</p>}
          {sessions.map(s => (
            <div key={s.id} className="ui-card ev-row" onClick={() => setActiveId(s.id)}>
              <div className="ev-row-main">
                <span className="ev-row-title">{s.name || `세션 #${s.id}`}</span>
                <span className="ev-row-meta">{AUCTION_TYPE_LABEL[s.auction_type ?? "member"]} · 참가자 {s.player_count}명 · {new Date(s.created_at).toLocaleDateString("ko-KR")}</span>
              </div>
              <span className={`ui-badge ${STATUS_BADGE[s.status] ?? ""}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
              <button className="btn-secondary ev-enter" onClick={e => { e.stopPropagation(); setActiveId(s.id); }}>입장</button>
              {isAdmin && <button className="del-btn" onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>삭제</button>}
            </div>
          ))}
        </div>
      )}
      {tab === "roster" && <RosterManager members={members} roster={roster} isAdmin={isAdmin} onSaved={loadRoster} />}

      {showCreate && (
        <CreateSessionModal members={members} roster={roster} onClose={() => setShowCreate(false)}
          onCreated={id => { setShowCreate(false); loadSessions(); setActiveId(id); setTab("sessions"); }} />
      )}
    </div>
  );
}
