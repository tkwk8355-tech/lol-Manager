"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";

type Mode = "aram" | "normal" | "flex" | "solo";
type Tab = Mode | "all";

interface Participant { userId: number | null; nickname: string; }
interface Party {
  id: number; mode: Mode; maxSize: number; status: "open" | "full";
  hostUserId: number; hostNickname: string; note: string | null;
  startAt: string | null; createdAt: string;
  participants: Participant[]; waiting: Participant[];
  historyParticipants: string[];
}

const MODES: Mode[] = ["flex", "solo", "aram", "normal"];
const TABS: Tab[] = ["all", ...MODES];
const MODE_KO: Record<Mode, string> = { aram: "칼바람", normal: "일반협곡", flex: "자유랭크", solo: "솔로랭크" };
const TAB_KO: Record<Tab, string> = { all: "전체", flex: "자유랭크", solo: "솔로랭크", aram: "칼바람", normal: "일반협곡" };

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

function ParticipantInput({ value, onChange, onAddNext, autoFocusOnMount, isLast, existingValues }: {
  value: string; onChange: (v: string) => void; onAddNext: () => void; autoFocusOnMount?: boolean; isLast?: boolean; existingValues?: string[];
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
  }, [autoFocusOnMount]);

  async function handleChange(v: string) {
    onChange(v);
    setActiveIdx(-1);
    if (!v.trim()) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/party/members?q=${encodeURIComponent(v.trim())}`);
      const json = await res.json();
      const others = (existingValues ?? []).map(s => s.toLowerCase());
      setSuggestions((json.members ?? []).map((m: any) => m.gameName).filter((n: string) => n.toLowerCase() !== value.toLowerCase() && !others.includes(n.toLowerCase())));
    } catch { setSuggestions([]); }
  }

  function confirm(name: string) {
    onChange(name); setSuggestions([]); setActiveIdx(-1);
    if (isLast) onAddNext();
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
          if (suggestions.length > 0 && e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (suggestions.length > 0 && e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = activeIdx >= 0 ? suggestions[activeIdx] : suggestions.length > 0 ? suggestions[0] : value.trim();
            if (picked) confirm(picked);
          } else if (e.key === "Escape") {
            setSuggestions([]); setActiveIdx(-1);
          }
        }}
        onBlur={() => setTimeout(() => { setSuggestions([]); setActiveIdx(-1); }, 150)}
        maxLength={50}
      />
      {suggestions.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 20 }}>
          {suggestions.map((s, i) => (
            <button key={s} type="button"
              className={i === activeIdx ? "active" : ""}
              onMouseDown={() => confirm(s)}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PartyPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [createMode, setCreateMode] = useState<Mode>("normal");
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState(() => {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
});
  const [startTime, setStartTime] = useState("");
  const [participants, setParticipants] = useState<string[]>([""]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editParticipants, setEditParticipants] = useState<string[]>([""]);
  const [aramModal, setAramModal] = useState<{id:number;participants:Participant[]} | null>(null);
  const [aramMemberGames, setAramMemberGames] = useState<Record<string,string>>({});
  const [settingsModal, setSettingsModal] = useState(false);
  const [pointSettings, setPointSettings] = useState<{mode:string;points:number;min_games:number}[]>([]);
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (settingsModal) { setSettingsModal(false); return; }
      if (aramModal !== null) { setAramModal(null); return; }

    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsModal, aramModal]);

  async function openSettings() {
    const res = await fetch("/api/party/settings");
    const json = await res.json();
    setPointSettings(json.settings ?? []);
    setSettingsModal(true);
  }
  async function saveSettings() {
    setSettingsBusy(true);
    await fetch("/api/party/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pointSettings) });
    setSettingsBusy(false);
    setSettingsModal(false);
  }

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
          mode: createMode,
          note: note.trim() || null,
          startDate: startDate,
          startTime: startTime.trim() || null,
          participants: participants.map((n) => n.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "파티 생성 실패");
      else { setNote(""); setStartDate(new Date(new Date().getTime() + 9*60*60*1000).toISOString().slice(0,10)); setStartTime(""); setParticipants([""]); load(tab); }
    } catch { setError("네트워크 오류"); }
    finally { setCreating(false); }
  }

  function updateParticipant(i: number, val: string) {
    setParticipants((prev) => prev.map((v, idx) => idx === i ? val : v));
  }
  const createMaxSize = createMode === "solo" ? 2 : 5;
  function addParticipant() { setParticipants((prev) => prev.length >= createMaxSize ? prev : [...prev, ""]); }
  function removeParticipant(i: number) {
    setParticipants((prev) => prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i));
  }

  async function deleteParty(partyId: number, memberGames?: Record<string,number>) {
    setBusyId(partyId); setError("");
    try {
      const res = memberGames
        ? await fetch("/api/party", { method: "DELETE", headers: {"Content-Type":"application/json"}, body: JSON.stringify({id: partyId, memberGames}) })
        : await fetch(`/api/party?id=${partyId}`, { method: "DELETE" });
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

  const participantRows = (
    list: string[],
    setList: (fn: (prev: string[]) => string[]) => void,
    max: number,
  ) => list.map((nick, i) => (
    <div key={i} className="pt-prow">
      <span className="no">{i + 1}</span>
      <ParticipantInput
        value={nick}
        onChange={(v) => setList((prev) => prev.map((x, idx) => idx === i ? v : x))}
        onAddNext={() => setList((prev) => prev.length >= max ? prev : [...prev, ""])}
        autoFocusOnMount={i === list.length - 1 && i > 0}
        isLast={i === list.length - 1}
        existingValues={list.filter((_, idx) => idx !== i)}
      />
      <button type="button" className="pt-icon" title="삭제"
        onClick={() => setList((prev) => prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i))}>✕</button>
    </div>
  ));

  return (
    <div className="party pt">
      {settingsModal && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <span>파티 점수 설정</span>
              <button className="modal-close" onClick={() => setSettingsModal(false)}>×</button>
            </div>
            <div className="ui-table-wrap" style={{ marginBottom: 16 }}>
              <table className="ui-table">
                <thead>
                  <tr><th>모드</th><th style={{ textAlign: "center" }}>지급 포인트</th><th style={{ textAlign: "center" }}>최소 판수</th></tr>
                </thead>
                <tbody>
                  {pointSettings.map((s, i) => (
                    <tr key={s.mode}>
                      <td style={{ fontWeight: 700 }}>{MODE_KO[s.mode as Mode] ?? s.mode}</td>
                      <td style={{ textAlign: "center" }}>
                        <input type="number" min={0} value={s.points} className="ui-input pt-num"
                          onChange={(e) => setPointSettings(prev => prev.map((x, j) => j === i ? { ...x, points: Number(e.target.value) } : x))} />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input type="number" min={1} value={s.min_games} className="ui-input pt-num"
                          onChange={(e) => setPointSettings(prev => prev.map((x, j) => j === i ? { ...x, min_games: Number(e.target.value) } : x))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setSettingsModal(false)}>취소</button>
              <button className="btn-primary" disabled={settingsBusy} onClick={saveSettings}>{settingsBusy ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      )}
      {aramModal !== null && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <span>칼바람 판수 입력</span>
              <button className="modal-close" onClick={() => setAramModal(null)}>×</button>
            </div>
            <p className="pt-hint">참가자별 판수를 입력하세요. (4판당 5점, 하루 최대 5점)</p>
            <div className="pt-aram-list">
              {aramModal.participants.map((pp) => (
                <div key={pp.nickname} className="pt-aram-row">
                  <span>{pp.nickname}</span>
                  <input
                    type="number" min={0} placeholder="판수" className="ui-input pt-num"
                    value={aramMemberGames[pp.nickname] ?? ""}
                    onChange={(e) => setAramMemberGames(prev => ({ ...prev, [pp.nickname]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setAramModal(null)}>취소</button>
              <button className="btn-primary" onClick={() => {
                const mg: Record<string,number> = {};
                for (const pp of aramModal!.participants) {
                  const g = Number(aramMemberGames[pp.nickname] ?? 0);
                  mg[pp.nickname] = isNaN(g) ? 0 : g;
                }
                const id = aramModal!.id;
                setAramModal(null);
                deleteParty(id, mg);
              }}>파티 종료</button>
            </div>
          </div>
        </div>
      )}

      <div className="ui-page-head">
        <div>
          <h2>파티 모집</h2>
          <p>자유랭크 · 솔로랭크 · 칼바람 · 일반협곡 파티 기록</p>
        </div>
        {user && isAdmin(user.role) && (
          <div className="ui-page-actions">
            <button type="button" className="btn-secondary" onClick={openSettings}>⚙ 점수 설정</button>
          </div>
        )}
      </div>

      <div className="ui-tabs">
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
      ) : (user.role === "captain" || user.scrimOnly) ? (
        <div className="party-login-notice">접근 권한이 없습니다.</div>
      ) : (
        <>
          {isAdmin(user.role) && (
            <form className="ui-card pt-create" onSubmit={createParty}>
              <div className="pt-create-head">
                <b>새 파티</b>
                <div className="pt-modes">
                  {MODES.map((m) => (
                    <button key={m} type="button" className={`pt-mode ${createMode === m ? "on" : ""}`}
                      onClick={() => { setCreateMode(m); setParticipants((prev) => prev.slice(0, m === "solo" ? 2 : 5)); }}>
                      {MODE_KO[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-create-grid">
                <label className="pt-field">
                  <span>날짜</span>
                  <input type="date" className="ui-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </label>
                <label className="pt-field">
                  <span>시작 시간</span>
                  <input
                    className="ui-input"
                    placeholder="2100 → 21:00"
                    value={startTime}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                      if (v.length === 4) v = v.slice(0, 2) + ":" + v.slice(2);
                      setStartTime(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const first = document.querySelector<HTMLInputElement>(".party-participant-nick-input");
                        first?.focus();
                      }
                    }}
                    maxLength={5}
                    required
                    onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity("시작 시간을 입력하세요.")}
                    onInput={(e) => (e.target as HTMLInputElement).setCustomValidity("")}
                  />
                </label>
              </div>
              <div className="pt-field">
                <span>참가자 <small>{participants.filter((x) => x.trim()).length}/{createMaxSize}</small></span>
                <div className="pt-plist">
                  {participantRows(participants, setParticipants, createMaxSize)}
                  {participants.length < createMaxSize && (
                    <button type="button" className="pt-add" onClick={addParticipant}>+ 참가자 추가</button>
                  )}
                </div>
              </div>
              <div className="pt-create-foot">
                <button type="submit" className="btn-primary" disabled={creating}>{creating ? "생성 중..." : "파티 만들기"}</button>
              </div>
            </form>
          )}

          {loading && <p className="ui-empty">불러오는 중...</p>}
          {!loading && parties.length === 0 && <p className="ui-empty">모집 중인 파티가 없습니다.</p>}

          <div className="pt-list">
            {parties.map((p) => {
              const isEditing = editingId === p.id;
              const cnt = p.participants.length;
              return (
                <div className={`ui-card pt-card ${p.status}`} key={p.id}>
                  <div className="pt-card-head">
                    <span className={`party-mode-badge mode-${p.mode}`}>{MODE_KO[p.mode]}</span>
                    <span className="pt-time">{fmtStart(p.startAt)}</span>
                    <span className={`pt-count ${cnt >= p.maxSize ? "full" : ""}`}>{cnt}/{p.maxSize}</span>
                    {isAdmin(user.role) && !isEditing && (
                      <button className="pt-icon pt-del" title="파티 삭제 (포인트 없음)" disabled={busyId === p.id}
                        onClick={() => {
                          if (!confirm("파티를 삭제할까요? (포인트 지급 없음)")) return;
                          setBusyId(p.id);
                          fetch(`/api/party?id=${p.id}&cancel=true`, { method: "DELETE" })
                            .then(() => load(tab))
                            .finally(() => setBusyId(null));
                        }}>✕</button>
                    )}
                  </div>
                  {p.note && <div className="pt-note">{p.note}</div>}

                  {isEditing ? (
                    <div className="pt-plist" style={{ marginTop: 10 }}>
                      {participantRows(editParticipants, setEditParticipants, p.maxSize)}
                      {editParticipants.length < p.maxSize && (
                        <button type="button" className="pt-add" onClick={() => setEditParticipants((prev) => [...prev, ""])}>+ 참가자 추가</button>
                      )}
                      <div className="pt-actions">
                        <button className="btn-secondary" onClick={() => setEditingId(null)}>취소</button>
                        <button className="btn-primary" disabled={busyId === p.id} onClick={() => saveEdit(p.id)}>
                          {busyId === p.id ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-chips">
                      {p.participants.map((pp, i) => (
                        <span className="pt-chip" key={i}>{pp.nickname}</span>
                      ))}
                    </div>
                  )}

                  {isAdmin(user.role) && !isEditing && (
                    <div className="pt-actions">
                      <button className="edit-btn" onClick={() => {
                        setEditingId(p.id);
                        setEditParticipants(p.participants.length ? p.participants.map((pp) => pp.nickname) : [""]);
                      }}>참가자 수정</button>
                      <button className="pt-end" disabled={busyId === p.id}
                        onClick={() => {
                          if (!confirm("파티를 종료할까요?")) return;
                          if (p.mode === "aram") { setAramMemberGames({}); setAramModal({id: p.id, participants: (p.historyParticipants ?? []).map(n => ({userId: null, nickname: n}))}); }
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
