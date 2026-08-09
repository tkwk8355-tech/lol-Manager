"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { LINES, lineIconUrl } from "@/lib/lines";

type Mode = "aram" | "normal" | "flex" | "solo";
type Tab = Mode | "all";

interface Participant {
  userId: number;
  nickname: string;
  line: string | null;
}
interface Party {
  id: number;
  mode: Mode;
  maxSize: number;
  status: "open" | "full";
  hostUserId: number;
  hostNickname: string;
  note: string | null;
  startAt: string | null;
  createdAt: string;
  participants: Participant[];
  waiting: Participant[];
}

const MODES: Mode[] = ["aram", "normal", "flex", "solo"];
const TABS: Tab[] = ["all", ...MODES];
const MODE_KO: Record<Mode, string> = { aram: "칼바람", normal: "일반 협곡", flex: "자유랭크", solo: "솔랭" };
const MODE_ICON: Record<Mode, string> = { aram: "🌊", normal: "⚔️", flex: "🏆", solo: "👤" };
const TAB_KO: Record<Tab, string> = { all: "전체", ...MODE_KO };
const RIFT_MODES: Mode[] = ["normal", "flex", "solo"];

function lineLabel(key: string | null) {
  if (!key) return null;
  if (key === "ALL") return "ALL";
  return key.split(",").join("/");
}

function fmtStart(startAt: string | null): string {
  if (!startAt) return "모바시";
  const d = new Date(startAt.replace(" ", "T"));
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `오늘 ${time}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `내일 ${time}`;
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${time}`;
}

const MAX_LINES = 2;

function LinePicker({
  value, onChange, disabledKeys,
}: {
  value: string; onChange: (value: string) => void; disabledKeys?: Set<string>;
}) {
  const selected = value === "ALL" ? [] : value.split(",").filter(Boolean);
  const isAll = value === "ALL";

  function toggleLine(key: string) {
    if (isAll) return;
    if (selected.includes(key)) { onChange(selected.filter((k) => k !== key).join(",")); return; }
    if (selected.length >= MAX_LINES) return;
    onChange([...selected, key].join(","));
  }

  function toggleAll() { onChange(isAll ? "" : "ALL"); }

  return (
    <div className="line-picker">
      {LINES.map((l) => {
        const on = selected.includes(l.key);
        const disabled = isAll || (disabledKeys?.has(l.key) && !on) || (!on && selected.length >= MAX_LINES);
        return (
          <button key={l.key} type="button" className={`line-picker-btn ${on ? "on" : ""}`} disabled={disabled} title={l.label} onClick={() => toggleLine(l.key)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lineIconUrl(l.icon)} alt={l.label} width={20} height={20} />
          </button>
        );
      })}
      <button type="button" className={`line-picker-btn all ${isAll ? "on" : ""}`} title="라인 무관" onClick={toggleAll}>ALL</button>
    </div>
  );
}

export default function PartyPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const effectiveMode = tab === "all" ? "normal" : tab;
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");
  const [line, setLine] = useState("");
  const [startTime, setStartTime] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/party?mode=${t}`);
      const json = await res.json();
      if (!res.ok) setError(json.error || "불러오기 실패");
      else setParties(json.parties);
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); setParties([]); return; }
    load(tab);
  }, [tab, load, user, authLoading]);

  async function createParty(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setError("");
    try {
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: effectiveMode,
          note: note.trim() || null,
          line: RIFT_MODES.includes(effectiveMode) ? (line || null) : null,
          startTime: startTime.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "파티 생성 실패");
      else { setNote(""); setLine(""); setStartTime(""); load(tab); }
    } catch { setError("네트워크 오류"); }
    finally { setCreating(false); }
  }

  async function joinParty(partyId: number, joinLine: string | null) {
    setBusyId(partyId); setError("");
    try {
      const res = await fetch("/api/party/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, line: joinLine }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "참가 실패");
      else load(tab);
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  async function leaveParty(partyId: number) {
    setBusyId(partyId); setError("");
    try {
      const res = await fetch(`/api/party/join?partyId=${partyId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "처리 실패");
      else load(tab);
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  async function deleteParty(partyId: number) {
    setBusyId(partyId); setError("");
    try {
      const res = await fetch(`/api/party?id=${partyId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "삭제 실패");
      else load(tab);
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="party">
      <h2 className="party-title">파티 생성</h2>
      <p className="party-sub">칼바람 · 협곡 같이 할 클랜원을 모집해보세요.</p>

      <div className="scrim-tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {TAB_KO[t]}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {authLoading ? null : !user ? (
        <div className="party-login-notice">
          파티 목록을 보거나 파티를 만들려면 로그인이 필요합니다.
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
        </div>
      ) : (
        <>
          {tab === "all" ? (
            <p className="party-all-notice">전체 탭에서는 목록만 볼 수 있습니다. 파티를 만들려면 위에서 종류를 선택하세요.</p>
          ) : !user.linkedRiotId ? (
            <div className="party-login-notice">클랜원 계정과 연동되어 있지 않습니다. 운영진에게 계정 연동을 요청하세요.</div>
          ) : (
            <form className="party-create-form" onSubmit={createParty}>
              <span className="party-mode-fixed">{MODE_KO[effectiveMode]}</span>
              <input
                className="party-note-input"
                placeholder="파티 소개 (선택)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={255}
              />
              <input
                className="party-time-text-input"
                placeholder="시작 시간 (예: 21:30, 선택)"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                maxLength={5}
              />
              {RIFT_MODES.includes(effectiveMode) && (
                <LinePicker value={line} onChange={setLine} />
              )}
              <button type="submit" disabled={creating}>{creating ? "생성 중..." : "파티 만들기"}</button>
            </form>
          )}

          {loading && <p className="party-empty">불러오는 중...</p>}
          {!loading && parties.length === 0 && (
            <p className="party-empty">모집 중인 파티가 없습니다. 먼저 하나 만들어보세요.</p>
          )}

          <PartyList
            parties={parties}
            loading={loading}
            user={user}
            busyId={busyId}
            onJoin={joinParty}
            onLeave={leaveParty}
            onDelete={deleteParty}
          />
        </>
      )}
    </div>
  );
}

function PartyList({
  parties, loading, user, busyId, onJoin, onLeave, onDelete,
}: {
  parties: Party[];
  loading: boolean;
  user: { userId: number; username: string; nickname: string; role: string; linkedRiotId: string | null } | null;
  busyId: number | null;
  onJoin: (partyId: number, line: string | null) => void;
  onLeave: (partyId: number) => void;
  onDelete: (partyId: number) => void;
}) {
  const [joinLine, setJoinLine] = useState<Record<number, string>>({});

  if (loading) return null;
  if (parties.length === 0) return null;

  return (
    <div className="party-list">
      {parties.map((p) => {
        const usedLines = new Set(
          p.participants
            .filter((pp) => pp.line && pp.line !== "ALL" && !pp.line.includes(","))
            .map((pp) => pp.line as string)
        );
        const isParticipant = !!user && p.participants.some((pp) => pp.userId === user.userId);
        const isWaitingParticipant = !!user && p.waiting.some((pp) => pp.userId === user.userId);
        const isJoinedAny = isParticipant || isWaitingParticipant;
        const isFull = p.status === "full" || p.participants.length >= p.maxSize;

        return (
          <div className={`party-card ${p.status}`} key={p.id}>
            <div className="party-card-head">
              <span className={`party-mode-badge mode-${p.mode}`}>{MODE_ICON[p.mode]} {MODE_KO[p.mode]}</span>
              <span className="party-card-title">{p.note || ""}</span>
              <span className="party-start">{fmtStart(p.startAt)}</span>
              <span className="party-count">{p.participants.length}/{p.maxSize}명</span>
              {isFull && <span className="party-full-badge">마감</span>}
            </div>

            <div className="party-participants">
              {p.participants.map((pp) => (
                <span className="party-participant-chip" key={pp.userId}>
                  {pp.nickname}{pp.line ? ` · ${lineLabel(pp.line)}` : ""}
                </span>
              ))}
            </div>
            {p.waiting.length > 0 && (
              <div className="party-waiting-row">
                <span className="party-waiting-label">대기</span>
                <div className="party-participants">
                  {p.waiting.map((pp) => (
                    <span className="party-participant-chip waiting" key={pp.userId}>
                      {pp.nickname}{pp.line ? ` · ${lineLabel(pp.line)}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="party-actions">
              {!user || !user.linkedRiotId ? null : (
                <>
                  {isParticipant && (
                    <button className="party-boom-btn" disabled={busyId === p.id} onClick={() => { if (!confirm("파티를 종료할까요? (모든 참가자가 퍼집니다)")) return; onDelete(p.id); }}>
                      {busyId === p.id ? "처리 중..." : "💥 펑 (파티 종료)"}
                    </button>
                  )}
                  {isJoinedAny && (
                    <button className="party-leave-btn" disabled={busyId === p.id} onClick={() => { if (!confirm(isWaitingParticipant ? "대기를 취소할까요?" : "참가를 취소할까요?")) return; onLeave(p.id); }}>
                      {busyId === p.id ? "처리 중..." : isWaitingParticipant ? "대기 취소" : "참가 취소"}
                    </button>
                  )}
                  {!isJoinedAny && (
                    <div className="party-join-row">
                      {RIFT_MODES.includes(p.mode) && (
                        <LinePicker
                          value={joinLine[p.id] ?? ""}
                          onChange={(v) => setJoinLine((prev) => ({ ...prev, [p.id]: v }))}
                          disabledKeys={isFull ? undefined : usedLines}
                        />
                      )}
                      <button
                        className="party-join-btn"
                        disabled={busyId === p.id}
                        onClick={() => onJoin(p.id, joinLine[p.id] || null)}
                      >
                        {busyId === p.id ? "처리 중..." : isFull ? "대기 신청" : "참가"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
