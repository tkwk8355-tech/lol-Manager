"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { parsePartyPosts, matchPartyEntries, PastedParty, PartyCandidate, MatchedEntry } from "@/lib/partyPaste";
import PartyHistoryPanel from "../components/PartyHistoryPanel";

type Mode = "aram" | "arena" | "normal" | "flex" | "solo";
type Tab = Mode | "all";

interface Participant { userId: number | null; nickname: string; }
interface Party {
  id: number; mode: Mode; maxSize: number; status: "open" | "full";
  hostUserId: number; hostNickname: string; note: string | null;
  startAt: string | null; createdAt: string;
  participants: Participant[]; waiting: Participant[];
  historyParticipants: string[];
}

const MODES: Mode[] = ["flex", "solo", "aram", "arena", "normal"];
const TABS: Tab[] = ["all", ...MODES];
const MODE_KO: Record<Mode, string> = { aram: "칼바람", arena: "증바람", normal: "일반협곡", flex: "자유랭크", solo: "솔로랭크" };
const TAB_KO: Record<Tab, string> = { all: "전체", flex: "자유랭크", solo: "솔로랭크", aram: "칼바람", arena: "증바람", normal: "일반협곡" };

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

// 참가자 입력: 클랜원(본계정) 목록에서만 고를 수 있다.
// 예전엔 입력할 때마다 서버에 검색을 보내서, 빠르게 치고 엔터를 누르면 이전 검색 결과(엉뚱한 사람)가 들어가거나
// 목록에 없는 이름이 그대로 들어가는 문제가 있었다. 이제 전체 목록을 한 번 받아 화면에서 바로 거른다.
const normNick = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function filterPartyMembers(members: PartyCandidate[], q: string, exclude: Set<string>): PartyCandidate[] {
  const nq = normNick(q);
  if (!nq) return [];
  return members
    .filter((m) => !exclude.has(normNick(m.gameName)))
    .map((m) => {
      const g = normNick(m.gameName), n = normNick(m.nickname);
      const score = g === nq || n === nq ? 3 : g.startsWith(nq) || n.startsWith(nq) ? 2 : g.includes(nq) || n.includes(nq) ? 1 : 0;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.gameName.localeCompare(b.m.gameName))
    .slice(0, 8)
    .map((x) => x.m);
}

function ParticipantInput({ value, onChange, onAddNext, autoFocusOnMount, isLast, existingValues, members, invalid }: {
  value: string; onChange: (v: string) => void; onAddNext: () => void; autoFocusOnMount?: boolean; isLast?: boolean; existingValues?: string[];
  members: PartyCandidate[]; invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [warn, setWarn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
  }, [autoFocusOnMount]);

  const exclude = new Set((existingValues ?? []).map(normNick));
  const suggestions = open ? filterPartyMembers(members, value, exclude) : [];
  // 이미 클랜원 본계정 이름과 정확히 같으면 확정된 상태로 본다
  const exact = members.find((m) => !exclude.has(normNick(m.gameName)) &&
    (normNick(m.gameName) === normNick(value) || normNick(m.nickname) === normNick(value)));
  const showList = suggestions.length > 0 && !(exact && suggestions.length === 1 && exact.gameName === value);

  function confirm(name: string) {
    onChange(name); setOpen(false); setActiveIdx(-1); setWarn(false);
    if (isLast) onAddNext();
  }

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        ref={inputRef}
        // 입력 중에는 표시하지 않고, 칸을 벗어났거나 엔터가 막혔을 때만 빨간 테두리
        className={`party-participant-nick-input ${((invalid && !open) || warn) && value.trim() ? "invalid" : ""}`}
        title={invalid && value.trim() ? "클랜원 목록에 없는 이름이에요" : undefined}
        placeholder="본계정 닉네임"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIdx(-1); setWarn(false); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (showList && e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (showList && e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (!value.trim()) return;
            // 방향키로 고른 사람 → 이름이 정확히 같은 사람 → 목록 첫 번째. 목록에 없으면 넣지 않는다.
            const picked = activeIdx >= 0 && showList ? suggestions[activeIdx] : exact ?? suggestions[0];
            if (picked) confirm(picked.gameName);
            else { setWarn(true); setOpen(false); }
          } else if (e.key === "Escape") {
            setOpen(false); setActiveIdx(-1);
          }
        }}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIdx(-1); }, 150)}
        maxLength={50}
      />
      {showList && (
        <div className="slot-candidates" style={{ zIndex: 20 }}>
          {suggestions.map((s, i) => (
            <button key={s.gameName} type="button"
              className={i === activeIdx ? "active" : ""}
              onMouseDown={() => confirm(s.gameName)}>
              {s.gameName}{s.nickname && normNick(s.nickname) !== normNick(s.gameName) && <em> {s.nickname}</em>}
            </button>
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
  // 모집글 붙여넣기
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteChoices, setPasteChoices] = useState<PastedParty[]>([]); // 글이 여러 개일 때 고를 목록
  const [pasteReport, setPasteReport] = useState<{ entries: MatchedEntry[]; timeRaw: string | null; overflow: number } | null>(null);
  const [pasteErr, setPasteErr] = useState("");
  const partyMembersRef = useRef<PartyCandidate[] | null>(null);
  const [partyMembers, setPartyMembers] = useState<PartyCandidate[]>([]);
  // 파티 내역 패널 (운영진) — 열림 여부는 브라우저에 기억
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  useEffect(() => {
    try { if (localStorage.getItem("party-history-open") === "1") setHistoryOpen(true); } catch {}
  }, []);
  function toggleHistory(open: boolean) {
    setHistoryOpen(open);
    try { localStorage.setItem("party-history-open", open ? "1" : "0"); } catch {}
  }

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
    const bad = invalidMessage(participants);
    if (bad) { setError(bad); return; }
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
      else { setNote(""); setStartDate(new Date(new Date().getTime() + 9*60*60*1000).toISOString().slice(0,10)); setStartTime(""); setParticipants([""]); setPasteReport(null); load(tab); setHistoryKey((k) => k + 1); }
    } catch { setError("네트워크 오류"); }
    finally { setCreating(false); }
  }

  async function loadPartyMembers(): Promise<PartyCandidate[]> {
    if (partyMembersRef.current) return partyMembersRef.current;
    const res = await fetch("/api/party/members?all=1");
    const json = await res.json();
    partyMembersRef.current = (json.members ?? []).map((m: any) => ({ gameName: m.gameName, nickname: m.nickname ?? m.gameName }));
    setPartyMembers(partyMembersRef.current!);
    return partyMembersRef.current!;
  }

  // 운영진이면 참가자 입력용 클랜원 목록을 미리 받아 둔다
  useEffect(() => {
    if (user && isAdmin(user.role)) loadPartyMembers().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 클랜원 본계정 이름이 아닌 칸 (목록을 아직 못 받았으면 검사하지 않음 — 서버에서 한 번 더 막는다)
  const validNicks = new Set(partyMembers.map((m) => normNick(m.gameName)));
  const isInvalidNick = (n: string) => partyMembers.length > 0 && !!n.trim() && !validNicks.has(normNick(n));
  function invalidMessage(list: string[]): string | null {
    const bad = list.filter(isInvalidNick);
    return bad.length > 0 ? `클랜원 목록에 없는 이름이 있어요: ${bad.join(", ")} — 자동완성에서 골라 주세요.` : null;
  }

  // 파싱된 모집글 하나를 생성 폼에 채운다
  async function fillFromPasted(p: PastedParty) {
    setPasteErr("");
    let members: PartyCandidate[];
    try { members = await loadPartyMembers(); }
    catch { setPasteErr("클랜원 목록을 불러오지 못했어요."); return; }
    const mode = p.mode ?? createMode;
    const max = mode === "solo" ? 2 : 5;
    const matched = matchPartyEntries(p.entries.slice(0, max), members);
    const names = matched.map((m) => m.matched?.gameName ?? m.written);
    setCreateMode(mode);
    setStartTime(p.startTime ?? "");
    setParticipants(names.length > 0 ? names : [""]);
    setPasteReport({ entries: matched, timeRaw: p.startTime ? null : p.timeRaw, overflow: Math.max(0, p.entries.length - max) });
    setPasteChoices([]);
    setPasteOpen(false);
  }

  function applyPaste() {
    const posts = parsePartyPosts(pasteText);
    if (posts.length === 0) { setPasteErr("모집글을 읽지 못했어요. 제목(칼바람/자랭/솔랭/일반)과 번호 명단이 있는지 확인해 주세요."); return; }
    if (posts.length === 1) { fillFromPasted(posts[0]); return; }
    setPasteErr("");
    setPasteChoices(posts); // 여러 개면 고르게 한다
  }

  // 파티 내역의 "채우기" — 모드·날짜·시간·참가자를 생성 폼에 넣는다
  function fillFromHistory(mode: Mode, names: string[], startAt: string | null) {
    const max = mode === "solo" ? 2 : 5;
    setCreateMode(mode);
    // startAt: "2026-11-03 21:00:00"
    const m = startAt?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (m) { setStartDate(m[1]); setStartTime(m[2]); }
    setParticipants(names.length ? names.slice(0, max) : [""]);
    setPasteReport(null);
    setPasteOpen(false);
    setError("");
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
      else { load(tab); setHistoryKey((k) => k + 1); }
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  async function saveEdit(partyId: number) {
    const bad = invalidMessage(editParticipants);
    if (bad) { setError(bad); return; }
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
        members={partyMembers}
        invalid={isInvalidNick(nick)}
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
            <p className="pt-hint">참가자별 판수를 입력하세요. ({aramModal.participants[0] && parties.find(p=>p.id===aramModal.id)?.mode === "arena" ? "증바람" : "칼바람 4판당 5점, 하루 최대 5점"})</p>
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
            <button type="button" className={`btn-secondary ${historyOpen ? "on" : ""}`} onClick={() => toggleHistory(!historyOpen)}>
              📜 파티 내역
            </button>
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
        <div className={`pt-layout ${isAdmin(user.role) && historyOpen ? "with-history" : ""}`}>
        <div className="pt-main">
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
                <button type="button" className={`sc-tool-btn ${pasteOpen ? "on" : ""}`} style={{ marginLeft: "auto" }}
                  onClick={() => { setPasteOpen((o) => !o); setPasteChoices([]); setPasteErr(""); }}>📋 모집글 붙여넣기</button>
              </div>

              {pasteOpen && (
                <div className="sc-paste-box" style={{ marginBottom: 0 }}>
                  <textarea
                    value={pasteText}
                    onChange={(e) => { setPasteText(e.target.value); setPasteChoices([]); }}
                    rows={10}
                    placeholder={"🍸자랭🌈\n3판시 10p\n시간:1900\n-----------------------------\n1.닉네임 에디\n2.닉네임 jg\n...\n\n⏰️대기"}
                    autoFocus
                  />
                  <div className="sc-paste-help">
                    카톡 모집글을 그대로 붙여넣으면 <b>모드</b>(제목), <b>시작 시간</b>(시간: 줄), <b>참가자</b>(----- 아래 번호 명단)를 채워요.
                    이름 뒤 라인·티어·코멘트는 무시하고, 비슷한 닉네임의 본계정으로 연결해요. <b>대기</b> 명단은 넣지 않아요.
                  </div>
                  {pasteErr && <div className="sc-paste-warn" style={{ margin: 0 }}>{pasteErr}</div>}
                  {pasteChoices.length > 0 && (
                    <div className="pt-paste-choices">
                      <span className="sc-paste-help">모집글이 {pasteChoices.length}개예요. 만들 파티를 고르세요.</span>
                      {pasteChoices.map((c, i) => (
                        <button key={i} type="button" className="sc-tool-btn" onClick={() => fillFromPasted(c)}>
                          {c.mode ? MODE_KO[c.mode] : c.title || "모드 미확인"} · {c.startTime ?? "시간 미정"} · {c.entries.length}명
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn-secondary" onClick={() => setPasteOpen(false)}>취소</button>
                    <button type="button" className="btn-primary" disabled={!pasteText.trim()} onClick={applyPaste}>적용</button>
                  </div>
                </div>
              )}
              {!pasteOpen && pasteReport && (() => {
                const notFound = pasteReport.entries.filter((e) => !e.matched);
                const fuzzy = pasteReport.entries.filter((e) => e.matched && !e.exact);
                return (
                  <>
                    {pasteReport.timeRaw !== null && (
                      <div className="sc-paste-warn" style={{ margin: 0 }}>⚠ 시간을 읽지 못했어요{pasteReport.timeRaw ? ` ("${pasteReport.timeRaw}")` : ""} — 시작 시간을 직접 입력해 주세요.</div>
                    )}
                    {notFound.length > 0 && (
                      <div className="sc-paste-warn" style={{ margin: 0 }}>⚠ 못 찾은 이름: {notFound.map((e) => e.written).join(", ")} — 해당 칸에서 직접 고쳐 주세요.</div>
                    )}
                    {pasteReport.overflow > 0 && (
                      <div className="sc-paste-warn" style={{ margin: 0 }}>⚠ 정원을 넘는 {pasteReport.overflow}명은 넣지 않았어요.</div>
                    )}
                    {fuzzy.length > 0 && (
                      <div className="sc-paste-note" style={{ margin: 0 }}>비슷한 이름으로 연결했어요. 확인해 주세요: {fuzzy.map((e) => `${e.written} → ${e.matched!.gameName}`).join(", ")}</div>
                    )}
                  </>
                );
              })()}

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
                          if (p.mode === "aram" || p.mode === "arena") { setAramMemberGames({}); setAramModal({id: p.id, participants: (p.historyParticipants ?? []).map(n => ({userId: null, nickname: n}))}); }
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
        </div>
        {isAdmin(user.role) && historyOpen && (
          <PartyHistoryPanel
            mode={tab}
            refreshKey={historyKey}
            onClose={() => toggleHistory(false)}
            onFill={fillFromHistory}
          />
        )}
        </div>
      )}
    </div>
  );
}
