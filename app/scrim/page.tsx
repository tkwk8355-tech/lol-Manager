"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { lineIconUrl, LINE_MAP } from "@/lib/lines";

const TIER_KO: Record<string, string> = {
  IRON: "아이언", BRONZE: "브론즈", SILVER: "실버", GOLD: "골드",
  PLATINUM: "플래티넘", EMERALD: "에메랄드", DIAMOND: "다이아",
  MASTER: "마스터", GRANDMASTER: "그랜드마스터", CHALLENGER: "챌린저",
};
const NO_DIV = ["MASTER", "GRANDMASTER", "CHALLENGER"];

function tierLabel(tier: string | null, rank: string | null, lp: number) {
  if (!tier) return "언랭";
  const ko = TIER_KO[tier] ?? tier;
  if (NO_DIV.includes(tier)) return tier === "MASTER" ? `${ko} ${lp}LP` : ko;
  const d = { I: "1", II: "2", III: "3", IV: "4" }[rank ?? ""] ?? rank;
  return `${ko} ${d}`;
}

const LINES = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
const LINE_LABEL: Record<string, string> = { TOP: "탑", JG: "정글", MID: "미드", ADC: "원딜", SUP: "서폿" };

interface LineStat { games: number; kills: number; deaths: number; assists: number; }
interface LineChamp { id: string; count: number; }
interface Player {
  memberId: number; nickname: string;
  tier: string | null; rank: string | null; lp: number;
  lineCounts: Record<string, number>;
  lineStats: Record<string, LineStat>;
  lineChamps: Record<string, LineChamp[]>;
  kills: number; deaths: number; assists: number; games: number; wins: number; kda: string | null; winRate: number | null;
}
interface Member { id: number; nickname: string; }
interface ChampionInfo { id: string; name: string; }

interface SlotData {
  memberId: number;
  memberName: string;
  champion: string;
  kills: string;
  deaths: string;
  assists: string;
  damage: string;
}

const emptySlot = (): SlotData => ({ memberId: 0, memberName: "", champion: "", kills: "", deaths: "", assists: "", damage: "" });

// 자동완성 훅
function useAutocomplete<T extends { id: number | string; name: string }>(items: T[]) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = query.length > 0 ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  return { query, setQuery, open, setOpen, filtered };
}

// 클랜원 자동완성 입력
function MemberInput({ members, value, onChange, nextRef, inputRef, usedIds }: {
  members: Member[];
  value: SlotData;
  onChange: (v: Partial<SlotData>) => void;
  nextRef?: React.RefObject<HTMLInputElement>;
  inputRef?: React.RefObject<HTMLInputElement>;
  usedIds?: number[];
}) {
  const [query, setQuery] = useState(value.memberName);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const available = members.filter((m) => !usedIds?.includes(m.id) || m.id === value.memberId);
  const filtered = query.length > 0
    ? available.filter((m) => m.nickname.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : available.slice(0, 8);

  useEffect(() => { setQuery(value.memberName); }, [value.memberName]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectMember(m: Member) {
    onChange({ memberId: m.id, memberName: m.nickname });
    setQuery(m.nickname);
    setOpen(false);
    nextRef?.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange({ memberId: 0, memberName: "" }); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) selectMember(filtered[0]);
            else { setOpen(false); nextRef?.current?.focus(); }
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="클랜원 검색"
        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: `1px solid ${value.memberId ? "var(--accent)" : "var(--border)"}`, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50 }}>
          {filtered.map((m, i) => (
            <button key={m.id} className={i === 0 ? "first" : ""} onMouseDown={() => selectMember(m)}>
              {m.nickname}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 챔피언 자동완성 입력 — value/onChange는 영문 id 기준
function ChampionInput({ champions, value, onChange, inputRef, nextRef }: {
  champions: ChampionInfo[];
  value: string; // 영문 id
  onChange: (v: string) => void; // 영문 id 전달
  inputRef?: React.RefObject<HTMLInputElement>;
  nextRef?: React.RefObject<HTMLInputElement>;
}) {
  const toDisplay = (id: string) => champions.find((c) => c.id === id)?.name ?? id;
  const [query, setQuery] = useState(() => toDisplay(value));
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(toDisplay(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query.length > 0
    ? champions.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.id.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectChamp(c: ChampionInfo) {
    onChange(c.id); // 영문 id 저장
    setQuery(c.name); // 한글명 표시
    setOpen(false);
    nextRef?.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 110 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) selectChamp(filtered[0]);
            else { setOpen(false); nextRef?.current?.focus(); }
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="챔피언"
        style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50 }}>
          {filtered.map((c, i) => (
            <button key={c.id} className={i === 0 ? "first" : ""} onMouseDown={() => selectChamp(c)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MatchParticipant {
  memberId: number; nickname: string; team: number;
  line: string | null; champion: string | null;
  kills: number; deaths: number; assists: number;
  damage?: number; items?: number[];
}
interface MatchRecord {
  id: number; status: string; winnerTeam: number;
  note: string | null; playedAt: string; riotMatchId?: string | null;
  team1: MatchParticipant[]; team2: MatchParticipant[];
}

// 전적 조회용 클랜원 검색 입력. 선택하면 onSelect(memberId)로 필터를 건다.
function HistorySearch({ members, onSelect }: { members: Member[]; onSelect: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filtered = q.length > 0 ? members.filter((m) => m.nickname.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(m: Member) {
    onSelect(m.id);
    setQ(m.nickname);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 220 }}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && filtered.length > 0) { e.preventDefault(); select(filtered[0]); } }}
        placeholder="클랜원 검색 (전적 조회)"
        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50 }}>
          {filtered.map((m, i) => (
            <button key={m.id} className={i === 0 ? "first" : ""} onMouseDown={() => select(m)}>{m.nickname}</button>
          ))}
        </div>
      )}
    </div>
  );
}



export default function ScrimPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Player | null>(null);
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null);
  const [tab, setTab] = useState<"matches" | "stats">("matches");
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [editMatch, setEditMatch] = useState<MatchRecord | null>(null);
  const [editWinner, setEditWinner] = useState<1 | 2>(1);
  const [editSlots, setEditSlots] = useState<SlotData[]>([]);
  const [editErr, setEditErr] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Riot 전적 자동 동기화 모달: 클랜원 + 시작 시각을 입력하면 그로부터 24시간 이내
  // 커스텀 게임을 찾아 경기 목록에 자동으로 채워 넣는다.
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncMemberId, setSyncMemberId] = useState<number | null>(null);
  const [syncMemberName, setSyncMemberName] = useState("");
  const [syncStartDate, setSyncStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [syncStartTime, setSyncStartTime] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState("");
  const [syncResult, setSyncResult] = useState<{ addedMatches: number; skippedDuplicate: number; skippedNoCustom: number; errors: string[] } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [winner, setWinner] = useState<1 | 2>(1);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [team1, setTeam1] = useState<SlotData[]>(LINES.map(emptySlot));
  const [team2, setTeam2] = useState<SlotData[]>(LINES.map(emptySlot));

  // 각 슬롯의 입력 필드 ref: [team][lineIdx][field]
  // field 순서: 0=champion, 1=kills, 2=deaths, 3=assists, 4=damage
  const fieldRefs = useRef(
    [0, 1].map(() => LINES.map(() => Array.from({ length: 5 }, () => ({ current: null as HTMLInputElement | null }))))
  );
  // 클랜원 입력 ref: [team][lineIdx]
  const memberRefs = useRef(
    [0, 1].map(() => LINES.map(() => ({ current: null as HTMLInputElement | null })))
  );

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const res = await fetch("/api/scrim/match?mode=rift");
      const json = await res.json();
      if (res.ok) setMatches(json.matches ?? []);
    } catch {}
    finally { setMatchesLoading(false); }
  }, []);

  
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [statsRes, membersRes, champsRes] = await Promise.all([
        fetch("/api/scrim"),
        fetch("/api/userinfo"),
        fetch("/api/champions"),
      ]);
      const statsJson = await statsRes.json();
      const membersJson = await membersRes.json();
      const champsJson = await champsRes.json();
      if (!statsRes.ok) setError(statsJson.error || "불러오기 실패");
      else setPlayers(statsJson.players);
      if (membersRes.ok) setMembers(membersJson.members.map((m: any) => ({ id: m.id, nickname: m.nickname })));
      if (champsRes.ok && champsJson.champions)
        setChampions(champsJson.champions.map((c: any) => ({ id: c.name_en, name: c.name_ko })));
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    load(); loadMatches();
  }, [user, authLoading, load, loadMatches]);

  // 아이템 아이콘은 Data Dragon 버전별 경로가 필요해서 최신 버전을 한 번 가져온다.
  useEffect(() => {
    fetch("https://ddragon.leagueoflegends.com/api/versions.json")
      .then((r) => r.json())
      .then((versions: string[]) => setDdragonVersion(versions[0]))
      .catch(() => {});
  }, []);

  function itemIconUrl(itemId: number) {
    return ddragonVersion ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${itemId}.png` : null;
  }

  function updateSlot(team: 1 | 2, idx: number, patch: Partial<SlotData>) {
    const setter = team === 1 ? setTeam1 : setTeam2;
    setter((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function submitMatch() {
    setFormErr("");
    const allSlots = [...team1, ...team2];
    const filled = allSlots.filter((s) => s.memberId > 0);
    if (filled.length < 2) { setFormErr("최소 2명 이상 입력하세요."); return; }
    const ids = filled.map((s) => s.memberId);
    if (new Set(ids).size !== ids.length) { setFormErr("같은 클랜원이 중복입니다."); return; }

    setSubmitting(true);
    try {
      const participants = [
        ...team1.filter((s) => s.memberId > 0).map((s, i) => ({ memberId: s.memberId, team: 1, line: LINES[i] })),
        ...team2.filter((s) => s.memberId > 0).map((s, i) => ({ memberId: s.memberId, team: 2, line: LINES[i] })),
      ];
      const createRes = await fetch("/api/scrim/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "rift", note: note || null, participants }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) { setFormErr(createJson.error || "경기 생성 실패"); return; }

      const resultParticipants = [...team1, ...team2].filter((s) => s.memberId > 0).map((s) => ({
        memberId: s.memberId, champion: s.champion,
        kills: Number(s.kills) || 0, deaths: Number(s.deaths) || 0,
        assists: Number(s.assists) || 0, damage: Number(s.damage) || 0,
      }));
      const patchRes = await fetch("/api/scrim/match", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: createJson.id, winnerTeam: winner, participants: resultParticipants }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) { setFormErr(patchJson.error || "결과 등록 실패"); return; }

      setShowForm(false);
      setTeam1(LINES.map(emptySlot));
      setTeam2(LINES.map(emptySlot));
      setNote(""); setWinner(1);
      load(); loadMatches();
    } catch { setFormErr("네트워크 오류"); }
    finally { setSubmitting(false); }
  }

  if (authLoading) return null;
  if (!user) return (
    <div className="scrim">
      <div className="party-login-notice">
        내전 통계를 보려면 로그인이 필요합니다.
        <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
      </div>
    </div>
  );

  function openEditModal(m: MatchRecord) {
    setEditMatch(m); setEditWinner((m.winnerTeam || 1) as 1 | 2); setEditErr("");
    const toSlot = (p: MatchParticipant): SlotData => ({
      memberId: p.memberId, memberName: p.nickname, champion: p.champion ?? "",
      kills: String(p.kills), deaths: String(p.deaths), assists: String(p.assists), damage: "",
    });
    setEditSlots([...m.team1.map(toSlot), ...m.team2.map(toSlot)]);
  }

  async function submitEdit() {
    if (!editMatch) return;
    setEditErr(""); setEditSubmitting(true);
    try {
      const res = await fetch("/api/scrim/match", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editMatch.id, winnerTeam: editWinner,
          participants: editSlots.map((s) => ({
            memberId: s.memberId, champion: s.champion,
            kills: Number(s.kills)||0, deaths: Number(s.deaths)||0, assists: Number(s.assists)||0, damage: 0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditErr(json.error || "수정 실패"); return; }
      setEditMatch(null); loadMatches(); load();
    } catch { setEditErr("네트워크 오류"); }
    finally { setEditSubmitting(false); }
  }

  async function deleteMatch(id: number) {
    if (!confirm("이 경기를 삭제하시겠습니까?")) return;
    await fetch(`/api/scrim/match?id=${id}`, { method: "DELETE" });
    loadMatches(); load();
  }

  async function runSync() {
    if (!syncMemberId) { setSyncErr("클랜원을 선택하세요."); return; }
    if (!syncStartDate || !syncStartTime || syncStartTime.length < 5) { setSyncErr("시작 날짜와 시간을 입력하세요."); return; }
    setSyncErr(""); setSyncResult(null); setSyncing(true);
    try {
      const res = await fetch("/api/scrim/match/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: syncMemberId, startAt: `${syncStartDate}T${syncStartTime}:00` }),
      });
      const json = await res.json();
      if (!res.ok) { setSyncErr(json.error || "동기화 실패"); return; }
      loadMatches(); load();
      setShowSyncModal(false);
      let msg = `경기 ${json.addedMatches}건 추가됨`;
      if (json.skippedDuplicate > 0) msg += ` · 중복 ${json.skippedDuplicate}건 건너뜀`;
      if (json.skippedNoCustom > 0) msg += ` · 커스텀 아님 ${json.skippedNoCustom}건 건너뜀`;
      if (json.errors.length > 0) msg += `\n오류: ${json.errors.join(", ")}`;
      alert(msg);
    } catch {
      setSyncErr("네트워크 오류");
    } finally {
      setSyncing(false);
    }
  }

  const champName = (id: string | null) => id ? (champions.find((c) => c.id === id)?.name ?? id) : "-";
  // 예전에 등록된 경기는 챔피언이 한글명으로 저장돼 있어 이미지 경로가 깨진다.
  // 저장된 값이 영문 id 목록에 없으면 한글명으로 매칭해서 영문 id로 바꿔준다.
  const champImgId = (raw: string | null) => {
    if (!raw) return null;
    if (champions.some((c) => c.id === raw)) return raw;
    return champions.find((c) => c.name === raw)?.id ?? raw;
  };

  const isAdmin = user.role === "admin" || user.role === "subadmin";

  return (
    <div className="scrim">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 className="scrim-title" style={{ margin: 0 }}>내전</h2>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => { setShowSyncModal(true); setSyncErr(""); setSyncResult(null); setSyncMemberId(null); setSyncMemberName(""); setSyncStartDate(new Date().toISOString().slice(0, 10)); setSyncStartTime(""); }}
            >
              🔄 동기화
            </button>
            <button className={showForm ? "btn-secondary" : "btn-primary"} onClick={() => setShowForm((v) => !v)}>
              {showForm ? "✕ 닫기" : "+ 결과 입력"}
            </button>
          </div>
        )}
      </div>

      <div className="scrim-tabs">
        <button className={tab === "matches" ? "on" : ""} onClick={() => setTab("matches")}>경기 목록</button>
        <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>통계</button>
      </div>

      {/* 내전 결과 입력 폼 */}
      {showForm && isAdmin && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, marginBottom: 28 }}>
          {/* 상단 옵션 */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>승리팀</span>
            <button
              onClick={() => setWinner(1)}
              style={{
                padding: "7px 20px", borderRadius: 8, border: "2px solid", fontSize: 13, fontWeight: 800, cursor: "pointer",
                borderColor: winner === 1 ? "var(--win-text)" : "var(--border)",
                background: winner === 1 ? "rgba(83,131,232,0.18)" : "transparent",
                color: winner === 1 ? "var(--win-text)" : "var(--muted)",
                transition: "all 0.15s",
              }}>
              🔵 블루팀
            </button>
            <button
              onClick={() => setWinner(2)}
              style={{
                padding: "7px 20px", borderRadius: 8, border: "2px solid", fontSize: 13, fontWeight: 800, cursor: "pointer",
                borderColor: winner === 2 ? "var(--loss-text)" : "var(--border)",
                background: winner === 2 ? "rgba(232,64,87,0.18)" : "transparent",
                color: winner === 2 ? "var(--loss-text)" : "var(--muted)",
                transition: "all 0.15s",
              }}>
              🔴 레드팀
            </button>
            <input
              placeholder="메모 (선택)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)", fontSize: 13, flex: 1, minWidth: 140 }}
            />
          </div>

          {/* 팀 입력 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {([1, 2] as const).map((teamNum) => {
              const slots = teamNum === 1 ? team1 : team2;
              const isWinner = winner === teamNum;
              const teamColor = teamNum === 1 ? "var(--win-text)" : "var(--loss-text)";
              const teamBg = teamNum === 1 ? "rgba(83,131,232,0.06)" : "rgba(232,64,87,0.06)";
              const teamBorder = isWinner ? teamColor : "var(--border)";
              return (
                <div key={teamNum} style={{ border: `2px solid ${teamBorder}`, borderRadius: 10, padding: 16, background: isWinner ? teamBg : "transparent", transition: "all 0.2s" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, color: teamColor, display: "flex", alignItems: "center", gap: 6 }}>
                    {teamNum === 1 ? "🔵 블루팀" : "🔴 레드팀"}
                    {isWinner && <span style={{ fontSize: 12, background: teamBg, border: `1px solid ${teamColor}`, borderRadius: 6, padding: "2px 8px" }}>🏆 승리</span>}
                  </div>

                  {/* 헤더 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 108px 80px", gap: 6, marginBottom: 8, padding: "0 2px" }}>
                    {["클랜원", "챔피언", "K / D / A", "딜량"].map((h) => (
                      <div key={h} style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>

                  {LINES.map((line, idx) => {
                    const teamIdx = teamNum - 1;
                    const refs = fieldRefs.current[teamIdx][idx];
                    // 다음 포커스 대상: champ→kills→deaths→assists→damage→다음줄 champ
                    const nextLineMember = idx < LINES.length - 1
                      ? memberRefs.current[teamIdx][idx + 1]
                      : (teamIdx === 0 ? memberRefs.current[1][0] : undefined);
                    return (
                    <div key={line} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>
                        {LINE_MAP[line] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lineIconUrl(LINE_MAP[line].icon)} alt={line} width={13} height={13} style={{ filter: "brightness(0) invert(0.5)" }} />
                        )}
                        {LINE_LABEL[line]}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 108px 80px", gap: 6, alignItems: "center" }}>
                        <MemberInput
                          members={members}
                          value={slots[idx]}
                          onChange={(patch) => updateSlot(teamNum, idx, patch)}
                          inputRef={memberRefs.current[teamIdx][idx] as React.RefObject<HTMLInputElement>}
                          nextRef={refs[0] as React.RefObject<HTMLInputElement>}
                          usedIds={[...team1, ...team2].map((s) => s.memberId).filter((id) => id > 0 && id !== slots[idx].memberId)}
                        />
                        <ChampionInput
                          champions={champions}
                          value={slots[idx].champion}
                          onChange={(v) => updateSlot(teamNum, idx, { champion: v })}
                          inputRef={refs[0] as React.RefObject<HTMLInputElement>}
                          nextRef={refs[1] as React.RefObject<HTMLInputElement>}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                          {(["kills", "deaths", "assists"] as const).map((f, fi) => (
                            <input
                              key={f}
                              ref={refs[fi + 1] as React.RefObject<HTMLInputElement>}
                              type="number" min={0}
                              placeholder={f === "kills" ? "K" : f === "deaths" ? "D" : "A"}
                              value={slots[idx][f]}
                              onChange={(e) => updateSlot(teamNum, idx, { [f]: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refs[fi + 2]?.current?.focus(); } }}
                              style={{ width: "100%", padding: "7px 4px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)", fontSize: 13, textAlign: "center", MozAppearance: "textfield" } as React.CSSProperties}
                            />
                          ))}
                        </div>
                        <input
                          ref={refs[4] as React.RefObject<HTMLInputElement>}
                          type="number" min={0}
                          placeholder="딥량"
                          value={slots[idx].damage}
                          onChange={(e) => updateSlot(teamNum, idx, { damage: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nextLineMember?.current?.focus(); } }}
                          style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)", fontSize: 13, MozAppearance: "textfield" } as React.CSSProperties}
                        />
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {formErr && <div className="error" style={{ marginTop: 12 }}>{formErr}</div>}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={submitMatch} disabled={submitting}>
              {submitting ? "저장 중..." : "💾 저장"}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setFormErr(""); }}>취소</button>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, width: "95vw" }}>
            <div className="modal-head">
              <span>📊 {detail.nickname} 내전 상세</span>
              <button className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>
            <div style={{ marginBottom: 14, fontSize: 13, color: "var(--muted)" }}>
              총 {detail.games}판 · {detail.wins}승 {detail.games - detail.wins}패
              {detail.winRate !== null && ` · 승률 ${detail.winRate}%`}
              {" · "}KDA {detail.kda ?? "-"} ({detail.kills}/{detail.deaths}/{detail.assists})
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "5px 8px" }}>라인</th>
                  <th style={{ textAlign: "center", padding: "5px 8px" }}>판수</th>
                  <th style={{ textAlign: "center", padding: "5px 8px" }}>K/D/A</th>
                  <th style={{ textAlign: "center", padding: "5px 8px" }}>KDA</th>
                  <th style={{ textAlign: "left", padding: "5px 8px" }}>많이 한 챔피언</th>
                </tr>
              </thead>
              <tbody>
                {LINES.filter((l) => detail.lineStats[l].games > 0).map((l) => {
                  const s = detail.lineStats[l];
                  const kda = ((s.kills + s.assists) / Math.max(s.deaths, 1)).toFixed(2);
                  const info = LINE_MAP[l];
                  const champs = detail.lineChamps?.[l] ?? [];
                  return (
                    <tr key={l} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 8px", fontWeight: 700 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {info && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={lineIconUrl(info.icon)} alt={info.label} width={18} height={18} />
                          )}
                          {info?.label ?? l}
                        </div>
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "center" }}>{s.games}판</td>
                      <td style={{ padding: "8px 8px", textAlign: "center", color: "var(--muted)" }}>
                        {s.kills}/{s.deaths}/{s.assists}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700,
                        color: Number(kda) >= 3 ? "var(--win-text)" : "var(--text)" }}>
                        {kda}
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {champs.map((c) => (
                            <div key={c.id} style={{ textAlign: "center" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/champions/${champImgId(c.id)}.png`} alt={c.id} width={36} height={36}
                                style={{ borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
                              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{c.count}판</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {LINES.every((l) => detail.lineStats[l].games === 0) && (
                  <tr><td colSpan={5} style={{ padding: "12px 8px", color: "var(--muted)", textAlign: "center" }}>내전 기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "matches" && (
        <div>
          {matchesLoading ? <p>불러오는 중...</p> : matches.length === 0
            ? <p style={{ color: "var(--muted)", fontSize: 14 }}>등록된 경기가 없습니다.</p>
            : (
            <div className="match-log">
              {matches.map((m) => {
                const dt = new Date(m.playedAt);
                const dateStr = dt.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
                const timeStr = dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                const isPending = m.status !== "done";
                return (
                  <div key={m.id} className="match-card">
                    <div className="mc-meta">
                      <span>{dateStr} {timeStr}</span>
                      {m.note && <span className="mc-note">· {m.note}</span>}
                      {isPending && <span className="mc-pending-badge">결과 미등록</span>}
                      {isAdmin && (
                        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          {/* 자동 동기화된 경기(riotMatchId 있음)는 Riot 전적 그대로라 수정하지 않고, 삭제만 허용한다. */}
                          {!m.riotMatchId && (
                            <button className="edit-btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => openEditModal(m)}>수정</button>
                          )}
                          <button className="del-btn small" onClick={() => deleteMatch(m.id)}>삭제</button>
                        </div>
                      )}
                    </div>
                    <div className="mc-teams">
                      {(() => {
                        const maxDamage = Math.max(1, ...m.team1.map((p) => p.damage ?? 0), ...m.team2.map((p) => p.damage ?? 0));
                        return ([1, 2] as const).map((t) => {
                        const team = t === 1 ? m.team1 : m.team2;
                        const isWin = !isPending && m.winnerTeam === t;
                        return (
                          <div key={t} className={`mc-team ${isPending ? "pending" : isWin ? "win" : "loss"}`}>
                            <div className="mc-team-head">
                              {t === 1 ? "🔵 블루팀" : "🔴 레드팀"}
                              {!isPending && (isWin ? " 🏆" : " ✗")}
                            </div>
                            {team.map((p) => {
                              const dmgPct = Math.round(((p.damage ?? 0) / maxDamage) * 100);
                              return (
                              <div key={p.memberId} className="mc-player-row">
                                <span className="mc-champ-icon">
                                  {p.champion && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={`/champions/${champImgId(p.champion)}.png`} alt="" width={28} height={28} />
                                  )}
                                </span>
                                <span className="mc-name">
                                  {p.line && LINE_MAP[p.line] && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={lineIconUrl(LINE_MAP[p.line].icon)} alt={p.line} width={12} height={12} className="mc-line-icon" />
                                  )}
                                  {p.nickname}
                                </span>
                                <span className="mc-kda-col">
                                  {p.kills}/<em>{p.deaths}</em>/{p.assists}
                                </span>
                                <span className="mc-dmg-col">
                                  {!!p.damage && (
                                    <>
                                      <span className="mc-dmg-num">{p.damage.toLocaleString()}</span>
                                      <span className="mc-dmg-bar-wrap"><span className="mc-dmg-bar" style={{ width: `${dmgPct}%` }} /></span>
                                    </>
                                  )}
                                </span>
                                <span className="mc-items-col">
                                  {p.items?.map((itemId, i) => {
                                    const src = itemIconUrl(itemId);
                                    return src ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img key={i} src={src} alt="" width={22} height={22} />
                                    ) : null;
                                  })}
                                </span>
                              </div>
                              );
                            })}
                          </div>
                        );
                        });
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <>
          {error && <div className="error">{error}</div>}
          {loading ? <p>불러오는 중...</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 10px" }}>클랜원</th>
                    <th style={{ textAlign: "center", padding: "6px 10px" }}>솔랭 티어</th>
                    {LINES.map((l) => (
                      <th key={l} style={{ textAlign: "center", padding: "6px 8px" }}>
                        {LINE_MAP[l] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lineIconUrl(LINE_MAP[l].icon)} alt={l} width={18} height={18} style={{ verticalAlign: "middle" }} />
                        ) : l}
                      </th>
                    ))}
                    <th style={{ textAlign: "center", padding: "6px 10px" }}>총판수</th>
                    <th style={{ textAlign: "center", padding: "6px 10px" }}>승률</th>
                    <th style={{ textAlign: "center", padding: "6px 10px" }}>KDA</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.memberId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, cursor: "pointer", color: "var(--accent)" }}
                        onClick={() => setDetail(p)}>{p.nickname}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span className={`tier-badge tier-${(p.tier ?? "unranked").toLowerCase()}`}>
                          {tierLabel(p.tier, p.rank, p.lp)}
                        </span>
                      </td>
                      {LINES.map((l) => (
                        <td key={l} style={{ padding: "8px 8px", textAlign: "center", color: p.lineCounts[l] > 0 ? "var(--text)" : "var(--muted)" }}>
                          {p.lineCounts[l] > 0 ? p.lineCounts[l] : "-"}
                        </td>
                      ))}
                      <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--muted)" }}>
                        {p.games > 0 ? `${p.games}판` : "-"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700,
                        color: p.winRate !== null ? (p.winRate >= 50 ? "var(--win-text)" : "var(--loss-text)") : "var(--muted)" }}>
                        {p.winRate !== null ? `${p.winRate}%` : "-"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700,
                        color: p.kda ? (Number(p.kda) >= 3 ? "var(--win-text)" : "var(--text)") : "var(--muted)" }}>
                        {p.kda ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Riot 전적 자동 동기화 모달 */}
      {showSyncModal && (
        <div className="modal-backdrop" onClick={() => setShowSyncModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <span>🔄 내전 전적 동기화</span>
              <button className="modal-close" onClick={() => setShowSyncModal(false)}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px" }}>
              클랜원을 선택하고 시작 시각을 입력하면, 그 시각부터 24시간 이내 진행된 커스텀 게임을 찾아
              참가한 클랜원들의 경기 기록을 자동으로 채워 넣습니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>클랜원</div>
                <HistorySearch
                  members={members}
                  onSelect={(id) => { setSyncMemberId(id); setSyncMemberName(members.find((m) => m.id === id)?.nickname ?? ""); }}
                />
                {syncMemberName && (
                  <div style={{ fontSize: 12, color: "var(--win-text)", marginTop: 4 }}>선택됨: {syncMemberName}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>시작 날짜 / 시간</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="date"
                    value={syncStartDate}
                    onChange={(e) => setSyncStartDate(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
                  />
                  <input
                    className="party-time-text-input"
                    placeholder="시작 시간 (2100 → 21:00)"
                    value={syncStartTime}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                      if (v.length === 4) v = v.slice(0, 2) + ":" + v.slice(2);
                      setSyncStartTime(v);
                    }}
                    maxLength={5}
                    style={{ width: 160 }}
                  />
                </div>
              </div>
            </div>
            {syncErr && <div className="error" style={{ marginTop: 12 }}>{syncErr}</div>}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={runSync} disabled={syncing}>
                {syncing ? "동기화 중..." : "동기화 시작"}
              </button>
              <button className="btn-secondary" onClick={() => setShowSyncModal(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 경기 수정 모달 */}
      {editMatch && (
        <div className="modal-backdrop" onClick={() => setEditMatch(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: "95vw" }}>
            <div className="modal-head">
              <span>경기 #{editMatch.id} 수정</span>
              <button className="modal-close" onClick={() => setEditMatch(null)}>×</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>승리팀</span>
              <button
                onClick={() => setEditWinner(1)}
                style={{
                  padding: "7px 20px", borderRadius: 8, border: "2px solid", fontSize: 13, fontWeight: 800, cursor: "pointer",
                  borderColor: editWinner === 1 ? "var(--win-text)" : "var(--border)",
                  background: editWinner === 1 ? "rgba(83,131,232,0.18)" : "transparent",
                  color: editWinner === 1 ? "var(--win-text)" : "var(--muted)",
                }}>
                🔵 블루팀
              </button>
              <button
                onClick={() => setEditWinner(2)}
                style={{
                  padding: "7px 20px", borderRadius: 8, border: "2px solid", fontSize: 13, fontWeight: 800, cursor: "pointer",
                  borderColor: editWinner === 2 ? "var(--loss-text)" : "var(--border)",
                  background: editWinner === 2 ? "rgba(232,64,87,0.18)" : "transparent",
                  color: editWinner === 2 ? "var(--loss-text)" : "var(--muted)",
                }}>
                🔴 레드팀
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "50vh", overflowY: "auto" }}>
              {editSlots.map((s, idx) => (
                <div key={s.memberId} style={{ display: "grid", gridTemplateColumns: "1fr 110px 40px 40px 40px", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: "0 4px" }}>{s.memberName}</span>
                  <ChampionInput
                    champions={champions}
                    value={s.champion}
                    onChange={(v) => setEditSlots((prev) => prev.map((x, i) => i === idx ? { ...x, champion: v } : x))}
                  />
                  {(["kills", "deaths", "assists"] as const).map((f) => (
                    <input
                      key={f}
                      type="number" min={0}
                      placeholder={f === "kills" ? "K" : f === "deaths" ? "D" : "A"}
                      value={s[f]}
                      onChange={(e) => setEditSlots((prev) => prev.map((x, i) => i === idx ? { ...x, [f]: e.target.value } : x))}
                      style={{ width: "100%", padding: "7px 4px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)", fontSize: 13, textAlign: "center" }}
                    />
                  ))}
                </div>
              ))}
            </div>
            {editErr && <div className="error" style={{ marginTop: 12 }}>{editErr}</div>}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={submitEdit} disabled={editSubmitting}>
                {editSubmitting ? "저장 중..." : "💾 저장"}
              </button>
              <button className="btn-secondary" onClick={() => setEditMatch(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
