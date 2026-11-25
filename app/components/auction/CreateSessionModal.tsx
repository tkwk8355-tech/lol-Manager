"use client";

import { useEffect, useState } from "react";
import { AUCTION_TYPE_LABEL, MemberSearchInput, type AuctionType, type Member, type RosterEntry } from "./shared";

interface CaptainDraft { memberId: number; nickname: string; points: number; captainUserId: number | null; }

/**
 * 새 경매 생성: 경매 방식 + 경매 이름 + 팀장(시작 포인트, 연결할 팀장 계정) 지정.
 * - 팀원 경매: 참여자 중에서 팀장을 고르고, 팀장 본인 라인을 뺀 4라인을 경매한다.
 * - 팀 경매: 참여자가 아닌 클랜원이 팀장을 맡고, 참여자로 5라인을 모두 경매한다.
 * 팀장 외 참여자는 전원 선수로 자동 포함.
 */
export default function CreateSessionModal({ members, roster, onClose, onCreated }: {
  members: Member[]; roster: RosterEntry[]; onClose: () => void; onCreated: (id: number) => void;
}) {
  const [type, setType] = useState<AuctionType>("member");
  const [captains, setCaptains] = useState<CaptainDraft[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [captainAccounts, setCaptainAccounts] = useState<{ id: number; nickname: string }[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const usedIds = captains.map(c => c.memberId);
  const rosterIds = new Set(roster.map(r => r.member_id));
  const rosterMembers = members.filter(m => rosterIds.has(m.id));
  // 팀 경매의 팀장은 참여자가 아닌 클랜원 중에서 고른다.
  const captainPool = type === "team" ? members.filter(m => !rosterIds.has(m.id)) : rosterMembers;
  const players = roster.filter(r => !usedIds.includes(r.member_id));

  useEffect(() => {
    fetch("/api/auction/captains").then(r => r.json()).then(j => setCaptainAccounts(j.captains ?? []));
  }, []);

  function changeType(t: AuctionType) {
    if (t === type) return;
    setType(t); setCaptains([]); setErr("");
  }

  function updateCaptain(i: number, patch: Partial<CaptainDraft>) {
    setCaptains(prev => prev.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  }

  async function submit() {
    if (captains.length < 2) { setErr("팀장을 2명 이상 추가하세요."); return; }
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/auction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name: sessionName || null, captains: captains.map(c => ({ memberId: c.memberId, points: c.points, captainUserId: c.captainUserId })) }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || "생성 실패"); return; }
      onCreated(json.sessionId);
    } catch { setErr("네트워크 오류"); } finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal auc-create">
        <div className="modal-head">
          <span>새 경매 만들기</span>
          <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="auc-field">
          <span className="auc-label">경매 방식</span>
          <div className="ev-seg">
            {(["member", "team"] as const).map(t => (
              <button key={t} type="button" className={type === t ? "on" : ""} onClick={() => changeType(t)}>{AUCTION_TYPE_LABEL[t]}</button>
            ))}
          </div>
          <span className="auc-hint">
            {type === "member"
              ? "참여자 중에서 팀장을 고르고, 팀장 라인을 뺀 4라인을 경매해요."
              : "참여자가 아닌 클랜원이 팀장을 맡고, 참여자로 5라인을 모두 경매해요."}
          </span>
        </div>

        <label className="auc-field">
          <span className="auc-label">경매 이름</span>
          <input className="ui-input" autoFocus placeholder="예: 9/13 내전 경매" value={sessionName} onChange={e => setSessionName(e.target.value)} />
        </label>

        <div className="auc-create-grid">
          <section className="auc-panel">
            <div className="auc-panel-head">
              <span>팀장</span><span className="auc-count">{captains.length}명</span>
            </div>
            <MemberSearchInput members={captainPool} usedIds={usedIds}
              placeholder={type === "team" ? "팀장을 맡을 클랜원 검색 (참여자 제외)" : "팀장으로 지정할 참여자 검색"}
              onSelect={m => setCaptains(prev => [...prev, { memberId: m.id, nickname: m.nickname, points: 1000, captainUserId: null }])} />
            <div className="auc-cap-list">
              {captains.length === 0 && <div className="auc-hint">팀장을 2명 이상 지정하세요.</div>}
              {captains.map((c, i) => (
                <div key={c.memberId} className="auc-cap-row">
                  <span className="auc-cap-name">{c.nickname}</span>
                  <select className="ui-select sm" value={c.captainUserId ?? ""} title="입찰할 팀장 계정"
                    onChange={e => updateCaptain(i, { captainUserId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">계정 선택</option>
                    {captainAccounts.map(a => (<option key={a.id} value={a.id}>{a.nickname}</option>))}
                  </select>
                  <span className="auc-pt-input">
                    <input className="ui-input sm" type="number" min={100} step={100} value={c.points} title="시작 포인트"
                      onChange={e => updateCaptain(i, { points: Number(e.target.value) })} />
                    <em>pt</em>
                  </span>
                  <button className="auc-icon-btn" aria-label="팀장 제외" onClick={() => setCaptains(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
          </section>

          <section className="auc-panel">
            <div className="auc-panel-head">
              <span>선수</span><span className="auc-count">{players.length}명</span>
            </div>
            {players.length === 0
              ? <div className="auc-hint">참여자 관리에서 먼저 참여자를 등록하세요.</div>
              : <div className="auc-player-chips">
                  {players.map(r => (<span key={r.member_id} className="auc-chip" title={r.nickname}>{r.nickname}</span>))}
                </div>}
            {roster.length > 0 && <div className="auc-hint">팀장을 제외한 참여자 전원이 자동으로 포함돼요.</div>}
          </section>
        </div>

        {err && <div className="error auc-err">{err}</div>}
        <div className="auc-modal-foot">
          <span className="auc-summary">팀장 {captains.length}명 · 선수 {players.length}명</span>
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>{loading ? "생성 중…" : "경매 생성"}</button>
        </div>
      </div>
    </div>
  );
}
