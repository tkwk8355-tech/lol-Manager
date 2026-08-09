"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { generateTeams, type BalanceResult } from "@/lib/scrim";
import { useAuth } from "../components/AuthProvider";
import { LINES, lineIconUrl, LINE_MAP } from "@/lib/lines";

// ====================== 타입 ======================
interface ModeStats {
  games: number; wins: number; losses: number;
  winrate: number; kda: number;
  baseScore: number; adjust: number;
  qualified: boolean; score: number;
}
interface Player {
  memberId: number; nickname: string;
  tier: string | null; rank: string | null; lp: number;
  baseScore: number; aram: ModeStats; rift: ModeStats;
}
interface MatchParticipant {
  memberId: number; nickname: string;
  line: string | null; champion: string | null;
  kills: number; deaths: number; assists: number;
}
interface ScrimMatch {
  id: number; mode: Mode; status: "pending" | "done";
  winnerTeam: number; note: string | null; playedAt: string;
  team1: MatchParticipant[]; team2: MatchParticipant[];
}
type Mode = "aram" | "rift";
type Tab = Mode | "generator";

interface RecruitParticipant {
  userId: number; memberId: number; nickname: string; line: string | null;
}
interface Recruit {
  id: number; mode: Mode; maxSize: number;
  status: "open" | "full" | "started";
  note: string | null; createdAt: string;
  participants: RecruitParticipant[];
}

// ====================== 헬퍼 ======================
const TIER_KO: Record<string, string> = {
  IRON:"아이언",BRONZE:"브론즈",SILVER:"실버",GOLD:"골드",
  PLATINUM:"플래티넘",EMERALD:"에메랄드",DIAMOND:"다이아",
  MASTER:"마스터",GRANDMASTER:"그랜드마스터",CHALLENGER:"챌린저",
};
const NO_DIV = ["MASTER","GRANDMASTER","CHALLENGER"];
function tierLabel(p: Player): string {
  if (!p.tier) return "언랭";
  const ko = TIER_KO[p.tier] ?? p.tier;
  if (NO_DIV.includes(p.tier)) return p.tier === "MASTER" ? `${ko} ${p.lp}LP` : ko;
  const d = {I:"1",II:"2",III:"3",IV:"4"}[p.rank ?? ""] ?? p.rank;
  return `${ko} ${d}`;
}
function signed(n: number) { return n > 0 ? `+${n}` : `${n}`; }
function fmtDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2,"0");
  return `${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function kdaStr(k: number, d: number, a: number) {
  return ((k+a)/Math.max(d,1)).toFixed(2);
}
const MODE_KO: Record<Mode, string> = { aram:"칼바람", rift:"협곡" };

// ====================== 메인 페이지 ======================
// useSearchParams()를 쓰는 부분은 Suspense 경계 안에 있어야 하므로
// 실제 내용은 ScrimPageInner로 분리하고 기본 export에서 Suspense로 감싼다.
export default function ScrimPage() {
  return (
    <Suspense fallback={<div className="scrim"><p>불러오는 중...</p></div>}>
      <ScrimPageInner />
    </Suspense>
  );
}

function ScrimPageInner() {
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab === "generator" || initialTab === "aram" || initialTab === "rift" ? initialTab : "aram"
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 모집 명단을 팀 생성기로 가져올 때 쓰는 값. Generator가 이 값을 받으면 슬롯에 자동 배치한다.
  const [pendingRecruit, setPendingRecruit] = useState<Recruit | null>(null);

  const loadPlayers = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/scrim");
      const json = await res.json();
      if (!res.ok) setError(json.error || "불러오기 실패");
      else setPlayers(json.players);
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  function openInGenerator(recruit: Recruit) {
    setPendingRecruit(recruit);
    setTab("generator");
  }

  return (
    <div className="scrim">
      <h2 className="scrim-title">내전 매칭</h2>

      {/* 모집 게시판: 운영진/클랜원 모두 볼 수 있지만 점수·전적 데이터는 포함하지 않는다. */}
      <RecruitBoard isAdmin={isAdmin} onOpenInGenerator={openInGenerator} />

      {/* 아래 탭(점수표/경기 기록/팀 생성기)은 운영진만 사용한다. 일반 클랜원은 모집 게시판까지만. */}
      {isAdmin && (
        <>
          <div className="scrim-tabs">
            {(["aram","rift","generator"] as Tab[]).map(t => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "aram" ? "칼바람" : t === "rift" ? "협곡" : "팀 생성기"}
              </button>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
          {loading && <p>불러오는 중...</p>}
          {!loading && tab !== "generator" && (
            <ModePanel mode={tab as Mode} players={players} onChanged={loadPlayers} isAdmin={isAdmin} />
          )}
          {!loading && tab === "generator" && (
            <Generator
              players={players}
              onMatchStarted={loadPlayers}
              pendingRecruit={pendingRecruit}
              onPendingRecruitConsumed={() => setPendingRecruit(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ====================== 모집 게시판 ======================
// 일반 클랜원은 여기까지만 본다: 모집 종류/인원수/신청 여부만 보이고
// 점수·티어·전적 같은 상세 데이터는 절대 포함하지 않는다.
function RecruitBoard({ isAdmin, onOpenInGenerator }: {
  isAdmin: boolean;
  onOpenInGenerator: (r: Recruit) => void;
}) {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [recruits, setRecruits] = useState<Recruit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [opening, setOpening] = useState<Mode | null>(null);
  const [joinLine, setJoinLine] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/scrim/recruit");
      const json = await res.json();
      if (!res.ok) setError(json.error || "불러오기 실패");
      else setRecruits(json.recruits);
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  }, []);

  // 모집 목록도 클랜 내부 정보라 로그인해야 볼 수 있다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); setRecruits([]); return; }
    load();
  }, [user, authLoading, load]);

  async function openRecruit(mode: Mode) {
    setOpening(mode); setError("");
    try {
      const res = await fetch("/api/scrim/recruit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "모집 생성 실패");
      else load();
    } catch { setError("네트워크 오류"); }
    finally { setOpening(null); }
  }

  async function cancelRecruit(id: number) {
    if (!confirm("모집을 취소할까요?")) return;
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/scrim/recruit?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "취소 실패");
      else load();
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  async function joinRecruit(id: number, line: string | null) {
    setBusyId(id); setError("");
    try {
      const res = await fetch("/api/scrim/recruit/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recruitId: id, line }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "신청 실패");
      else load();
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  async function leaveRecruit(id: number) {
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/scrim/recruit/join?recruitId=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "처리 실패");
      else load();
    } catch { setError("네트워크 오류"); }
    finally { setBusyId(null); }
  }

  const openRecruits = recruits.filter((r) => r.status !== "started");

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="recruit-board">
        <div className="party-login-notice">
          내전 모집을 보려면 로그인이 필요합니다.
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
        </div>
      </div>
    );
  }

  return (
    <div className="recruit-board">
      <div className="recruit-board-head">
        <h3 className="scrim-h3" style={{ margin: 0 }}>내전 모집</h3>
        {isAdmin && (
          <div className="recruit-open-actions">
            {(["aram","rift"] as Mode[]).map((m) => (
              <button key={m} className="recruit-open-btn" disabled={opening === m} onClick={() => openRecruit(m)}>
                {opening === m ? "여는 중..." : `${MODE_KO[m]} 모집 열기`}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="scrim-empty">불러오는 중...</p>
      ) : openRecruits.length === 0 ? (
        <p className="scrim-empty">
          {isAdmin ? "열려있는 모집이 없습니다. 위 버튼으로 모집을 열어보세요." : "현재 모집 중인 내전이 없습니다."}
        </p>
      ) : (
        <div className="recruit-list">
          {openRecruits.map((r) => {
            const usedLines = new Set(r.participants.map((p) => p.line).filter((l): l is string => !!l));
            const isFull = r.status === "full" || r.participants.length >= r.maxSize;
            return (
              <RecruitCard
                key={r.id}
                recruit={r}
                isAdmin={isAdmin}
                isFull={isFull}
                usedLines={usedLines}
                busy={busyId === r.id}
                joinLine={joinLine[r.id] ?? ""}
                onJoinLineChange={(v) => setJoinLine((prev) => ({ ...prev, [r.id]: v }))}
                onJoin={() => joinRecruit(r.id, joinLine[r.id] || null)}
                onLeave={() => leaveRecruit(r.id)}
                onCancel={() => cancelRecruit(r.id)}
                onOpenInGenerator={() => onOpenInGenerator(r)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecruitCard({
  recruit, isAdmin, isFull, usedLines, busy, joinLine, onJoinLineChange,
  onJoin, onLeave, onCancel, onOpenInGenerator,
}: {
  recruit: Recruit; isAdmin: boolean; isFull: boolean; usedLines: Set<string>;
  busy: boolean; joinLine: string; onJoinLineChange: (v: string) => void;
  onJoin: () => void; onLeave: () => void; onCancel: () => void; onOpenInGenerator: () => void;
}) {
  const { user, openAuthModal } = useAuth();
  const isParticipant = !!user && recruit.participants.some((p) => p.userId === user.userId);

  return (
    <div className={`recruit-card ${recruit.status}`}>
      <div className="recruit-card-head">
        <span className="party-mode-badge">{MODE_KO[recruit.mode]}</span>
        <span className="party-time">등록 {fmtDate(recruit.createdAt)}</span>
        <span className="party-count">{recruit.participants.length}/{recruit.maxSize}명</span>
        {isFull && <span className="party-full-badge">인원 마감</span>}
      </div>
      {recruit.note && <div className="party-note">{recruit.note}</div>}

      <div className="party-participants">
        {recruit.participants.map((p) => (
          <span className="party-participant-chip" key={p.userId}>
            {p.nickname}{p.line ? ` · ${LINE_MAP[p.line]?.label ?? p.line}` : ""}
          </span>
        ))}
      </div>

      <div className="party-actions">
        {isAdmin && (
          <>
            {isFull && (
              <button className="party-join-btn" onClick={onOpenInGenerator}>팀 생성기로 불러오기</button>
            )}
            <button className="party-delete-btn" disabled={busy} onClick={onCancel}>
              {busy ? "처리 중..." : "모집 취소"}
            </button>
          </>
        )}
        {!isAdmin && user && (
          isParticipant ? (
            <button className="party-leave-btn" disabled={busy} onClick={onLeave}>
              {busy ? "처리 중..." : "신청 취소"}
            </button>
          ) : isFull ? (
            <button className="party-join-btn" disabled>인원 마감</button>
          ) : (
            <div className="party-join-row">
              {recruit.mode === "rift" && (
                <select
                  className="line-select small"
                  value={joinLine}
                  onChange={(e) => onJoinLineChange(e.target.value)}
                >
                  <option value="">라인(선택)</option>
                  {LINES.filter((l) => !usedLines.has(l.key)).map((l) => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))}
                </select>
              )}
              <button className="party-join-btn" disabled={busy} onClick={onJoin}>
                {busy ? "처리 중..." : "신청"}
              </button>
            </div>
          )
        )}
        {!isAdmin && !user && (
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>
            로그인 후 신청할 수 있습니다
          </button>
        )}
      </div>
    </div>
  );
}

// ====================== 모드 패널 (점수표 + 경기 기록) ======================
function ModePanel({ mode, players, onChanged, isAdmin }: {
  mode: Mode; players: Player[]; onChanged: () => void; isAdmin: boolean;
}) {
  const [matches, setMatches] = useState<ScrimMatch[]>([]);
  const [loadingM, setLoadingM] = useState(true);
  const [resultTarget, setResultTarget] = useState<ScrimMatch | null>(null);

  const loadMatches = useCallback(async () => {
    setLoadingM(true);
    try {
      const res = await fetch(`/api/scrim/match?mode=${mode}`);
      const json = await res.json();
      if (res.ok) setMatches(json.matches);
    } catch { /* 무시 */ } finally { setLoadingM(false); }
  }, [mode]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const ranked = useMemo(
    () => [...players].sort((a, b) => b[mode].score - a[mode].score),
    [players, mode]
  );

  async function deleteMatch(id: number) {
    if (!confirm("삭제할까요? 점수가 재계산됩니다.")) return;
    await fetch(`/api/scrim/match?id=${id}`, { method: "DELETE" });
    loadMatches(); onChanged();
  }

  return (
    <div className="mode-panel">
      <h3 className="scrim-h3">
        {MODE_KO[mode]} 선수 점수
        <span className="scrim-sub"> 최종 = 티어 기본점수 + 승패 보정 (승+1/패−1, 2판↑, 상한±6)</span>
      </h3>
      {ranked.length === 0
        ? <p className="scrim-empty">클랜원 관리에서 먼저 선수를 추가하세요.</p>
        : (
          <div className="score-table">
            <div className="st-head">
              <span className="st-name">선수</span><span className="st-tier">티어</span>
              <span className="st-base">기본</span><span className="st-rec">전적</span>
              <span className="st-wr">승률</span><span className="st-kda">KDA</span>
              <span className="st-adj">보정</span><span className="st-score">최종</span>
            </div>
            {ranked.map(p => {
              const s = p[mode];
              return (
                <div className="st-row" key={p.memberId}>
                  <span className="st-name">{p.nickname}</span>
                  <span className="st-tier">{tierLabel(p)}</span>
                  <span className="st-base">{s.baseScore}</span>
                  <span className="st-rec">{s.games === 0 ? "-" : `${s.wins}승 ${s.losses}패`}</span>
                  <span className="st-wr">
                    {s.games === 0 ? "-" : `${s.winrate}%`}
                    {!s.qualified && s.games > 0 && <em className="st-note" title="2판↑ 보정">*</em>}
                  </span>
                  <span className="st-kda">{s.games === 0 ? "-" : s.kda}</span>
                  <span className="st-adj" style={{color: s.adjust>0?"var(--win-text)":s.adjust<0?"var(--loss-text)":"var(--muted)"}}>
                    {s.qualified ? signed(s.adjust) : "-"}
                  </span>
                  <span className="st-score">{s.score}</span>
                </div>
              );
            })}
          </div>
        )
      }

      <h3 className="scrim-h3">{MODE_KO[mode]} 경기 기록</h3>
      {loadingM ? <p>불러오는 중...</p>
        : matches.length === 0 ? <p className="scrim-empty">기록된 경기가 없습니다.</p>
        : (
          <div className="match-log">
            {matches.map(m => (
              <MatchCard key={m.id} m={m} isAdmin={isAdmin}
                onDelete={() => deleteMatch(m.id)}
                onRegister={() => setResultTarget(m)} />
            ))}
          </div>
        )
      }

      {resultTarget && (
        <ResultModal
          match={resultTarget}
          onClose={() => setResultTarget(null)}
          onSaved={() => { setResultTarget(null); loadMatches(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ====================== 경기 기록 카드 ======================
function MatchCard({ m, onDelete, onRegister, isAdmin }: {
  m: ScrimMatch; onDelete: () => void; onRegister: () => void; isAdmin: boolean;
}) {
  const isPending = m.status === "pending";
  function TeamBlock({ players, team }: { players: MatchParticipant[]; team: number }) {
    const isWin = m.winnerTeam === team;
    return (
      <div className={`mc-team ${isPending ? "pending" : isWin ? "win" : "loss"}`}>
        <div className="mc-team-head">
          {team}팀 {isPending ? "진행중" : isWin ? "승" : "패"}
        </div>
        {players.map(p => (
          <div className="mc-player" key={p.memberId}>
            <span className="mc-name">
              {m.mode === "rift" && p.line && LINE_MAP[p.line] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lineIconUrl(LINE_MAP[p.line].icon)} alt={p.line}
                  width={14} height={14} className="mc-line-icon" />
              )}
              {p.nickname}
            </span>
            {isPending
              ? null
              : <span className="mc-kda">
                  {p.champion && <em className="mc-champ">{p.champion}</em>}
                  {p.kills}/{p.deaths}/{p.assists}
                  <em className="mc-ratio"> ({kdaStr(p.kills,p.deaths,p.assists)})</em>
                </span>
            }
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="match-card">
      <div className="mc-meta">
        <span className="mc-date">{fmtDate(m.playedAt)}</span>
        {isPending && <span className="mc-pending-badge">결과 미등록</span>}
        {m.note && <span className="mc-note">{m.note}</span>}
        {isAdmin && (
          <div style={{marginLeft:"auto",display:"flex",gap:"6px"}}>
            {isPending && (
              <button className="edit-btn" style={{padding:"4px 10px",fontSize:"12px"}} onClick={onRegister}>
                결과 등록
              </button>
            )}
            <button className="del-btn small" onClick={onDelete}>삭제</button>
          </div>
        )}
      </div>
      <div className="mc-teams">
        <TeamBlock players={m.team1} team={1} />
        <TeamBlock players={m.team2} team={2} />
      </div>
    </div>
  );
}

// ====================== 결과 등록 모달 ======================
interface ResultRow { memberId: number; nickname: string; champion: string; kills: string; deaths: string; assists: string; }

// 챔피언 이름 검색 인풋 (DB에서 한국어 자동완성)
function ChampionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(value);
  const [candidates, setCandidates] = useState<{name_ko:string;name_en:string}[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { setQ(value); }, [value]);

  async function search(v: string) {
    setQ(v);
    if (!v.trim()) { setCandidates([]); return; }
    try {
      const res = await fetch(`/api/champions?q=${encodeURIComponent(v)}`);
      const json = await res.json();
      setCandidates(json.champions ?? []);
      setOpen(true);
    } catch { /* 무시 */ }
  }

  function select(name: string) {
    onChange(name);
    setQ(name);
    setCandidates([]);
    setOpen(false);
  }

  return (
    <div style={{position:"relative",width:"100%"}}>
      <input
        className="modal-champ"
        placeholder="챔피언 검색"
        value={q}
        onChange={e => search(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && candidates.length > 0) { e.preventDefault(); select(candidates[0].name_ko); } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => q && candidates.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && candidates.length > 0 && (
        <div className="champ-candidates">
          {candidates.map((c, i) => (
            <button key={c.name_en} className={i===0?"first":""} onMouseDown={() => select(c.name_ko)}>
              {c.name_ko}
              <em>{c.name_en}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultModal({ match, onClose, onSaved }: {
  match: ScrimMatch; onClose: () => void; onSaved: () => void;
}) {
  const allPlayers = [...match.team1, ...match.team2];
  const [winner, setWinner] = useState<0|1|2>(0);
  const [rows, setRows] = useState<ResultRow[]>(
    allPlayers.map(p => ({ memberId: p.memberId, nickname: p.nickname, champion: p.champion || "", kills: "", deaths: "", assists: "" }))
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function patchRow(idx: number, patch: Partial<ResultRow>) {
    setRows(r => r.map((x,i) => i===idx ? {...x,...patch} : x));
  }

  async function save() {
    if (winner === 0) { setMsg("승리팀을 선택하세요."); return; }
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/scrim/match", {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          id: match.id, winnerTeam: winner,
          participants: rows.map(r => ({
            memberId: r.memberId, champion: r.champion || null,
            kills: Number(r.kills)||0, deaths: Number(r.deaths)||0, assists: Number(r.assists)||0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(json.error || "저장 실패"); }
      else { onSaved(); }
    } catch { setMsg("네트워크 오류"); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <span>결과 등록 — {MODE_KO[match.mode]} #{match.id}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-winner">
          <span>승리팀:</span>
          {[1,2].map(t => (
            <label key={t} className={`winner-btn ${winner===t?"on":""}`}>
              <input type="radio" name="modal-winner" checked={winner===t} onChange={() => setWinner(t as 1|2)} />
              {t}팀 승리
            </label>
          ))}
        </div>
        <div className="modal-table">
          <div className="modal-thead">
            <span>팀</span><span>선수</span><span>챔피언</span>
            <span>K</span><span>D</span><span>A</span>
          </div>
          {[1,2].flatMap(team =>
            match[`team${team}` as "team1"|"team2"].map(p => {
              const idx = rows.findIndex(r => r.memberId === p.memberId);
              if (idx < 0) return null;
              const r = rows[idx];
              return (
                <div className="modal-row" key={p.memberId}>
                  <span className={`modal-team t${team}`}>{team}팀</span>
                  <span className="modal-name">{p.nickname}</span>
                  <ChampionInput value={r.champion} onChange={v => patchRow(idx, {champion: v})} />
                  {(["kills","deaths","assists"] as const).map(f => (
                    <input key={f} className="modal-kda" inputMode="numeric" placeholder={f[0].toUpperCase()}
                      value={r[f]} onChange={e => patchRow(idx,{[f]:e.target.value})} />
                  ))}
                </div>
              );
            })
          )}
        </div>
        <div className="modal-foot">
          {msg && <span className="mf-msg">{msg}</span>}
          <button className="mf-save" onClick={save} disabled={saving}>{saving?"저장 중...":"결과 저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ====================== 팀 생성기 ======================
// 대결표가 항상 먼저 보이고, 각 슬롯에서 직접 선수를 선택한다.
// "팀 생성" 버튼을 누르면 현재 배정된 선수들을 균형 재배치한다.
// 모집 게시판에서 "팀 생성기로 불러오기"를 누르면 pendingRecruit으로 명단이 전달되어
// 슬롯에 자동 배치된다(라인은 신청 시 고른 라인을 그대로 반영).

// 슬롯 키: "t1-0" ~ "t1-4" (팀1), "t2-0" ~ "t2-4" (팀2)
type SlotKey = string;
// 슬롯 상태: slotKey → memberId (0 = 비어있음)
type Slots = Record<SlotKey, number>;

function makeDefaultSlots(isRift: boolean): Slots {
  const slots: Slots = {};
  const count = isRift ? 5 : 5;
  for (let i = 0; i < count; i++) {
    slots[`t1-${i}`] = 0;
    slots[`t2-${i}`] = 0;
  }
  return slots;
}

function Generator({ players, onMatchStarted, pendingRecruit, onPendingRecruitConsumed }: {
  players: Player[];
  onMatchStarted: () => void;
  pendingRecruit: Recruit | null;
  onPendingRecruitConsumed: () => void;
}) {
  const [scoreMode, setScoreMode] = useState<Mode>("rift");
  const [slots, setSlots] = useState<Slots>(() => makeDefaultSlots(true));
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState("");
  const [activeRecruitId, setActiveRecruitId] = useState<number | null>(null);

  const isRift = scoreMode === "rift";

  // 모집 게시판에서 "팀 생성기로 불러오기"를 눌렀을 때: 해당 모집의 모드로 전환하고,
  // 참가자들을 앞에서부터 순서대로 두 팀에 나눠 슬롯에 배치한다(협곡은 신청 시 고른 라인 우선).
  useEffect(() => {
    if (!pendingRecruit) return;
    const rift = pendingRecruit.mode === "rift";
    setScoreMode(pendingRecruit.mode);
    setActiveRecruitId(pendingRecruit.id);

    const next: Slots = makeDefaultSlots(rift);
    const list = pendingRecruit.participants;
    if (rift) {
      // 라인을 고른 사람은 그 라인 슬롯에 먼저 배치하고, 나머지(ALL 포함)는 남은 슬롯에 채운다.
      const remaining: number[] = [];
      const lineTaken = new Set<string>();
      for (const p of list) {
        const line = p.line?.split(",")[0]; // 여러 개 골랐으면 첫 번째 우선
        const idx = LINES.findIndex((l) => l.key === line);
        if (idx >= 0 && !lineTaken.has(`t1-${idx}`) && next[`t1-${idx}`] === 0) {
          next[`t1-${idx}`] = p.memberId; lineTaken.add(`t1-${idx}`);
        } else if (idx >= 0 && !lineTaken.has(`t2-${idx}`) && next[`t2-${idx}`] === 0) {
          next[`t2-${idx}`] = p.memberId; lineTaken.add(`t2-${idx}`);
        } else {
          remaining.push(p.memberId);
        }
      }
      const emptySlots = Object.keys(next).filter((k) => next[k] === 0);
      remaining.forEach((id, i) => { if (emptySlots[i]) next[emptySlots[i]] = id; });
    } else {
      list.slice(0, 5).forEach((p, i) => { next[`t1-${i}`] = p.memberId; });
      list.slice(5, 10).forEach((p, i) => { next[`t2-${i}`] = p.memberId; });
    }
    setSlots(next);
    setResult(null);
    setStartMsg(`"${MODE_KO[pendingRecruit.mode]} 모집" 명단을 불러왔습니다. 필요하면 슬롯을 조정한 뒤 팀 생성/경기 시작을 누르세요.`);
    onPendingRecruitConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecruit]);

  // 모드 전환 시 슬롯 초기화
  function switchMode(m: Mode) {
    setScoreMode(m);
    setSlots(makeDefaultSlots(m === "rift"));
    setResult(null); setStartMsg(""); setActiveRecruitId(null);
  }

  // 슬롯에 선수 배정. 이미 다른 슬롯에 있으면 그 슬롯을 비운다.
  function assignSlot(key: SlotKey, memberId: number) {
    setSlots(prev => {
      const next = { ...prev };
      // 같은 선수가 다른 슬롯에 있으면 제거
      if (memberId !== 0) {
        for (const k of Object.keys(next)) {
          if (next[k] === memberId && k !== key) next[k] = 0;
        }
      }
      next[key] = memberId;
      return next;
    });
    setResult(null); setStartMsg("");
  }

  // 현재 슬롯에서 선수 ID 배열 추출
  const team1Ids = LINES.map((_, i) => slots[`t1-${i}`] ?? 0);
  const team2Ids = LINES.map((_, i) => slots[`t2-${i}`] ?? 0);
  const allAssigned = [...team1Ids, ...team2Ids].filter(Boolean);
  const usedIds = new Set(allAssigned);

  // 팀 생성: 배정된 선수들을 균형 재배치
  function run() {
    const assigned = players
      .filter(p => usedIds.has(p.memberId))
      .map(p => ({
        id: p.memberId,
        name: p.nickname,
        score: p[scoreMode].score,
        line: isRift ? (getPlayerLine(p.memberId) || "") : "",
      }));
    if (assigned.length < 2) { setStartMsg("최소 2명이 필요합니다."); return; }
    const r = generateTeams(assigned, { distinctLines: isRift });
    setResult(r);
    if (r) applyResultToSlots(r);
    setStartMsg("");
  }

  // 결과를 슬롯에 반영
  function applyResultToSlots(r: BalanceResult) {
    const lineRank = (l?: string) => { const i = LINES.findIndex(x => x.key === l); return i < 0 ? 99 : i; };
    const t1 = [...r.team1].sort((a, b) => lineRank(a.line) - lineRank(b.line));
    const t2 = [...r.team2].sort((a, b) => lineRank(a.line) - lineRank(b.line));
    const next: Slots = makeDefaultSlots(isRift);
    t1.forEach((p, i) => { if (i < 5) next[`t1-${i}`] = p.id; });
    t2.forEach((p, i) => { if (i < 5) next[`t2-${i}`] = p.id; });
    setSlots(next);
  }

  // 특정 선수의 현재 라인(협곡: 슬롯 인덱스로 라인 결정)
  function getPlayerLine(memberId: number): string {
    if (!isRift) return "";
    for (let i = 0; i < 5; i++) {
      if (slots[`t1-${i}`] === memberId || slots[`t2-${i}`] === memberId) {
        return LINES[i]?.key ?? "";
      }
    }
    return "";
  }

  // 경기 시작
  async function startMatch() {
    const t1 = team1Ids.filter(Boolean);
    const t2 = team2Ids.filter(Boolean);
    if (t1.length === 0 || t2.length === 0) {
      setStartMsg("양 팀에 최소 한 명씩 있어야 합니다."); return;
    }
    setStarting(true); setStartMsg("");
    const participants = [
      ...team1Ids.map((id, i) => id ? { memberId: id, team: 1, line: isRift ? LINES[i]?.key : null } : null),
      ...team2Ids.map((id, i) => id ? { memberId: id, team: 2, line: isRift ? LINES[i]?.key : null } : null),
    ].filter(Boolean);
    try {
      const res = await fetch("/api/scrim/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: scoreMode, participants, recruitId: activeRecruitId }),
      });
      const json = await res.json();
      if (!res.ok) { setStartMsg(json.error || "저장 실패"); }
      else {
        setStartMsg(`경기 #${json.id} 시작! ${isRift ? "협곡" : "칼바람"} 탭에서 결과를 등록하세요.`);
        setSlots(makeDefaultSlots(isRift));
        setResult(null);
        setActiveRecruitId(null);
        onMatchStarted();
      }
    } catch { setStartMsg("네트워크 오류"); }
    finally { setStarting(false); }
  }

  const scoreOf = (id: number) => players.find(p => p.memberId === id)?.[scoreMode].score ?? 0;

  // 슬롯 셀 렌더 - 검색으로 선수 배정, 닉네임+티어만 표시, 점수 비공개
  function SlotCell({ slotKey, align }: { slotKey: SlotKey; align: "left" | "right" }) {
    const memberId = slots[slotKey] ?? 0;
    const player = memberId ? players.find(p => p.memberId === memberId) : null;
    const [editing, setEditing] = useState(false);
    const [q, setQ] = useState("");

  // 대결표의 예상 최대 인원을 10명으로 제한
  const maxCount = 10;
  const candidatesLimited = useMemo(() => {
    const query = q.trim().toLowerCase();
    return players
      .filter(p => p.memberId === memberId || !usedIds.has(p.memberId))
      .filter(p => query === "" || p.nickname.toLowerCase().includes(query))
      .slice(0, maxCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, memberId]);

    function select(id: number) {
      assignSlot(slotKey, id);
      setEditing(false);
      setQ("");
    }
    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === "Enter") { e.preventDefault(); if (candidatesLimited.length > 0) select(candidatesLimited[0].memberId); }
      if (e.key === "Escape") { setEditing(false); setQ(""); }
    }
    function clear(e: React.MouseEvent) {
      e.stopPropagation();
      assignSlot(slotKey, 0);
      setEditing(false); setQ("");
    }

    const tierStr = (p: Player) => {
      if (!p.tier) return "언랭";
      const ko = TIER_KO[p.tier] ?? p.tier;
      if (NO_DIV.includes(p.tier)) return p.tier === "MASTER" ? `${ko} ${p.lp}LP` : ko;
      const d = {I:"1",II:"2",III:"3",IV:"4"}[p.rank ?? ""] ?? p.rank;
      return `${ko} ${d}`;
    };

    return (
      <div
        className={`rm-cell slot-cell ${align === "left" ? "t1" : "t2"}`}
        onClick={() => { if (!editing) { setEditing(true); setQ(""); } }}
      >
        {editing ? (
          <div className="slot-search-wrap" onClick={e => e.stopPropagation()}>
            <input
              className="slot-search-input"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => { setEditing(false); setQ(""); }, 150)}
              placeholder="검색..."
            />
            {candidatesLimited.length > 0 && (
              <div className="slot-candidates">
                {candidatesLimited.map((p, i) => (
                  <button key={p.memberId} className={i === 0 ? "first" : ""}
                    onMouseDown={() => select(p.memberId)}>
                    <span>{p.nickname}</span>
                    <em>{tierStr(p)}</em>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : player ? (
          <div className="slot-filled">
            <span className="slot-name">{player.nickname}</span>
            <span className="slot-tier">{tierStr(player)}</span>
            <button className="slot-clear" onMouseDown={clear} title="제거">×</button>
          </div>
        ) : (
          <span className="slot-empty">+ 선택</span>
        )}
      </div>
    );
  }

  // 요약 정보 계산
  const t1Players = team1Ids.filter(Boolean).map(id => players.find(p => p.memberId === id)!).filter(Boolean);
  const t2Players = team2Ids.filter(Boolean).map(id => players.find(p => p.memberId === id)!).filter(Boolean);
  const avg1 = t1Players.length ? Math.round(t1Players.reduce((s,p) => s + p[scoreMode].score, 0) / t1Players.length * 10) / 10 : 0;
  const avg2 = t2Players.length ? Math.round(t2Players.reduce((s,p) => s + p[scoreMode].score, 0) / t2Players.length * 10) / 10 : 0;
  const sum1 = Math.round(t1Players.reduce((s,p) => s + p[scoreMode].score, 0) * 10) / 10;
  const sum2 = Math.round(t2Players.reduce((s,p) => s + p[scoreMode].score, 0) * 10) / 10;

  return (
    <div className="generator">
      {/* 상단 컨트롤 */}
      <div className="gen-controls">
        <div className="gen-mode">
          모드:
          {(["aram","rift"] as Mode[]).map(m => (
            <button key={m} className={scoreMode === m ? "on" : ""} onClick={() => switchMode(m)}>
              {m === "aram" ? "칼바람" : "협곡"}
            </button>
          ))}
        </div>
        <span className="gen-count">{allAssigned.length}명 선택</span>
        <button className="gen-run" onClick={run} disabled={allAssigned.length < 2}>
          팀 생성 (자동 균형)
        </button>
      </div>

      {/* 점수 요약 - 내부용(관리자만), 화면에는 미표시 */}

      {/* 대결표 */}
      {isRift ? (
        <div className="rift-matchup">
          <div className="rm-col-head t1">팀 1</div>
          <div className="rm-col-head center">라인</div>
          <div className="rm-col-head t2">팀 2</div>
          {LINES.map((line, i) => (
            <div className="rm-row" key={line.key}>
              <SlotCell slotKey={`t1-${i}`} align="left" />
              <div className="rm-cell center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lineIconUrl(line.icon)} alt={line.label} width={22} height={22} className="rm-line-icon" />
                <span className="rm-line-label">{line.label}</span>
              </div>
              <SlotCell slotKey={`t2-${i}`} align="right" />
            </div>
          ))}
        </div>
      ) : (
        <div className="aram-matchup">
          <div className="am-col-head t1">팀 1</div>
          <div className="am-col-head t2">팀 2</div>
          {[0,1,2,3,4].map(i => (
            <div className="am-row" key={i}>
              <SlotCell slotKey={`t1-${i}`} align="left" />
              <SlotCell slotKey={`t2-${i}`} align="right" />
            </div>
          ))}
        </div>
      )}

      {/* 경기 시작 */}
      <div className="gen-start-row">
        <button className="gen-start-btn" onClick={startMatch} disabled={starting || allAssigned.length < 2}>
          {starting ? "저장 중..." : "⚔ 경기 시작"}
        </button>
        {startMsg && <span className="mf-msg">{startMsg}</span>}
      </div>
    </div>
  );
}

// ====================== (구) RiftMatchup / AramMatchup — 제거됨, Generator 내부로 통합 ======================
