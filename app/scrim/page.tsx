"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

// 내전 티어(한글) → tier-badge 색상 클래스
const SCRIM_TIER_CLASS: Record<string, string> = {
  브론즈: "bronze", 실버: "silver", 골드: "gold", 플래티넘: "platinum", 에메랄드: "emerald", 다이아: "diamond",
};
const tierClass = (t: string) => `tier-badge tier-${SCRIM_TIER_CLASS[t] ?? "master"}`;

type StatsSortKey = "nickname" | "mmr" | "games" | "winRate" | "kda";

interface LineStat { games: number; wins: number; kills: number; deaths: number; assists: number; }
interface ChampStat { id: string; games: number; wins: number; kills: number; deaths: number; assists: number; winRate: number; kda: string; }
interface LineChamp { id: string; count: number; }
interface Player {
  memberId: number; nickname: string;
  tier: string | null; rank: string | null; lp: number;
  lineCounts: Record<string, number>;
  lineStats: Record<string, LineStat>;
  lineChamps: Record<string, LineChamp[]>;
  champStats: ChampStat[];
  kills: number; deaths: number; assists: number; games: number; wins: number; kda: string | null; winRate: number | null;
  mvpCount: number; scrimScore: number; scrimMmr: number | null; scrimTier: string | null;
}
interface Member { id: number; nickname: string; subLine?: string | null; mainLine?: string | null; }
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

// 한글 초성 추출
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function getChosung(str: string): string {
  return str.split("").map((ch) => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG[Math.floor(code / 588)];
  }).join("");
}

// 검색어 매칭: 앞글자 일치 우선, 포함 차선, 초성 검색 지원
function matchScore(name: string, q: string): number {
  const n = name.toLowerCase();
  const query = q.toLowerCase();
  if (n === query) return 3;
  if (n.startsWith(query)) return 2;
  if (n.includes(query)) return 1;
  // 초성 검색
  const chosung = getChosung(name);
  if (chosung.startsWith(q)) return 2;
  if (chosung.includes(q)) return 1;
  return 0;
}

function filterMembers(members: Member[], q: string): Member[] {
  if (!q) return members;
  return members
    .map((m) => ({ m, score: matchScore(m.nickname, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m)
    .slice(0, 8);
}

// ===== 내전 신청 명단 붙여넣기 파서 =====
// 예) "3. 나 욤 원딜, 미드" / "2. 멜 로 서폿(고정)(주최자)" / "8. 범 남는 곳"
// (고정) → 주라인 고정 버튼, 남는 곳 → ALL 버튼. 나머지는 회원 정보 라인 그대로.
interface RosterEntry { raw: string; name: string; fixed: boolean; any: boolean; }

const LINE_TOKEN: Record<string, string> = {
  "탑": "TOP", "top": "TOP",
  "정글": "JG", "jg": "JG", "jungle": "JG", "jug": "JG",
  "미드": "MID", "mid": "MID",
  "원딜": "ADC", "ad": "ADC", "adc": "ADC", "바텀": "ADC", "bot": "ADC",
  "서폿": "SUP", "서포터": "SUP", "서포트": "SUP", "sup": "SUP", "support": "SUP",
};
const ANY_LINE_RE = /(남는\s*(곳|데|라인|자리)|아무\s*(거나|데나|곳|라인|자리)|상관\s*(없음|x)|노상관|올\s*라인|\ball\b)/gi;

function parseRoster(text: string): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    let s = raw.replace(/^\d+\s*[.)\]:\-]?\s*/, "");      // 앞 번호 "1." 제거
    const fixed = /고정/.test(s);
    s = s.replace(/[(\[（][^)\]）]*[)\]）]/g, " ");         // (고정)(주최자) 등 괄호 제거
    const any = ANY_LINE_RE.test(s);
    ANY_LINE_RE.lastIndex = 0;
    s = s.replace(ANY_LINE_RE, " ");
    const tokens = s.split(/[\s,/·|+]+/).map((t) => t.replace(/[.~!]+$/, "")).filter(Boolean);
    const firstLine = tokens.findIndex((t) => LINE_TOKEN[t.toLowerCase()]);
    const name = (firstLine === -1 ? tokens : tokens.slice(0, firstLine)).join(" ").trim();
    if (!name) continue;
    out.push({ raw, name, fixed, any: any && !fixed });
  }
  return out;
}

// ===== 명단 이름 → 클랜원 매칭 (오타/띄어쓰기/일부만 적은 경우도 비슷한 사람으로) =====
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const normName = (x: string) => x.replace(/[\s_.\-]+/g, "").toLowerCase();
// 한글을 자모 단위로 분해 → "꼬"/"코", "죽"/"쭉" 같은 오타도 거리 1로 계산된다
function toJamo(x: string): string {
  let out = "";
  for (const ch of x) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    out += CHOSUNG[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
  }
  return out;
}
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}
// 0~1 유사도. 1 = 같은 이름
function nameSimilarity(written: string, nickname: string): number {
  const a = normName(written), b = normName(nickname);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let best = 0;
  // 일부만 적은 경우 ("범" ↔ "범고래")
  if (b.includes(a) || a.includes(b)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    best = Math.max(best, 0.7 + 0.25 * ratio);
  }
  // 줄임말: 적은 글자가 닉네임 안에 순서대로 들어있는 경우 ("숟 도" ↔ "숟가락과도구")
  if (isSubsequence(a, b)) {
    const ratio = a.length / b.length;
    best = Math.max(best, a[0] === b[0] ? 0.72 + 0.23 * ratio : 0.62 + 0.2 * ratio);
  }
  // 초성으로 적은 경우 ("ㄱㄲㅈ" ↔ "귤꺼죽")
  if (/^[ㄱ-ㅎ]+$/.test(a) && getChosung(b).startsWith(a)) best = Math.max(best, 0.8);
  // 오타: 자모 단위 편집거리
  const ja = toJamo(a), jb = toJamo(b);
  best = Math.max(best, 1 - editDistance(ja, jb) / Math.max(ja.length, jb.length));
  return best;
}
const ROSTER_MATCH_MIN = 0.6; // 이 값보다 낮으면 "못 찾음" 처리

// 명단 전체를 한 번에 매칭: 유사도가 높은 쌍부터 배정해서 한 사람이 엉뚱한 줄에 먼저 뺏기지 않게 한다
function matchRoster(names: string[], members: Member[]): (Member | null)[] {
  const pairs: { i: number; m: Member; sim: number }[] = [];
  names.forEach((name, i) => {
    for (const m of members) {
      const sim = nameSimilarity(name, m.nickname);
      if (sim >= ROSTER_MATCH_MIN) pairs.push({ i, m, sim });
    }
  });
  pairs.sort((x, y) => y.sim - x.sim);
  const result: (Member | null)[] = names.map(() => null);
  const used = new Set<number>();
  for (const p of pairs) {
    if (result[p.i] || used.has(p.m.id)) continue;
    result[p.i] = p.m; used.add(p.m.id);
  }
  return result;
}

function filterChampions(champions: ChampionInfo[], q: string): ChampionInfo[] {
  if (!q) return [];
  return champions
    .map((c) => ({ c, score: Math.max(matchScore(c.name, q), matchScore(c.id, q)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c)
    .slice(0, 8);
}

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
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const available = members.filter((m) => !usedIds?.includes(m.id) || m.id === value.memberId);
  const filtered = query.length > 0
    ? filterMembers(available, query)
    : available.slice(0, 8);

  useEffect(() => { setQuery(value.memberName); }, [value.memberName]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setActiveIdx(-1); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectMember(m: Member) {
    onChange({ memberId: m.id, memberName: m.nickname });
    setQuery(m.nickname);
    setOpen(false);
    setActiveIdx(-1);
    nextRef?.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(-1); if (!e.target.value) onChange({ memberId: 0, memberName: "" }); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0 && e.key === "ArrowDown") {
            e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (open && filtered.length > 0 && e.key === "ArrowUp") {
            e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = activeIdx >= 0 ? filtered[activeIdx] : filtered.length > 0 ? filtered[0] : null;
            if (picked) selectMember(picked);
            else { setOpen(false); nextRef?.current?.focus(); }
          } else if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
        }}
        placeholder="클랜원 검색"
        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: `1px solid ${value.memberId ? "var(--accent)" : "var(--border)"}`, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50 }}>
          {filtered.map((m, i) => (
            <button key={m.id} className={i === activeIdx ? "active" : ""} onMouseDown={() => selectMember(m)}>
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
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(toDisplay(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query.length > 0 ? filterChampions(champions, query) : [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setActiveIdx(-1); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectChamp(c: ChampionInfo) {
    onChange(c.id);
    setQuery(c.name);
    setOpen(false);
    setActiveIdx(-1);
    nextRef?.current?.focus();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 110 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); setActiveIdx(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0 && e.key === "ArrowDown") {
            e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (open && filtered.length > 0 && e.key === "ArrowUp") {
            e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = activeIdx >= 0 ? filtered[activeIdx] : filtered.length > 0 ? filtered[0] : null;
            if (picked) selectChamp(picked);
            else { setOpen(false); nextRef?.current?.focus(); }
          } else if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
        }}
        placeholder="챔피언"
        style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50 }}>
          {filtered.map((c, i) => (
            <button key={c.id} className={i === activeIdx ? "active" : ""} onMouseDown={() => selectChamp(c)}>
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
  damage?: number; items?: number[]; isMvp?: boolean;
}
interface MatchRecord {
  id: number; status: string; winnerTeam: number;
  note: string | null; playedAt: string; riotMatchId?: string | null;
  team1: MatchParticipant[]; team2: MatchParticipant[];
}

const LINE_ORDER = ["TOP", "JG", "MID", "ADC", "SUP"];
const sortTeamByLine = (team: MatchParticipant[]) =>
  [...team].sort((a, b) => (LINE_ORDER.indexOf(a.line ?? "") + 1 || 99) - (LINE_ORDER.indexOf(b.line ?? "") + 1 || 99));

// 전적 조회용 클랜원 검색 입력. 선택하면 onSelect(memberId)로 필터를 건다.
function HistorySearch({ members, onSelect }: { members: Member[]; onSelect: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filtered = q.length > 0 ? filterMembers(members, q) : [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setActiveIdx(-1); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(m: Member) {
    onSelect(m.id);
    setQ(m.nickname);
    setOpen(false);
    setActiveIdx(-1);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 220 }}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActiveIdx(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0 && e.key === "ArrowDown") {
            e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (open && filtered.length > 0 && e.key === "ArrowUp") {
            e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = activeIdx >= 0 ? filtered[activeIdx] : filtered.length > 0 ? filtered[0] : null;
            if (picked) select(picked);
          } else if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
        }}
        placeholder="클랜원 검색 (전적 조회)"
        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50 }}>
          {filtered.map((m, i) => (
            <button key={m.id} className={i === activeIdx ? "active" : ""} onMouseDown={() => select(m)}>{m.nickname}</button>
          ))}
        </div>
      )}
    </div>
  );
}



// 팀 생성 모달
function BalanceModal({ members, onClose, isAdmin }: { members: Member[]; onClose: () => void; isAdmin: boolean }) {
  const SLOT_COUNT = 10;
  interface Slot { memberId: number; memberName: string; }
  const emptySlots = (): Slot[] => Array.from({ length: SLOT_COUNT }, () => ({ memberId: 0, memberName: "" }));
  const [slots, setSlots] = useState<Slot[]>(emptySlots);
  const [overrideAll, setOverrideAll] = useState<Set<number>>(new Set());
  const [overrideMain, setOverrideMain] = useState<Set<number>>(new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteReport, setPasteReport] = useState<{ raw: string; name: string; matched: string | null }[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  interface BPlayer { id: number; name: string; score: number; line: string; lineAdjust: number; }
  interface BResult { team1: BPlayer[]; team2: BPlayer[]; sum1: number; sum2: number; diff: number; }
  const [results, setResults] = useState<BResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [savedResult, setSavedResult] = useState<BResult | null>(null);
  const result = selectedIdx === -2 ? savedResult : selectedIdx >= 0 ? (results[selectedIdx] ?? null) : null;
  const [tournamentCode, setTournamentCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeErr, setCodeErr] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(SLOT_COUNT).fill(null));

  // 프리셋
  interface Preset { name: string; memberIds: number[]; }
  const PRESET_KEY = "scrim_presets";
  const loadPresets = (): Preset[] => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]"); } catch { return []; } };
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [presetName, setPresetName] = useState("");
  const [presetOpen, setPresetOpen] = useState(false);

  function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const ids = slots.filter((s) => s.memberId > 0).map((s) => s.memberId);
    if (ids.length === 0) return;
    const next = [...presets.filter((p) => p.name !== name), { name, memberIds: ids }];
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresets(next);
    setPresetName("");
  }

  function loadPreset(preset: Preset) {
    const newSlots = emptySlots();
    preset.memberIds.forEach((id, i) => {
      if (i >= SLOT_COUNT) return;
      const m = members.find((x) => x.id === id);
      if (m) newSlots[i] = { memberId: m.id, memberName: m.nickname };
    });
    setSlots(newSlots);
    setOverrideAll(new Set());
    setResults([]); setSelectedIdx(-1); setSavedResult(null);
    setPresetOpen(false);
  }

  function deletePreset(name: string) {
    const next = presets.filter((p) => p.name !== name);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresets(next);
  }

  const usedIds = slots.map((s) => s.memberId).filter((id) => id > 0);

  function applyPaste() {
    const entries = parseRoster(pasteText).slice(0, SLOT_COUNT);
    const matched = matchRoster(entries.map((e) => e.name), members);
    const newSlots = emptySlots();
    const allSet = new Set<number>();
    const mainSet = new Set<number>();
    const report: typeof pasteReport = [];
    entries.forEach((e, i) => {
      const m = matched[i];
      if (m) {
        newSlots[i] = { memberId: m.id, memberName: m.nickname };
        if (e.fixed) mainSet.add(m.id);      // (고정) → 주라인 버튼
        else if (e.any) allSet.add(m.id);    // 남는 곳 → ALL 버튼
      } else {
        // 못 찾은 사람은 이름만 채워두고 직접 선택하게 한다
        newSlots[i] = { memberId: 0, memberName: e.name };
      }
      report.push({ raw: e.raw, name: e.name, matched: m?.nickname ?? null });
    });
    setSlots(newSlots);
    setOverrideAll(allSet); setOverrideMain(mainSet);
    setResults([]); setSelectedIdx(-1); setSavedResult(null);
    setPasteReport(report);
    setPasteOpen(false);
  }

  async function generateCode() {
    setCodeErr(""); setCodeLoading(true);
    try {
      const res = await fetch("/api/scrim/tournament-code");
      const json = await res.json();
      if (!res.ok) { setCodeErr(json.error || "코드 생성 실패"); return; }
      setTournamentCode(json.code);
    } catch { setCodeErr("네트워크 오류"); }
    finally { setCodeLoading(false); }
  }

  async function generate(ids: number[], keepSaved = false) {
    setErr(""); setLoading(true); setTournamentCode(""); setCodeErr("");
    try {
      const count = 3;
      const responses = await Promise.all(
        Array.from({ length: count }, () =>
          fetch("/api/scrim/balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberIds: ids, overrideAll: [...overrideAll], overrideMain: [...overrideMain] }),
          }).then((r) => r.json())
        )
      );
      const valid = responses.filter((j) => j.team1);
      if (valid.length === 0) { setErr(responses[0]?.error || "팀 생성 실패"); return; }
      if (!keepSaved) setSavedResult(null);
      // 저장된 결과와 팀 구성이 동일한 중복 제거
      const savedIds = keepSaved && savedResult
        ? new Set([...savedResult.team1, ...savedResult.team2].map((p) => p.id))
        : null;
      const deduped = savedIds
        ? valid.filter((j) => {
            const ids = new Set([...j.team1, ...j.team2].map((p: { id: number }) => p.id));
            return ![...savedIds].every((id) => ids.has(id)) || ids.size !== savedIds.size;
          })
        : valid;
      setResults(deduped.length > 0 ? deduped : valid);
      setSelectedIdx(-1);
    } catch { setErr("네트워크 오류"); }
    finally { setLoading(false); }
  }

  const filledIds = slots.filter((s) => s.memberId > 0).map((s) => s.memberId);
  const canGenerate = filledIds.length === SLOT_COUNT;

  const LINE_LBL: Record<string, string> = { TOP: "탑", JG: "정글", MID: "미드", ADC: "원딜", SUP: "서폿" };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const LINE_KEYS = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
  const resetResults = () => { setResults([]); setSelectedIdx(-1); setTournamentCode(""); setCodeErr(""); setNotifyMsg(""); };
  const fuzzyNotes = pasteReport.filter((r) => r.matched && r.matched.replace(/\s+/g, "").toLowerCase() !== r.name.replace(/\s+/g, "").toLowerCase());
  const notFound = pasteReport.filter((r) => !r.matched);

  // 후보 카드: 라인별로 블루/레드를 한 줄에 나란히
  const bestDiff = Math.min(...results.slice(0, 3).map((r) => r.diff), savedResult?.diff ?? Infinity);
  const renderCandidate = (r: BResult, title: React.ReactNode, onPick: () => void, footer: React.ReactNode, saved = false) => (
    <div className={`sc-cand ${saved ? "saved" : ""}`}>
      <button className="sc-cand-body" onClick={onPick}>
        <div className="sc-cand-head">
          {title}
          {r.diff === bestDiff && !saved && <span className="sc-cand-best">최소 점수차</span>}
          <span className="sc-cand-diff">점수차 <b>{r.diff}</b></span>
        </div>
        <div className="sc-cand-teams">
          <span className="blue">블루</span>
          <span />
          <span className="red">레드</span>
        </div>
        <div className="sc-cand-rows">
          {LINE_KEYS.map((line) => {
            const b = r.team1.find((x) => x.line === line);
            const rd = r.team2.find((x) => x.line === line);
            return (
              <div key={line} className="sc-cand-row">
                <span className="nm blue">{b?.name ?? "-"}</span>
                <span className="ln">{LINE_LBL[line]}</span>
                <span className="nm red">{rd?.name ?? "-"}</span>
              </div>
            );
          })}
        </div>
        <div className="sc-cand-pick">이 구성 선택 →</div>
      </button>
      {footer}
    </div>
  );

  return (
    <div className="modal-backdrop">
      <div className={`modal sc-bm ${results.length ? (result !== null ? "w-result" : "w-cands") : ""}`}>
        <div className="sc-bm-head">
          <div>
            <h3>팀 생성</h3>
            {!results.length ? (
              <div className="sc-bm-progress">
                <span>참가 클랜원 <b>{filledIds.length}</b>/10</span>
                <span className="sc-bm-bar"><i style={{ width: `${filledIds.length * 10}%` }} /></span>
              </div>
            ) : (
              <div className="sc-bm-sub">{result !== null ? "선택한 팀 구성" : "마음에 드는 구성을 골라주세요"}</div>
            )}
          </div>
          <button className="sc-d-close" onClick={onClose}>✕</button>
        </div>

        {!results.length ? (
          <>
            {/* 도구 줄: 명단 붙여넣기 / 프리셋 */}
            <div className="sc-bm-tools">
              <button className={`sc-tool-btn ${pasteOpen ? "on" : ""}`} onClick={() => { setPasteOpen((o) => !o); setPresetOpen(false); }}>📋 신청 명단 붙여넣기</button>
              <div style={{ position: "relative", marginLeft: "auto" }}>
                <button className={`sc-tool-btn ${presetOpen ? "on" : ""}`} onClick={() => { setPresetOpen((p) => !p); setPasteOpen(false); }}>
                  📂 프리셋{presets.length > 0 && <span className="sc-count">{presets.length}</span>}
                </button>
                {presetOpen && (
                  <div className="sc-preset-pop">
                    <div className="sc-preset-save">
                      <input
                        placeholder="현재 명단을 프리셋으로 저장"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }}
                      />
                      <button onClick={savePreset} disabled={!presetName.trim() || filledIds.length === 0}>저장</button>
                    </div>
                    {presets.length === 0 && <div className="sc-preset-empty">저장된 프리셋이 없어요.</div>}
                    {presets.map((p) => (
                      <div key={p.name} className="sc-preset-row">
                        <button className="nm" onClick={() => loadPreset(p)}>{p.name}<span>{p.memberIds.length}명</span></button>
                        <button className="del" onClick={() => deletePreset(p.name)} title="삭제">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pasteOpen && (
              <div className="sc-paste-box">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={10}
                  placeholder={"1. 닉네임 서폿\n2. 닉네임 서폿(고정)\n3. 닉네임 원딜, 미드\n4. 닉네임 남는 곳\n..."}
                  autoFocus
                />
                <div className="sc-paste-help">
                  한 줄에 한 명씩 붙여넣으면 비슷한 닉네임의 클랜원을 찾아 채워요.
                  <b>(고정)</b>이면 <b>주라인</b>, <b>남는 곳</b>이면 <b>ALL</b>이 켜지고, 나머지는 회원 정보 라인을 그대로 써요.
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn-secondary" onClick={() => setPasteOpen(false)}>취소</button>
                  <button className="btn-primary" disabled={!pasteText.trim()} onClick={applyPaste}>적용</button>
                </div>
              </div>
            )}
            {!pasteOpen && notFound.length > 0 && (
              <div className="sc-paste-warn">⚠ 못 찾은 이름: {notFound.map((r) => r.name).join(", ")} — 해당 칸에서 직접 선택해 주세요.</div>
            )}
            {!pasteOpen && fuzzyNotes.length > 0 && (
              <div className="sc-paste-note">비슷한 이름으로 연결했어요. 확인해 주세요: {fuzzyNotes.map((r) => `${r.name} → ${r.matched}`).join(", ")}</div>
            )}

            <div className="sc-slot-head">
              <span>클랜원</span>
              <span className="r">회원 라인 · <b className="all">ALL</b> 아무 라인 · <b className="main">주라인</b> 주라인만</span>
            </div>
            <div className="sc-slots">
              {slots.map((slot, idx) => {
                const available = members.filter((m) => !usedIds.includes(m.id) || m.id === slot.memberId);
                const mem = members.find((m) => m.id === slot.memberId);
                const lineInfo = mem
                  ? [mem.mainLine ? LINE_LBL[mem.mainLine] ?? mem.mainLine : "-", mem.subLine ? (mem.subLine.toUpperCase() === "ALL" ? "ALL" : LINE_LBL[mem.subLine] ?? mem.subLine) : null].filter(Boolean).join(" / ")
                  : undefined;
                return (
                  <SlotMemberInput
                    key={idx}
                    index={idx}
                    members={available}
                    value={slot}
                    lineInfo={lineInfo}
                    isOverrideAll={overrideAll.has(slot.memberId)}
                    isOverrideMain={overrideMain.has(slot.memberId)}
                    showAllBtn={mem?.subLine?.toUpperCase() !== "ALL"}
                    inputRef={(el) => { inputRefs.current[idx] = el; }}
                    onSelect={(m) => {
                      setSlots((prev) => prev.map((s, i) => i === idx ? { memberId: m.id, memberName: m.nickname } : s));
                      // 다음 빈 슬롯으로 포커스
                      const nextEmpty = slots.findIndex((s, i) => i > idx && s.memberId === 0);
                      if (nextEmpty !== -1) setTimeout(() => inputRefs.current[nextEmpty]?.focus(), 0);
                    }}
                    onClear={() => {
                      const cleared = slots[idx].memberId;
                      setSlots((prev) => prev.map((s, i) => i === idx ? { memberId: 0, memberName: "" } : s));
                      if (cleared) {
                        setOverrideAll((prev) => { const n = new Set(prev); n.delete(cleared); return n; });
                        setOverrideMain((prev) => { const n = new Set(prev); n.delete(cleared); return n; });
                      }
                    }}
                    onToggleAll={() => {
                      const id = slot.memberId;
                      if (!id) return;
                      setOverrideAll((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
                      setOverrideMain((prev) => { const n = new Set(prev); n.delete(id); return n; });
                    }}
                    onToggleMain={() => {
                      const id = slot.memberId;
                      if (!id) return;
                      setOverrideMain((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
                      setOverrideAll((prev) => { const n = new Set(prev); n.delete(id); return n; });
                    }}
                    nextRef={() => {
                      const nextEmpty = slots.findIndex((s, i) => i > idx && s.memberId === 0);
                      if (nextEmpty !== -1) inputRefs.current[nextEmpty]?.focus();
                    }}
                  />
                );
              })}
            </div>
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div className="sc-bm-foot">
              <button className="btn-secondary" onClick={() => { setSlots(emptySlots()); setOverrideAll(new Set()); setOverrideMain(new Set()); setPasteReport([]); }}>전체 지우기</button>
              <div className="r">
                <button className="btn-secondary" onClick={onClose}>닫기</button>
                <button className="btn-primary" disabled={!canGenerate || loading} onClick={() => generate(filledIds)}>
                  {loading ? "생성 중..." : canGenerate ? "팀 생성" : `팀 생성 (${filledIds.length}/10)`}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {result === null ? (
              <div className="sc-cands">
                {savedResult && renderCandidate(
                  savedResult,
                  <span className="sc-cand-title saved">📌 고정한 구성</span>,
                  () => setSelectedIdx(-2),
                  <button className="sc-cand-act danger" onClick={() => setSavedResult(null)}>고정 해제</button>,
                  true,
                )}
                {results.slice(0, 3).map((r, i) => (
                  <React.Fragment key={i}>
                    {renderCandidate(
                      r,
                      <span className="sc-cand-title">구성 {i + 1}</span>,
                      () => setSelectedIdx(i),
                      <button className="sc-cand-act" onClick={() => { setSavedResult(r); generate(filledIds, true); }}>📌 이 구성 고정하고 나머지 다시 돌리기</button>,
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="sc-matchup">
                <div className="sc-mu-head">
                  <div className="blue">블루팀{isAdmin && <small>{result.sum1}</small>}</div>
                  <div className="mid">
                    {isAdmin && <span className={`sc-mu-diff ${result.diff <= 5 ? "good" : ""}`}>점수차 {result.diff}</span>}
                  </div>
                  <div className="red">{isAdmin && <small>{result.sum2}</small>}레드팀</div>
                </div>
                {LINE_KEYS.map((line) => {
                  const b = result.team1.find((x) => x.line === line);
                  const rd = result.team2.find((x) => x.line === line);
                  const adj = (p?: BPlayer) => p && p.lineAdjust !== 0 ? <em>{p.lineAdjust > 0 ? `+${p.lineAdjust}` : p.lineAdjust}</em> : null;
                  return (
                    <div key={line} className="sc-mu-row">
                      <div className="side blue">
                        <b>{b?.name ?? "-"}</b>
                        {isAdmin && b && <span className="sc">{b.score ?? 0}{adj(b)}</span>}
                      </div>
                      <div className="ln">
                        {LINE_MAP[line] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lineIconUrl(LINE_MAP[line].icon)} alt="" width={16} height={16} />
                        )}
                        {LINE_LBL[line]}
                      </div>
                      <div className="side red">
                        {isAdmin && rd && <span className="sc">{rd.score ?? 0}{adj(rd)}</span>}
                        <b>{rd?.name ?? "-"}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {codeErr && <div className="error" style={{ marginTop: 12 }}>{codeErr}</div>}
            {tournamentCode && (
              <div className="sc-code">
                <span className="l">토너먼트 코드</span>
                <span className="v">{tournamentCode}</span>
                <button onClick={() => navigator.clipboard.writeText(tournamentCode)}>복사</button>
              </div>
            )}
            {notifyMsg && <div className={`sc-notify ${notifyMsg.startsWith("✅") ? "ok" : "bad"}`}>{notifyMsg}</div>}

            <div className="sc-bm-foot">
              <div className="l">
                <button className="btn-secondary" onClick={resetResults}>← 명단 수정</button>
                {result !== null && <button className="btn-secondary" onClick={() => setSelectedIdx(-1)}>다른 구성 보기</button>}
                <button className="btn-secondary" disabled={loading} onClick={() => { if (result !== null) { setSavedResult(null); generate(filledIds, false); } else { generate(filledIds, true); } }}>
                  {loading ? "생성 중..." : "↻ 다시 생성"}
                </button>
              </div>
              <div className="r">
                <button className="btn-secondary" disabled={codeLoading || !!tournamentCode} onClick={generateCode}>{codeLoading ? "생성 중..." : "🎮 코드 생성"}</button>
                {result !== null && (
                  <button className="btn-primary" disabled={notifyLoading} onClick={async () => {
                    setNotifyLoading(true); setNotifyMsg("");
                    try {
                      const res = await fetch("/api/scrim/notify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ team1: result!.team1, team2: result!.team2, sum1: result!.sum1, sum2: result!.sum2, diff: result!.diff, slotMemberIds: slots.slice(0, 5).map(s => s.memberId).filter(id => id > 0) }),
                      });
                      const json = await res.json();
                      setNotifyMsg(res.ok ? "✅ 디스코드 전송 완료" : `❌ ${json.error}`);
                    } catch { setNotifyMsg("❌ 네트워크 오류"); }
                    finally { setNotifyLoading(false); }
                  }}>{notifyLoading ? "전송 중..." : "📢 디스코드 전송"}</button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 팀생성 모달용 슬롯 입력
function SlotMemberInput({ index, members, value, inputRef, onSelect, onClear, onToggleAll, onToggleMain, nextRef, isOverrideAll, isOverrideMain, showAllBtn, lineInfo }: {
  index: number;
  members: Member[];
  value: { memberId: number; memberName: string };
  inputRef: (el: HTMLInputElement | null) => void;
  onSelect: (m: Member) => void;
  onClear: () => void;
  onToggleAll: () => void;
  onToggleMain: () => void;
  nextRef: () => void;
  isOverrideAll?: boolean;
  isOverrideMain?: boolean;
  showAllBtn?: boolean;
  lineInfo?: string;
}) {
  const [query, setQuery] = useState(value.memberName);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filtered = query.length > 0 ? filterMembers(members, query) : members.slice(0, 8);

  useEffect(() => { setQuery(value.memberName); }, [value.memberName]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setActiveIdx(-1); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(m: Member) {
    onSelect(m);
    setQuery(m.nickname);
    setOpen(false);
    setActiveIdx(-1);
    nextRef();
  }

  return (
    <div ref={wrapRef} className={`sc-slot ${value.memberId ? "filled" : ""}`}>
      <span className="no">{index + 1}</span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(-1); if (!e.target.value) onClear(); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0 && e.key === "ArrowDown") {
            e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (open && filtered.length > 0 && e.key === "ArrowUp") {
            e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = activeIdx >= 0 ? filtered[activeIdx] : filtered.length > 0 ? filtered[0] : null;
            if (picked) select(picked);
            else { setOpen(false); nextRef(); }
          } else if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
        }}
        placeholder={`클랜원 ${index + 1}`}
      />
      {value.memberId > 0 && (
        <>
          {lineInfo && <span className="li">{lineInfo}</span>}
          <span className="acts">
            {showAllBtn && (
              <button className={`pill all ${isOverrideAll ? "on" : ""}`} onClick={onToggleAll} title="ALL 라인으로 임시 처리">ALL</button>
            )}
            <button className={`pill main ${isOverrideMain ? "on" : ""}`} onClick={onToggleMain} title="주라인 고정">주라인</button>
            <button className="x" onClick={onClear} title="비우기">×</button>
          </span>
        </>
      )}
      {open && filtered.length > 0 && (
        <div className="slot-candidates" style={{ zIndex: 50, left: 30, top: "calc(100% + 2px)" }}>
          {filtered.map((m, i) => (
            <button key={m.id} className={i === activeIdx ? "active" : ""} onMouseDown={() => select(m)}>{m.nickname}</button>
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
  const [tab, setTab] = useState<"matches" | "ranking" | "stats">("matches");
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchPage, setMatchPage] = useState(0);
  const MATCH_PAGE_SIZE = 20;
  const [editMatch, setEditMatch] = useState<MatchRecord | null>(null);
  const [editWinner, setEditWinner] = useState<1 | 2>(1);
  const [editSlots, setEditSlots] = useState<SlotData[]>([]);
  const [editErr, setEditErr] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Riot 전적 자동 동기화 모달: 클랜원 + 시작 시각을 입력하면 그로부터 24시간 이내
  // 커스텀 게임을 찾아 경기 목록에 자동으로 채워 넣는다.
  // 팀 생성 모달
  const [showBalanceModal, setShowBalanceModal] = useState(false);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncMemberId, setSyncMemberId] = useState<number | null>(null);
  const [syncMemberName, setSyncMemberName] = useState("");
  const [syncStartDate, setSyncStartDate] = useState(() => new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 10));
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
      if (membersRes.ok) setMembers(membersJson.members.filter((m: any) => m.mainLine !== 'ARAM' && m.status !== 'withdraw' && m.status !== 'black').map((m: any) => ({ id: m.id, nickname: m.nickname, subLine: m.subLine ?? null, mainLine: m.mainLine ?? null })));
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

  // 경기 목록 검색/필터, 통계 정렬
  const [matchSearch, setMatchSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "week">("all");
  const [statsSort, setStatsSort] = useState<{ key: StatsSortKey; dir: 1 | -1 }>({ key: "mmr", dir: -1 });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (editMatch) { setEditMatch(null); return; }
      if (showSyncModal) { setShowSyncModal(false); return; }
      if (detail) { setDetail(null); return; }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMatch, showSyncModal, detail]);

  if (authLoading) return null;
  if (!user) return (
    <div className="scrim">
      <div className="party-login-notice">
        내전 통계를 보려면 로그인이 필요합니다.
        <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
      </div>
    </div>
  );
  if (user.role === "captain" || (!user.scrimOnly && user.role !== "admin" && user.role !== "subadmin" && user.role !== "member" && !user.scrimOnly)) return (
    <div className="scrim"><div className="party-login-notice">접근 권한이 없습니다.</div></div>
  );

  function openEditModal(m: MatchRecord) {
    setEditMatch(m); setEditWinner((m.winnerTeam || 1) as 1 | 2); setEditErr("");
    const toSlot = (p: MatchParticipant): SlotData => ({
      memberId: p.memberId, memberName: p.nickname, champion: p.champion ?? "",
      kills: String(p.kills), deaths: String(p.deaths), assists: String(p.assists), damage: String(p.damage ?? ""),
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
            kills: Number(s.kills)||0, deaths: Number(s.deaths)||0, assists: Number(s.assists)||0, damage: Number(s.damage)||0,
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

  const [editingMmr, setEditingMmr] = useState<number | null>(null); // memberId
  const [mmrInput, setMmrInput] = useState("");
  const [statsSearch, setStatsSearch] = useState("");

  async function saveMmr(memberId: number, newMmr: number) {
    await fetch("/api/scrim/rating", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, mmr: Math.max(0, newMmr) }),
    });
    setEditingMmr(null);
    setMmrInput("");
    load();
  }

  // ===== 화면 표시용 파생 데이터 =====
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  // 이번 주 월요일 00:00 (KST) 시각
  const weekStartMs = (() => {
    const k = new Date(Date.now() + KST_OFFSET);
    const dow = (k.getUTCDay() + 6) % 7; // 월요일 = 0
    return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow) - KST_OFFSET;
  })();
  const doneMatches = matches.filter((m) => m.status === "done");
  const weekMatches = doneMatches.filter((m) => new Date(m.playedAt).getTime() >= weekStartMs);
  const weekMvp = (() => {
    const cnt = new Map<string, number>();
    for (const m of weekMatches) for (const p of [...m.team1, ...m.team2]) {
      if (p.isMvp) cnt.set(p.nickname, (cnt.get(p.nickname) ?? 0) + 1);
    }
    let best: { name: string; count: number } | null = null;
    cnt.forEach((count, name) => { if (!best || count > best.count) best = { name, count }; });
    return best as { name: string; count: number } | null;
  })();
  const activePlayerCount = players.filter((p) => p.games > 0).length;

  const matchQuery = matchSearch.trim();
  const filteredMatches = matches
    .filter((m) => matchFilter === "all" || new Date(m.playedAt).getTime() >= weekStartMs)
    .filter((m) => !matchQuery || [...m.team1, ...m.team2].some((p) =>
      matchScore(p.nickname, matchQuery) > 0 ||
      (!!p.champion && (champName(p.champion).includes(matchQuery) || p.champion.toLowerCase().includes(matchQuery.toLowerCase())))
    ));
  const pageCount = Math.max(1, Math.ceil(filteredMatches.length / MATCH_PAGE_SIZE));

  const sortedStats = players
    .filter((p) => !statsSearch || matchScore(p.nickname, statsSearch) > 0)
    .sort((a, b) => {
      const k = statsSort.key;
      let x = 0;
      if (k === "nickname") x = a.nickname.localeCompare(b.nickname);
      else if (k === "mmr") x = (a.scrimMmr ?? -1) - (b.scrimMmr ?? -1);
      else if (k === "games") x = a.games - b.games;
      else if (k === "winRate") x = (a.winRate ?? -1) - (b.winRate ?? -1);
      else x = Number(a.kda ?? -1) - Number(b.kda ?? -1);
      return x * statsSort.dir;
    });
  const sortTh = (key: StatsSortKey, label: string) => (
    <th
      className={statsSort.key === key ? "sorted" : ""}
      onClick={() => setStatsSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "nickname" ? 1 : -1 }))}
    >
      {label}{statsSort.key === key ? (statsSort.dir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="scrim">
      <div className="sc-head">
        <div>
          <h2 className="scrim-title">내전</h2>
          <p className="sc-sub">누적 {doneMatches.length}경기 · 참여 클랜원 {activePlayerCount}명</p>
        </div>
        <div className="sc-actions">
          {isAdmin && (
            <button
              className="btn-secondary"
              onClick={() => { setShowSyncModal(true); setSyncErr(""); setSyncResult(null); setSyncMemberId(null); setSyncMemberName(""); setSyncStartDate(new Date(Date.now() + 9*60*60*1000).toISOString().slice(0, 10)); setSyncStartTime(""); }}
            >
              ⟳ 전적 동기화
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowBalanceModal(true)}>＋ 팀 생성</button>
        </div>
      </div>

      <div className="sc-kpis">
        <div className="sc-kpi">
          <div className="l">이번 주 경기</div>
          <div className="v">{weekMatches.length}<small>경기</small></div>
        </div>
        <div className="sc-kpi">
          <div className="l">이번 주 최다 MVP</div>
          <div className="v">{weekMvp ? <>{weekMvp.name}<small>{weekMvp.count}회</small></> : <span className="sc-muted">-</span>}</div>
        </div>
      </div>

      <div className="sc-tabs">
        <button className={tab === "matches" ? "on" : ""} onClick={() => { setTab("matches"); setMatchPage(0); }}>
          경기 목록<span className="sc-count">{doneMatches.length}</span>
        </button>
        <button className={tab === "ranking" ? "on" : ""} onClick={() => setTab("ranking")}>순위표</button>
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

      {/* 클랜원 상세 (대시보드형) */}
      {detail && (() => {
        const d = detail;
        const avg = d.games > 0 ? [d.kills, d.deaths, d.assists].map((v) => (v / d.games).toFixed(1)) : ["0", "0", "0"];
        const lineRows = LINES.filter((l) => d.lineStats[l].games > 0).sort((a, b) => d.lineStats[b].games - d.lineStats[a].games);
        const champs = d.champStats ?? [];
        const wr = d.winRate ?? 0;
        const R = 54, C = 2 * Math.PI * R;
        return (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
            <div className="sc-detail">
              <div className="sc-d-top">
                <h3>{d.nickname}</h3>
                {d.scrimTier && <span className={tierClass(d.scrimTier)}>{d.scrimTier}</span>}
                {isAdmin && d.scrimMmr !== null && <span className="sc-muted sc-small">{d.scrimMmr}점</span>}
                <span className="sc-muted sc-small">· 솔랭 {tierLabel(d.tier, d.rank, d.lp)}</span>
                <button className="sc-d-close" onClick={() => setDetail(null)}>✕</button>
              </div>

              {d.games === 0 ? (
                <div className="sc-pnl sc-empty">내전 기록이 없습니다.</div>
              ) : (
                <>
                  <div className="sc-dash r1">
                    <div className="sc-pnl">
                      <h5>모스트 챔피언<span>승률 · KDA</span></h5>
                      <div className="sc-most">
                        {champs.slice(0, 3).map((c) => (
                          <div key={c.id} className="sc-most-row">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="sc-cimg" src={`/champions/${champImgId(c.id)}.png`} alt="" width={36} height={36} />
                            <div>
                              <div className="nm">{champName(c.id)}</div>
                              <div className="sb">{c.games}판 · KDA {c.kda}</div>
                            </div>
                            <div className={`val ${c.winRate >= 50 ? "up" : "dn"}`}>{c.winRate}<small>%</small></div>
                          </div>
                        ))}
                        {champs.length === 0 && <div className="sc-muted sc-small">챔피언 기록이 없습니다.</div>}
                      </div>
                    </div>

                    <div className="sc-pnl">
                      <h5>승률<span>{d.games}전</span></h5>
                      <div className="sc-donut-wrap">
                        <div className="sc-donut">
                          <svg width="128" height="128">
                            <circle cx="64" cy="64" r={R} fill="none" className="track" strokeWidth="10" />
                            <circle cx="64" cy="64" r={R} fill="none" className="fill" strokeWidth="10" strokeLinecap="round"
                              strokeDasharray={`${(C * wr) / 100} ${C}`} />
                          </svg>
                          <div className="c"><div><b>{wr}%</b><small>WIN RATE</small></div></div>
                        </div>
                        <div className="sc-muted sc-small">{d.wins}승 {d.games - d.wins}패</div>
                      </div>
                    </div>

                    <div className="sc-pnl">
                      <h5>KDA</h5>
                      <div><span className="sc-big">{d.kda ?? "-"}</span><span className="sc-big-lbl">평점</span></div>
                      <div className="sc-kda-avg">{avg[0]} / <em>{avg[1]}</em> / {avg[2]}</div>
                      <div className="sc-kda-cap">판당 평균 킬 / 데스 / 어시스트</div>
                      <div className="sc-mvp-line"><span>MVP</span><span><b>{d.mvpCount}회</b> · {Math.round((d.mvpCount / d.games) * 100)}%</span></div>
                    </div>
                  </div>

                  <div className="sc-dash r2">
                    <div className="sc-pnl">
                      <h5>포지션 통계</h5>
                      <div className="sc-pos">
                        {lineRows.map((l) => {
                          const s = d.lineStats[l];
                          const lineWr = Math.round(((s.wins ?? 0) / s.games) * 100);
                          return (
                            <div key={l} className="sc-pos-row">
                              <div className="sc-pos-ic">
                                {LINE_MAP[l] && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={lineIconUrl(LINE_MAP[l].icon)} alt={l} width={18} height={18} />
                                )}
                              </div>
                              <div>
                                <div className="sc-pos-top">
                                  <b>{LINE_LABEL[l]}</b>
                                  <span>{s.games}판 · 승률 {lineWr}% · KDA {((s.kills + s.assists) / Math.max(s.deaths, 1)).toFixed(2)}</span>
                                </div>
                                <div className="sc-pos-bar"><i style={{ width: `${Math.round((s.games / d.games) * 100)}%` }} /></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="sc-pnl">
                      <h5>챔피언 통계<span>상위 {champs.length}개</span></h5>
                      <div className="sc-cgrid">
                        {champs.map((c) => (
                          <div key={c.id} className="sc-cg">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="sc-cimg" src={`/champions/${champImgId(c.id)}.png`} alt="" width={36} height={36} />
                            <div className="t">
                              <b>{champName(c.id)}</b>
                              <span>{c.games}판 · <em className={c.winRate >= 50 ? "up" : "dn"}>{c.winRate}%</em> · {c.kda}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "matches" && (
        <div>
          <div className="sc-toolbar">
            <input
              className="sc-input"
              placeholder="클랜원 / 챔피언 검색"
              value={matchSearch}
              onChange={(e) => { setMatchSearch(e.target.value); setMatchPage(0); }}
            />
            <div className="sc-chips">
              {([["all", "전체"], ["week", "이번 주"]] as const).map(([k, label]) => (
                <button key={k} className={`sc-chip ${matchFilter === k ? "on" : ""}`} onClick={() => { setMatchFilter(k); setMatchPage(0); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {matchesLoading ? <p>불러오는 중...</p> : filteredMatches.length === 0
            ? <p className="sc-empty">{matches.length === 0 ? "등록된 경기가 없습니다." : "조건에 맞는 경기가 없습니다."}</p>
            : (
            <>
              {filteredMatches.slice(matchPage * MATCH_PAGE_SIZE, (matchPage + 1) * MATCH_PAGE_SIZE).map((m) => {
                const dt = new Date(m.playedAt);
                const dateStr = dt.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
                const timeStr = dt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                const isPending = m.status !== "done";
                const maxDamage = Math.max(1, ...m.team1.map((p) => p.damage ?? 0), ...m.team2.map((p) => p.damage ?? 0));
                return (
                  <div key={m.id} className="sc-match">
                    <div className="sc-m-meta">
                      <b>{dateStr} {timeStr}</b>
                      {m.note && <span>{m.note}</span>}
                      {m.riotMatchId && <span className="sc-badge">자동 동기화</span>}
                      {isAdmin && (
                        <div className="sc-m-menu">
                          {/* 자동 동기화된 경기(riotMatchId 있음)는 Riot 전적 그대로라 수정하지 않고, 삭제만 허용한다. */}
                          {!m.riotMatchId && <button className="sc-icon-btn" onClick={() => openEditModal(m)}>수정</button>}
                          <button className="sc-icon-btn danger" onClick={() => deleteMatch(m.id)}>삭제</button>
                        </div>
                      )}
                    </div>
                    <div className="sc-teams">
                      {([1, 2] as const).map((t) => {
                        const team = sortTeamByLine(t === 1 ? m.team1 : m.team2);
                        const isWin = !isPending && m.winnerTeam === t;
                        const sum = team.reduce((a, p) => [a[0] + p.kills, a[1] + p.deaths, a[2] + p.assists], [0, 0, 0]);
                        return (
                          <div key={t} className={`sc-team ${isPending ? "" : isWin ? "win" : "loss"}`}>
                            <div className="sc-t-head">
                              <span className={`sc-dot ${t === 1 ? "blue" : "red"}`} />
                              {t === 1 ? "블루팀" : "레드팀"}
                              {!isPending && <span className={`sc-res ${isWin ? "w" : "l"}`}>{isWin ? "승리" : "패배"}</span>}
                              <span className="sc-t-sum">{sum.join(" / ")}</span>
                            </div>
                            {team.map((p) => {
                              const dmgPct = Math.round(((p.damage ?? 0) / maxDamage) * 100);
                              const player = players.find((x) => x.memberId === p.memberId);
                              return (
                                <div key={p.memberId} className="sc-row">
                                  <span className="sc-champ">
                                    {p.champion
                                      // eslint-disable-next-line @next/next/no-img-element
                                      ? <img src={`/champions/${champImgId(p.champion)}.png`} alt="" width={30} height={30} />
                                      : <span className="sc-ph" />}
                                    {p.line && LINE_MAP[p.line] && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img className="sc-ln" src={lineIconUrl(LINE_MAP[p.line].icon)} alt={p.line} width={14} height={14} />
                                    )}
                                  </span>
                                  <span className={`sc-name ${player ? "sc-pn" : ""}`} onClick={() => player && setDetail(player)}>
                                    <span className="txt">{p.nickname}</span>
                                    {p.isMvp && <span className="sc-mvp">MVP</span>}
                                  </span>
                                  <span className="sc-kda">
                                    {p.kills} / <em>{p.deaths}</em> / {p.assists}
                                    <small>{((p.kills + p.assists) / Math.max(p.deaths, 1)).toFixed(2)} KDA</small>
                                  </span>
                                  <span className="sc-dmg">
                                    {!!p.damage && (
                                      <>
                                        {p.damage.toLocaleString()}
                                        <span className="sc-bar"><i style={{ width: `${dmgPct}%` }} /></span>
                                      </>
                                    )}
                                  </span>
                                  <span className="sc-items">
                                    {p.items?.map((itemId, i) => {
                                      const src = itemIconUrl(itemId);
                                      return src ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={i} src={src} alt="" width={19} height={19} />
                                      ) : null;
                                    })}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="sc-pager">
                <button className="btn-secondary" disabled={matchPage <= 0} onClick={() => setMatchPage((p) => p - 1)}>‹ 이전</button>
                <span>{matchPage + 1} / {pageCount}</span>
                <button className="btn-secondary" disabled={matchPage + 1 >= pageCount} onClick={() => setMatchPage((p) => p + 1)}>다음 ›</button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "ranking" && (
        loading ? <p>불러오는 중...</p> : (
          <>
            <div className="sc-rank-grid">
              {LINES.map((line) => {
                const lineMembers = members
                  .filter((m) => m.mainLine === line)
                  .map((m) => players.find((p) => p.memberId === m.id))
                  .filter((p): p is Player => !!p && p.scrimMmr !== null && p.games >= 5)
                  .sort((a, b) => (b.scrimMmr ?? 0) - (a.scrimMmr ?? 0));
                return (
                  <div key={line} className="sc-rank-col">
                    <div className="sc-rank-head">
                      {LINE_MAP[line] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={lineIconUrl(LINE_MAP[line].icon)} alt={line} width={18} height={18} />
                      )}
                      {LINE_LABEL[line]}
                      <span>{lineMembers.length}명</span>
                    </div>
                    {lineMembers.length === 0 && <div className="sc-rank-empty">등록된 클랜원 없음</div>}
                    {lineMembers.map((p, i) => (
                      <div key={p.memberId} className="sc-rank-row" onClick={() => setDetail(p)}>
                        <span className={`sc-no ${i < 3 ? `n${i + 1}` : ""}`}>{i + 1}</span>
                        <span className="sc-rank-nm">{p.nickname}</span>
                        <div className="sc-rank-sub">
                          {p.scrimTier && <span className={tierClass(p.scrimTier)}>{p.scrimTier}</span>}
                          {isAdmin && p.scrimMmr !== null && <div>{p.scrimMmr}점</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="sc-note">5경기 이상 참여한 클랜원만 주 라인 기준으로 표시됩니다.</div>
          </>
        )
      )}

      {tab === "stats" && (
        <>
          {error && <div className="error">{error}</div>}
          {loading ? <p>불러오는 중...</p> : (
            <>
              <div className="sc-toolbar">
                <input className="sc-input" value={statsSearch} onChange={(e) => setStatsSearch(e.target.value)} placeholder="클랜원 검색" />
                <span className="sc-hint">열 제목을 누르면 정렬됩니다</span>
              </div>
              <div className="sc-tbl-wrap">
                <table className="sc-tbl">
                  <thead>
                    <tr>
                      {sortTh("nickname", "클랜원")}
                      {sortTh("mmr", "내전 티어")}
                      <th>라인 분포</th>
                      {sortTh("games", "판수")}
                      {sortTh("winRate", "승률")}
                      {sortTh("kda", "KDA")}
                      {isAdmin && <th>MMR 조정</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.map((p) => {
                      const maxLine = Math.max(1, ...LINES.map((l) => p.lineCounts[l]));
                      return (
                        <tr key={p.memberId}>
                          <td><span className="sc-pn" onClick={() => setDetail(p)}>{p.nickname}</span></td>
                          <td>
                            {p.scrimTier
                              ? <>
                                  <span className={tierClass(p.scrimTier)}>{p.scrimTier}</span>
                                  {isAdmin && p.scrimMmr !== null && <span className="sc-mmr">{p.scrimMmr}</span>}
                                </>
                              : <span className="sc-muted">-</span>}
                          </td>
                          <td>
                            <span className="sc-lines" title={LINES.map((l) => `${LINE_LABEL[l]} ${p.lineCounts[l]}`).join(" · ")}>
                              {LINES.map((l) => (
                                <i key={l} className={p.lineCounts[l] ? "" : "z"} style={{ height: Math.max(2, Math.round((p.lineCounts[l] / maxLine) * 22)) }} />
                              ))}
                            </span>
                          </td>
                          <td>{p.games > 0 ? `${p.games}판` : <span className="sc-muted">-</span>}</td>
                          <td>
                            {p.winRate !== null
                              ? <span className={`sc-wr ${p.winRate >= 50 ? "up" : "dn"}`}>{p.winRate}%<span className="sc-bar"><i style={{ width: `${p.winRate}%` }} /></span></span>
                              : <span className="sc-muted">-</span>}
                          </td>
                          <td className={p.kda && Number(p.kda) >= 3 ? "sc-kda-good" : ""}>{p.kda ?? <span className="sc-muted">-</span>}</td>
                          {isAdmin && (
                            <td>
                              <span className="sc-mmr-adj">
                                <input
                                  type="number" min={1}
                                  value={editingMmr === p.memberId ? mmrInput : ""}
                                  onFocus={() => { setEditingMmr(p.memberId); setMmrInput(""); }}
                                  onChange={(e) => setMmrInput(e.target.value)}
                                  placeholder="점수"
                                />
                                <button className="plus" onClick={() => { const v = Math.max(1, Number(mmrInput) || 0); saveMmr(p.memberId, (p.scrimMmr ?? 0) + v); }}>+</button>
                                <button className="minus" onClick={() => { const v = Math.max(1, Number(mmrInput) || 0); saveMmr(p.memberId, (p.scrimMmr ?? 0) - v); }}>−</button>
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* 팀 생성 모달 */}
      {showBalanceModal && (
        <BalanceModal
          members={members}
          onClose={() => setShowBalanceModal(false)}
          isAdmin={isAdmin}
        />
      )}

      {/* Riot 전적 자동 동기화 모달 */}
      {showSyncModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 420 }}>
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
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 640, width: "95vw" }}>
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
