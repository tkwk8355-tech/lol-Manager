"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";

type Mode = "aram" | "normal" | "flex" | "solo" | "scrim";
type Tab = Mode | "all";

interface Participant { userId: number | null; nickname: string; }
interface Party {
  id: number; mode: Mode; maxSize: number; status: "open" | "full";
  hostUserId: number; hostNickname: string; note: string | null;
  startAt: string | null; createdAt: string;
  participants: Participant[]; waiting: Participant[];
}

const MODES: Mode[] = ["flex", "solo", "aram", "normal", "scrim"];
const TABS: Tab[] = ["all", ...MODES];
const MODE_KO: Record<Mode, string> = { aram: "칼바람", normal: "일반협곡", flex: "자유랙크", solo: "솔로랙크", scrim: "내전" };
const MODE_ICON: Record<Mode, string> = { aram: "🌊", normal: "⚔️", flex: "🏆", solo: "👤", scrim: "🛡️" };
const TAB_KO: Record<Tab, string> = { all: "전체", flex: "자유랙크", solo: "솔로랙크", aram: "칼바람", normal: "일반협곡", scrim: "내전" };

function fmtStart(startAt: string | null): string {
  if (!startAt) return "미정";
  const d = new Date(startAt.replace(" ", "T"));
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `오늘 ${time}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `내일 ${time}`;
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${time}`;
}

const isAdmin = (role: string) => role === "admin" || role === "subadmin";

function ParticipantInput({ value, onChange, onAddNext, autoFocusOnMount }: {
  value: string; onChange: (v: string) => void; onAddNext: () => void; autoFocusOnMount?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
  }, [autoFocusOnMount]);

  async function handleChange(v: string) {
    if (v.endsWith(" ") && value.trim()) {
      onChange(value.trim()); setSuggestions([]); onAddNext(); return;
    }
    onChange(v);
    if (!v.trim()) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/party/members?q=${encodeURIComponent(v.trim())}`);
      const json = await res.json();
      setSuggestions((json.members ?? []).map((m: any) => m.gameName));
    } catch { setSuggestions([]); }
  }

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        ref={inputRef}
        className="party-participant-nick-input"
        placeholder="본계정 닉네임"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const confirmed = suggestions.length > 0 ? suggestions[0] : value.trim();
            if (confirmed) { onChange(confirmed); setSuggestions([]); onAddNext(); }
          }
        }}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        maxLength={50}
      />
      {suggestions.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 20 }}>
          {suggestions.map((s) => (
            <button key={s} type="button" onMouseDown={() => { onChange(s); setSuggestions([]); }}>{s}</button>
          ))}
        </div>
      )}
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
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("");
  const [participants, setParticipants] = useState<string[]>([""]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editParticipants, setEditParticipants] = useState<string[]>([""]);
  const [aramModal, setAramModal] = useState<number | null>(null); // partyId
  const [aramGames, setAramGames] = useState("");

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
          startDate: startDate,
          startTime: startTime.trim() || null,
          participants: participants.map((n) => n.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "파티 생성 실패");
      else { setNote(""); setStartDate(new Date().toISOString().slice(0, 10)); setStartTime(""); setParticipants([""]); load(tab); }
    } catch { setError("네트워크 오류"); }
    finally { setCreating(false); }
  }

  function updateParticipant(i: number, val: string) {
    setParticipants((prev) => prev.map((v, idx) => idx === i ? val : v));
  }
  const createMaxSize = effectiveMode === "solo" ? 2 : 5;
  function addParticipant() { setParticipants((prev) => prev.length >= createMaxSize ? prev : [...prev, ""]); }
  function removeParticipant(i: number) {
    setParticipants((prev) => prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i));
  }

  async function deleteParty(partyId: number, games?: number) {
    setBusyId(partyId); setError("");
    try {
      const url = games != null
        ? `/api/party?id=${partyId}&games=${games}`
        : `/api/party?id=${partyId}`;
      const res = await fetch(url, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "삭제 실패");
      else load(tab);
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  async function saveEdit(partyId: number) {
    setBusyId(partyId); setError("");
    try {
      const res = await fetch("/api/party", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: partyId,
          participants: editParticipants.map((n) => n.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "수정 실패");
      else { setEditingId(null); load(tab); }
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="party">
      {aramModal !== null && (
        <div className="modal-backdrop" onClick={() => setAramModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div className="modal-head">
              <span>🌊 칼바람 판수 입력</span>
              <button className="modal-close" onClick={() => setAramModal(null)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>4판당 5점, 하루 최대 5점</p>
              <input
                autoFocus
                type="number"
                min={0}
                placeholder="플레이한 판수"
                value={aramGames}
                onChange={(e) => setAramGames(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const g = Number(aramGames);
                    if (!isNaN(g) && g >= 0) { setAramModal(null); deleteParty(aramModal!, g); }
                  }
                }}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="sync-btn" style={{ flex: 1 }} onClick={() => {
                  const g = Number(aramGames);
                  if (!isNaN(g) && g >= 0) { setAramModal(null); deleteParty(aramModal!, g); }
                }}>펑</button>
                <button className="cancel-btn" style={{ flex: 1 }} onClick={() => setAramModal(null)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <h2 className="party-title">또간집 파티 기록 장부</h2>
      <p className="party-sub">전체 · 자랭 · 솔랭 · 칼바람 · 일반 협곡</p>

      <div className="scrim-tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{TAB_KO[t]}</button>
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
          {isAdmin(user.role) && (
            <form className="party-create-form" onSubmit={createParty}>
              <select className="party-mode-select" value={effectiveMode} onChange={(e) => setTab(e.target.value as Mode)}>
                {MODES.map((m) => <option key={m} value={m}>{MODE_KO[m]}</option>)}
              </select>
              <input className="party-note-input" placeholder="메모 (선택)" value={note}
                onChange={(e) => setNote(e.target.value)} maxLength={255} />
              <input
                type="date"
                className="party-time-text-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <input
                className="party-time-text-input"
                placeholder="시작 시간 (2100 → 21:00)"
                value={startTime}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                  if (v.length === 4) v = v.slice(0, 2) + ":" + v.slice(2);
                  setStartTime(v);
                }}
                maxLength={5}
                required
                onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity("시작 시간을 입력하세요.")}
                onInput={(e) => (e.target as HTMLInputElement).setCustomValidity("")}
              />
              <div className="party-participants-input">
                <span className="party-participants-label">참가자</span>
                {participants.map((nick, i) => (
                  <div key={i} className="party-participant-row">
                    <ParticipantInput value={nick} onChange={(v) => updateParticipant(i, v)} onAddNext={addParticipant} autoFocusOnMount={i === participants.length - 1 && i > 0} />
                    <button type="button" className="party-participant-add-inline" onClick={addParticipant} title="인원 추가" disabled={participants.length >= createMaxSize}>+</button>
                    <button type="button" className="party-participant-remove" onClick={() => removeParticipant(i)}>✕</button>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={creating}>{creating ? "생성 중..." : "파티 만들기"}</button>
            </form>
          )}

          {loading && <p className="party-empty">불러오는 중...</p>}
          {!loading && parties.length === 0 && <p className="party-empty">모집 중인 파티가 없습니다.</p>}

          <div className="party-list" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {parties.map((p) => {
              const isEditing = editingId === p.id;
              return (
                <div className={`party-card ${p.status}`} key={p.id}>
                  <div className="party-card-head">
                    <span className={`party-mode-badge mode-${p.mode}`}>{MODE_ICON[p.mode]} {MODE_KO[p.mode]}</span>
                    <span className="party-card-title">{p.note || ""}</span>
                    <span className="party-start">{fmtStart(p.startAt)}</span>
                    <span className="party-count">{p.participants.length}명</span>
                  </div>

                  {isEditing ? (
                    <div className="party-edit-area">
                      {editParticipants.map((nick, i) => (
                        <div key={i} className="party-participant-row">
                          <ParticipantInput
                            value={nick}
                            onChange={(v) => setEditParticipants((prev) => prev.map((x, idx) => idx === i ? v : x))}
                            onAddNext={() => setEditParticipants((prev) => prev.length >= p.maxSize ? prev : [...prev, ""])}
                            autoFocusOnMount={i === editParticipants.length - 1 && i > 0}
                          />
                          <button type="button" className="party-participant-add-inline"
                            onClick={() => setEditParticipants((prev) => prev.length >= p.maxSize ? prev : [...prev, ""])} disabled={editParticipants.length >= p.maxSize}>+</button>
                          <button type="button" className="party-participant-remove"
                            onClick={() => setEditParticipants((prev) => prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i))}>✕</button>
                        </div>
                      ))}
                      <div className="party-actions" style={{ marginTop: 8 }}>
                        <button className="save-btn" disabled={busyId === p.id} onClick={() => saveEdit(p.id)}>
                          {busyId === p.id ? "저장 중..." : "저장"}
                        </button>
                        <button className="cancel-btn" onClick={() => setEditingId(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="party-participants">
                      {p.participants.map((pp, i) => (
                        <span className="party-participant-chip" key={i}>{pp.nickname}</span>
                      ))}
                    </div>
                  )}

                  {isAdmin(user.role) && !isEditing && (
                    <div className="party-actions">
                      <button className="edit-btn" onClick={() => {
                        setEditingId(p.id);
                        setEditParticipants(p.participants.map((pp) => pp.nickname));
                      }}>수정</button>
                      <button className="party-boom-btn" disabled={busyId === p.id}
                        onClick={() => {
                          if (!confirm("파티를 종료할까요?")) return;
                          if (p.mode === "aram") { setAramGames(""); setAramModal(p.id); }
                          else deleteParty(p.id);
                        }}>
                        {busyId === p.id ? "처리 중..." : "💥 펑 (파티 종료)"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
