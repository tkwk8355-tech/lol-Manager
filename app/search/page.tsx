// =============================================================
// 전적 검색 (/search)
// - Riot ID로 랭크 · 최근 전적 조회
// - "함께한 소환사": 불러온 경기 전체에서 같은 팀이었던 사람을 집계해
//   누구와 가장 많이 게임했는지 보여준다. (더 보기로 집계 범위를 넓힐 수 있음)
// - 함께한 소환사를 누르면 그 사람과 같이 한 경기만 걸러서 보여준다.
// =============================================================

"use client";

import { useMemo, useRef, useState } from "react";

// ------------------------------ 타입 ------------------------------
interface LeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

interface Participant {
  puuid: string;
  teamId: number;
  champion: string;
  championKo: string;
  championIcon: string;
  name: string;
  tagLine: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  items: (string | null)[];
  spells: (string | null)[];
  runes: { keystone: string | null; secondary: string | null };
  win: boolean;
  placement: number;
  subteamId: number;
  isMe: boolean;
}

interface Match {
  matchId: string;
  queue: string;
  queueId?: number;
  isCustom?: boolean;
  isArena: boolean;
  durationSec: number;
  createdAt: number;
  champion: string;
  championKo: string;
  championIcon: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage?: number;
  items: (string | null)[];
  spells: (string | null)[];
  runes: { keystone: string | null; secondary: string | null };
  positionIcon: string | null;
  placement: number;
  win: boolean;
  participants: Participant[];
}

interface SummonerData {
  version: string;
  account: { gameName: string; tagLine: string; puuid: string };
  summoner: { level: number; profileIcon: string };
  league: LeagueEntry[];
  matches: Match[];
  hasMore?: boolean;
  nextStart?: number;
  notice?: string | null;
}

interface Mate {
  puuid: string;
  name: string;
  tagLine: string;
  icon: string;          // 가장 최근에 같이 할 때 그 사람이 한 챔피언
  games: number;         // 함께한 전체 판수 (내전은 상대팀이었던 판도 포함)
  teamGames: number;     // 같은 팀이었던 판수
  wins: number;          // 같은 팀일 때 이긴 판수
  vsGames: number;       // 내전/사설겜에서 상대팀이었던 판수
  lastAt: number;
  matchIds: Set<string>;
}

// ------------------------------ 헬퍼 ------------------------------
const PAGE = 20;          // 한 번에 불러오는 경기 수 (서버와 동일, 최근 2년까지)

const QUEUE_TABS: { key: string; label: string; ids: number[] | null }[] = [
  { key: "all",   label: "전체",   ids: null },
  { key: "solo",  label: "솔로랭크", ids: [420] },
  { key: "flex",  label: "자유랭크", ids: [440] },
  { key: "norm",  label: "일반",   ids: [400, 430, 490] },
  { key: "aram",  label: "칼바람",  ids: [450] },
  { key: "scrim", label: "내전",   ids: [] },   // 내전은 isCustom으로 거름
];

const TIER_KO: Record<string, string> = {
  IRON: "아이언", BRONZE: "브론즈", SILVER: "실버", GOLD: "골드",
  PLATINUM: "플래티넘", EMERALD: "에메랄드", DIAMOND: "다이아몬드",
  MASTER: "마스터", GRANDMASTER: "그랜드마스터", CHALLENGER: "챌린저",
};
const TIER_COLOR: Record<string, string> = {
  IRON: "#8a8a8a", BRONZE: "#b06b3f", SILVER: "#9aa4ad", GOLD: "#e0b349",
  PLATINUM: "#4ec3c0", EMERALD: "#3fc380", DIAMOND: "#6aa3ff",
  MASTER: "#c879e6", GRANDMASTER: "#e25b5b", CHALLENGER: "#f0c14b",
};
const APEX = ["MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISION: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };

function tierText(tier: string, rank: string) {
  const ko = TIER_KO[tier] ?? tier;
  return APEX.includes(tier) ? ko : `${ko} ${DIVISION[rank] ?? rank}`;
}
function tierEmblemUrl(tier: string) { return `/tiers/emblem-${tier.toLowerCase()}.png`; }

function kdaRatio(k: number, d: number, a: number) {
  if (d === 0) return k + a > 0 ? "Perfect" : "0.00";
  return ((k + a) / d).toFixed(2);
}
function kdaClass(k: number, d: number, a: number) {
  const r = d === 0 ? 99 : (k + a) / d;
  return r >= 5 ? "great" : r >= 3 ? "good" : r < 1.5 ? "bad" : "";
}
function timeAgo(ms: number) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return `${Math.floor(day / 30)}달 전`;
}
function duration(sec: number) { return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }
function winLike(m: Match) { return m.isArena ? m.placement === 1 : m.win; }
function isRemake(m: Match) { return !m.isArena && m.durationSec < 300; }
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }

function myTeam(m: Match): Participant[] {
  const me = m.participants.find((p) => p.isMe);
  if (!me) return [];
  return m.participants.filter((p) => (m.isArena ? p.subteamId === me.subteamId : p.teamId === me.teamId));
}
function arenaSubteams(ps: Participant[]): Participant[][] {
  const g: Record<number, Participant[]> = {};
  for (const p of ps) (g[p.subteamId] ||= []).push(p);
  return Object.values(g).sort((a, b) => (a[0]?.placement ?? 99) - (b[0]?.placement ?? 99));
}

// 내전 같은 사용자 설정 게임(queueId 0)인지
function isCustom(m: Match) { return m.isCustom ?? m.queueId === 0; }

// ── 시즌 구분 ──
// 2024년부터 1년 1시즌. 각 시즌 첫 패치일(한국시간 기준)로 나눈다.
// 새 시즌이 시작되면 맨 위에 한 줄 추가하면 된다.
const SEASONS: { key: string; label: string; start: number }[] = [
  { key: "2026", label: "S2026", start: Date.parse("2026-01-08T00:00:00+09:00") },
  { key: "2025", label: "S2025", start: Date.parse("2025-01-09T00:00:00+09:00") },
  { key: "2024", label: "S2024", start: Date.parse("2024-01-10T00:00:00+09:00") },
];
function seasonOf(ms: number) {
  return SEASONS.find((s) => ms >= s.start) ?? null;
}

interface ChampStat {
  champion: string; name: string; icon: string;
  games: number; wins: number; k: number; d: number; a: number; cs: number; sec: number;
}
// 경기 목록 → 챔피언별 판수/승/KDA/CS (다시하기 판 제외, 판수 많은 순)
function champStats(ms: Match[]): ChampStat[] {
  const map = new Map<string, ChampStat>();
  for (const m of ms) {
    if (isRemake(m)) continue;
    const c = map.get(m.champion) ?? { champion: m.champion, name: m.championKo, icon: m.championIcon, games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0, sec: 0 };
    c.games++; if (winLike(m)) c.wins++;
    c.k += m.kills; c.d += m.deaths; c.a += m.assists; c.cs += m.cs; c.sec += m.durationSec;
    map.set(m.champion, c);
  }
  return [...map.values()].sort((x, y) => y.games - x.games || y.wins - x.wins);
}

// 불러온 경기 전체에서 함께한 소환사를 집계 (다시하기 판은 제외)
// - 일반/랭크: 같은 팀이었던 사람만
// - 내전·사설겜: 상대팀까지 전원 (같이 게임한 것으로 봄)
function buildMates(matches: Match[]): Mate[] {
  const map = new Map<string, Mate>();
  for (const m of matches) {
    if (isRemake(m)) continue;
    const won = winLike(m);
    const mine = new Set(myTeam(m).map((p) => p.puuid));
    const pool = isCustom(m) ? m.participants : myTeam(m);
    for (const p of pool) {
      if (p.isMe) continue;
      let e = map.get(p.puuid);
      if (!e) {
        e = { puuid: p.puuid, name: p.name, tagLine: p.tagLine, icon: p.championIcon, games: 0, teamGames: 0, wins: 0, vsGames: 0, lastAt: 0, matchIds: new Set() };
        map.set(p.puuid, e);
      }
      e.games++;
      if (mine.has(p.puuid)) { e.teamGames++; if (won) e.wins++; }
      else e.vsGames++;
      e.matchIds.add(m.matchId);
      if (m.createdAt > e.lastAt) { e.lastAt = m.createdAt; e.icon = p.championIcon; e.name = p.name; e.tagLine = p.tagLine || e.tagLine; }
    }
  }
  return [...map.values()]
    .filter((e) => e.games >= 2)
    .sort((a, b) => b.games - a.games || b.teamGames - a.teamGames || b.lastAt - a.lastAt);
}

// ------------------------------ 작은 컴포넌트 ------------------------------
function Img({ src, size, className, alt = "" }: { src: string | null | undefined; size: number; className?: string; alt?: string }) {
  if (!src) return <span className={`sr-img-empty ${className ?? ""}`} style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={className} loading="lazy" />;
}

function Items({ icons, size = 22 }: { icons: (string | null)[]; size?: number }) {
  return (
    <div className="sr-items">
      {icons.map((src, i) => (
        <span className={`sr-item ${i === 6 ? "trinket" : ""}`} key={i} style={{ width: size, height: size }}>
          {src && <Img src={src} size={size} />}
        </span>
      ))}
    </div>
  );
}

function RankBox({ label, entry }: { label: string; entry?: LeagueEntry }) {
  if (!entry) {
    return (
      <div className="sr-rank unranked">
        <span className="sr-rank-label">{label}</span>
        <span className="sr-rank-none">Unranked</span>
      </div>
    );
  }
  const total = entry.wins + entry.losses;
  const wr = pct(entry.wins, total);
  return (
    <div className="sr-rank">
      <Img src={tierEmblemUrl(entry.tier)} size={56} className="sr-rank-emblem" alt={entry.tier} />
      <div className="sr-rank-body">
        <span className="sr-rank-label">{label}</span>
        <span className="sr-rank-tier" style={{ color: TIER_COLOR[entry.tier] }}>{tierText(entry.tier, entry.rank)}</span>
        <span className="sr-rank-lp">{entry.leaguePoints} LP</span>
      </div>
      <div className="sr-rank-rec">
        <span>{entry.wins}승 {entry.losses}패</span>
        <b className={wr >= 55 ? "hi" : ""}>{wr}%</b>
      </div>
    </div>
  );
}

function DetailRow({ p, maxDmg, tier, onSelect }: {
  p: Participant; maxDmg: number; tier?: { tier: string; rank: string }; onSelect: (n: string, t: string) => void;
}) {
  return (
    <div className={`sr-drow ${p.isMe ? "me" : ""}`}>
      <div className="sr-dplayer">
        <div className="sr-dchamp">
          <Img src={p.championIcon} size={32} alt={p.championKo} />
          <span className="lv">{p.champLevel}</span>
        </div>
        <div className="sr-dsr">
          <div>{p.spells.map((s, i) => <Img key={i} src={s} size={15} />)}</div>
          <div><Img src={p.runes.keystone} size={15} /><Img src={p.runes.secondary} size={15} /></div>
        </div>
        <div className="sr-dname">
          <button type="button" onClick={() => p.tagLine && onSelect(p.name, p.tagLine)} title={`${p.name}#${p.tagLine}`}>{p.name}</button>
          {tier && <span className="sr-dtier" style={{ color: TIER_COLOR[tier.tier] }}>{tierText(tier.tier, tier.rank)}</span>}
        </div>
      </div>
      <div className="sr-dkda">
        <span>{p.kills}/<i>{p.deaths}</i>/{p.assists}</span>
        <small className={kdaClass(p.kills, p.deaths, p.assists)}>{kdaRatio(p.kills, p.deaths, p.assists)}</small>
      </div>
      <div className="sr-ddmg">
        <span>{p.damage.toLocaleString()}</span>
        <div className="bar"><i style={{ width: `${maxDmg > 0 ? (p.damage / maxDmg) * 100 : 0}%` }} /></div>
      </div>
      <div className="sr-dcs">{p.cs}</div>
      <div className="sr-ditems"><Items icons={p.items} size={20} /></div>
    </div>
  );
}

// ------------------------------ 메인 ------------------------------
export default function SearchPage() {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [data, setData] = useState<SummonerData | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextStart, setNextStart] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Record<string, { tier: string; rank: string }>>({});
  const [queueTab, setQueueTab] = useState("all");
  const [mateFilter, setMateFilter] = useState<string | null>(null); // 선택한 동료 puuid
  const [showAllMates, setShowAllMates] = useState(false);
  const [seasonKey, setSeasonKey] = useState<string | null>(null);   // null = 불러온 경기 중 가장 최근 시즌
  const [showAllChamps, setShowAllChamps] = useState(false);
  const [seasonLoading, setSeasonLoading] = useState<string | null>(null); // 진행 문구
  const seasonCancel = useRef(false);
  const curPuuid = useRef<string | null>(null);         // 지금 화면에 띄운 소환사

  // ── 데이터 로드 ──
  async function fetchData(name: string, tag: string, refresh = false) {
    setError("");
    seasonCancel.current = true;
    if (!refresh) { setData(null); setMatches([]); setExpanded(null); setMateFilter(null); setQueueTab("all"); setShowAllMates(false); setSeasonKey(null); setShowAllChamps(false); }
    const url = `/api/summoner?gameName=${encodeURIComponent(name)}&tagLine=${encodeURIComponent(tag)}${refresh ? "&refresh=1" : ""}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "문제가 발생했습니다."); return; }
      curPuuid.current = json.account?.puuid ?? null;
      setData(json);
      setMatches(json.matches ?? []);
      setHasMore(!!json.hasMore);
      setNextStart(json.nextStart ?? (json.matches ?? []).length);
      setNotice(json.notice ?? "");
      if (refresh) { setMateFilter(null); }
    } catch {
      setError("네트워크 오류입니다. 다시 시도해주세요.");
    }
  }

  // 더 보기 한 페이지(start부터 20판)를 받아 목록에 붙인다. 성공하면 서버 응답을 돌려줌.
  async function fetchPage(start: number): Promise<{ matches: Match[]; hasMore: boolean; nextStart: number; notice: string | null } | null> {
    if (!data) return null;
    const a = data.account;
    const url = `/api/summoner?puuid=${encodeURIComponent(a.puuid)}&gameName=${encodeURIComponent(a.gameName)}&tagLine=${encodeURIComponent(a.tagLine)}&start=${start}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) { setError(json.error || "더 불러오지 못했습니다."); return null; }
    const got = (json.matches ?? []) as Match[];
    if (curPuuid.current !== a.puuid) return null; // 그 사이 다른 소환사를 검색함
    setMatches((prev) => {
      const seen = new Set(prev.map((m) => m.matchId));
      return [...prev, ...got.filter((m) => !seen.has(m.matchId))];
    });
    const ns = json.nextStart ?? start + got.length;
    setHasMore(!!json.hasMore);
    setNextStart(ns);
    setNotice(json.notice ?? "");
    return { matches: got, hasMore: !!json.hasMore, nextStart: ns, notice: json.notice ?? null };
  }

  async function loadMore() {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextStart);
    } catch {
      setError("네트워크 오류입니다. 다시 시도해주세요.");
    } finally {
      setLoadingMore(false);
    }
  }

  // 선택한 시즌 시작일 이전 경기가 나올 때까지 더 보기를 반복한다.
  // 요청 한도에 걸리면(일부만 받음) 잠깐 기다렸다가 이어서 받는다. 중지 버튼으로 멈출 수 있음.
  async function loadSeason(seasonStart: number) {
    if (!data || loadingMore || seasonLoading) return;
    seasonCancel.current = false;
    setLoadingMore(true);
    let start = nextStart;
    let more = hasMore;
    let oldest = matches.length ? Math.min(...matches.map((m) => m.createdAt)) : Date.now();
    let loaded = matches.length;
    try {
      while (more && oldest >= seasonStart && !seasonCancel.current) {
        setSeasonLoading(`시즌 전적 불러오는 중… ${loaded}판`);
        const r = await fetchPage(start);
        if (!r) break;
        if (r.matches.length) oldest = Math.min(oldest, ...r.matches.map((m) => m.createdAt));
        loaded += r.matches.length;
        start = r.nextStart;
        more = r.hasMore;
        if (r.notice && more && !seasonCancel.current) {
          // 개인 키 한도(2분당 100회) — 잠깐 쉬었다가 이어서
          for (let s = 30; s > 0 && !seasonCancel.current; s--) {
            setSeasonLoading(`요청 한도 대기 중… ${s}초 (${loaded}판)`);
            await new Promise((res) => setTimeout(res, 1000));
          }
        }
      }
    } catch {
      setError("네트워크 오류입니다. 다시 시도해주세요.");
    } finally {
      setSeasonLoading(null);
      setLoadingMore(false);
    }
  }

  async function loadTiers(m: Match) {
    const need = m.participants.map((p) => p.puuid).filter((pu) => !(pu in tiers));
    if (need.length === 0) return;
    try {
      const res = await fetch(`/api/tiers?puuids=${need.join(",")}`);
      const json = await res.json();
      if (res.ok && json.tiers) setTiers((prev) => ({ ...prev, ...json.tiers }));
    } catch {}
  }

  function toggleExpand(m: Match) {
    const opening = expanded !== m.matchId;
    setExpanded(opening ? m.matchId : null);
    if (opening) loadTiers(m);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    let name = gameName.trim();
    let tag = tagLine.trim();
    // "이름#태그"를 이름 칸에 한 번에 붙여넣은 경우도 처리
    if (name.includes("#") && !tag) { const [n, t] = name.split("#"); name = n.trim(); tag = (t ?? "").trim(); setGameName(name); setTagLine(tag); }
    if (!name || !tag) { setError("소환사명과 태그를 모두 입력하세요."); return; }
    setLoading(true);
    await fetchData(name, tag);
    setLoading(false);
  }

  async function handleRefresh() {
    if (!data) return;
    setRefreshing(true);
    await fetchData(data.account.gameName, data.account.tagLine, true);
    setRefreshing(false);
  }

  async function searchAccount(name: string, tag: string) {
    setGameName(name); setTagLine(tag);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setLoading(true);
    await fetchData(name, tag);
    setLoading(false);
  }

  // "FlameKeeper#LAST"처럼 #이 들어간 값을 붙여넣거나 입력하면 이름/태그로 나눠 넣는다.
  function onNameChange(v: string) {
    const i = v.indexOf("#");
    if (i < 0) { setGameName(v); return; }
    setGameName(v.slice(0, i).trim());
    const tag = v.slice(i + 1).replace(/#/g, "").trim();
    if (tag) setTagLine(tag);
    document.getElementById("sr-tag")?.focus();
  }
  function onTagChange(v: string) {
    // 태그 칸에 "이름#태그" 전체를 붙여넣은 경우도 처리
    const i = v.indexOf("#");
    if (i < 0) { setTagLine(v); return; }
    const name = v.slice(0, i).trim();
    if (name) setGameName(name);
    setTagLine(v.slice(i + 1).replace(/#/g, "").trim());
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "#") { e.preventDefault(); document.getElementById("sr-tag")?.focus(); }
  }

  // ── 파생 데이터 ──
  const mates = useMemo(() => buildMates(matches), [matches]);
  const selectedMate = mates.find((x) => x.puuid === mateFilter) ?? null;

  const visible = useMemo(() => {
    const tab = QUEUE_TABS.find((t) => t.key === queueTab);
    return matches.filter((m) =>
      (!tab?.ids || (tab.key === "scrim" ? isCustom(m) : !isCustom(m) && m.queueId != null && tab.ids.includes(m.queueId))) &&
      (!selectedMate || selectedMate.matchIds.has(m.matchId)));
  }, [matches, queueTab, selectedMate]);

  const summary = useMemo(() => {
    const ms = visible.filter((m) => !isRemake(m));
    const games = ms.length;
    const wins = ms.filter(winLike).length;
    let k = 0, d = 0, a = 0;
    for (const m of ms) { k += m.kills; d += m.deaths; a += m.assists; }
    return { games, wins, losses: games - wins, k, d, a };
  }, [visible]);

  // ── 시즌별 챔피언 (큐 탭은 따르고, 함께한 소환사 필터는 무시) ──
  const queueMatches = useMemo(() => {
    const tab = QUEUE_TABS.find((t) => t.key === queueTab);
    return matches.filter((m) => !tab?.ids || (tab.key === "scrim" ? isCustom(m) : !isCustom(m) && m.queueId != null && tab.ids.includes(m.queueId)));
  }, [matches, queueTab]);
  // 불러온 경기에 등장한 시즌 (최신순)
  const seasonsInData = useMemo(() => {
    const keys = new Set(matches.map((m) => seasonOf(m.createdAt)?.key).filter(Boolean));
    return SEASONS.filter((s) => keys.has(s.key));
  }, [matches]);
  const season = SEASONS.find((s) => s.key === seasonKey) ?? seasonsInData[0] ?? SEASONS[0];
  const seasonEnd = SEASONS[SEASONS.indexOf(season) - 1]?.start ?? Infinity;
  const seasonChamps = useMemo(
    () => champStats(queueMatches.filter((m) => m.createdAt >= season.start && m.createdAt < seasonEnd)),
    [queueMatches, season, seasonEnd],
  );
  const seasonGames = seasonChamps.reduce((s, c) => s + c.games, 0);
  const oldestLoaded = matches.length ? Math.min(...matches.map((m) => m.createdAt)) : Date.now();
  // 이 시즌 경기가 아직 다 안 불러와졌는지 (가장 오래된 경기가 시즌 시작 이후 + 더 받을 게 있음)
  const seasonIncomplete = hasMore && oldestLoaded >= season.start;
  const shownChamps = showAllChamps ? seasonChamps : seasonChamps.slice(0, 7);

  const solo = data?.league.find((l) => l.queueType === "RANKED_SOLO_5x5");
  const flex = data?.league.find((l) => l.queueType === "RANKED_FLEX_SR");
  const topMate = mates[0];
  const restMates = mates.slice(1, showAllMates ? undefined : 8);
  const maxMateGames = topMate?.games ?? 1;
  const wr = pct(summary.wins, summary.games);

  return (
    <div className="sr">
      {/* ── 검색 ── */}
      <section className={`sr-hero ${data ? "compact" : ""}`}>
        {!data && (
          <div className="sr-hero-text">
            <h2>전적 검색</h2>
            <p>Riot ID로 랭크 · 최근 전적 · 자주 함께한 소환사를 확인해요.</p>
          </div>
        )}
        <form className="sr-form" onSubmit={handleSearch}>
          <div className="sr-input">
            <span className="sr-input-ic" aria-hidden>🔍</span>
            <input value={gameName} onChange={(e) => onNameChange(e.target.value)} onKeyDown={onNameKeyDown} placeholder="소환사명" aria-label="소환사명" />
            <span className="sr-hash">#</span>
            <input id="sr-tag" className="tag" value={tagLine} onChange={(e) => onTagChange(e.target.value)} placeholder="KR1" aria-label="태그" />
          </div>
          <button type="submit" disabled={loading}>{loading ? "검색 중…" : "검색"}</button>
        </form>
        {error && <div className="sr-error">{error}</div>}
      </section>

      {loading && !data && (
        <div className="sr-skeleton">
          <div className="sk sk-profile" />
          <div className="sk-grid"><div className="sk sk-side" /><div className="sk sk-main" /></div>
        </div>
      )}

      {data && (
        <>
          {/* ── 프로필 ── */}
          <section className="sr-profile">
            <div className="sr-avatar">
              <Img src={data.summoner.profileIcon} size={88} alt="profile" />
              <span className="sr-level">{data.summoner.level}</span>
            </div>
            <div className="sr-id">
              <h2>{data.account.gameName}<span>#{data.account.tagLine}</span></h2>
              <button className="sr-refresh" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? "갱신 중…" : "↻ 전적 갱신"}
              </button>
            </div>
            <div className="sr-ranks">
              <RankBox label="솔로랭크" entry={solo} />
              <RankBox label="자유랭크" entry={flex} />
            </div>
          </section>

          <div className="sr-grid">
            {/* ── 왼쪽: 함께한 소환사 ── */}
            <aside className="sr-side">
              <div className="sr-card">
                <div className="sr-card-head">
                  <h3>함께한 소환사</h3>
                  <span className="sr-basis">
                    최근 {matches.length}판 기준
                    {matches.length > 0 && ` · ${new Date(Math.min(...matches.map((m) => m.createdAt))).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" })}부터`}
                  </span>
                </div>

                {!topMate ? (
                  <p className="sr-empty">2판 이상 함께한 소환사가 없어요.<br />아래 <b>더 보기</b>로 범위를 넓혀보세요.</p>
                ) : (
                  <>
                    {/* 최다 동료 하이라이트 */}
                    <button
                      type="button"
                      className={`sr-best ${mateFilter === topMate.puuid ? "on" : ""}`}
                      onClick={() => setMateFilter(mateFilter === topMate.puuid ? null : topMate.puuid)}
                    >
                      <span className="sr-best-badge">👑 가장 많이 함께함</span>
                      <span className="sr-best-row">
                        <Img src={topMate.icon} size={44} className="sr-best-ic" />
                        <span className="sr-best-name">
                          <b>{topMate.name}</b>
                          <small>#{topMate.tagLine}</small>
                        </span>
                        <span className="sr-best-cnt"><b>{topMate.games}</b>판</span>
                      </span>
                      <span className="sr-best-foot">
                        {topMate.teamGames > 0 && (
                          <>
                            <span>같은팀 {topMate.wins}승 {topMate.teamGames - topMate.wins}패</span>
                            <span className={pct(topMate.wins, topMate.teamGames) >= 60 ? "hi" : pct(topMate.wins, topMate.teamGames) < 40 ? "lo" : ""}>
                              {pct(topMate.wins, topMate.teamGames)}%
                            </span>
                          </>
                        )}
                        {topMate.vsGames > 0 && <span className="vs">상대 {topMate.vsGames}판</span>}
                        <span className="muted">{timeAgo(topMate.lastAt)}</span>
                      </span>
                    </button>

                    {restMates.length > 0 && (
                      <ul className="sr-mates">
                        {restMates.map((mt, i) => {
                          const r = pct(mt.wins, mt.teamGames);
                          return (
                            <li key={mt.puuid} className={mateFilter === mt.puuid ? "on" : ""}>
                              <button type="button" className="sr-mate" onClick={() => setMateFilter(mateFilter === mt.puuid ? null : mt.puuid)} title="이 소환사와 함께한 경기만 보기">
                                <span className="rk">{i + 2}</span>
                                <Img src={mt.icon} size={28} className="ic" />
                                <span className="nm"><b>{mt.name}</b><small>#{mt.tagLine}{mt.vsGames > 0 && <em> · 상대 {mt.vsGames}</em>}</small></span>
                                <span className="gm">
                                  <span className="bar"><i style={{ width: `${(mt.games / maxMateGames) * 100}%` }} /></span>
                                  <b>{mt.games}판</b>
                                </span>
                                <span className={`wr ${mt.teamGames === 0 ? "muted" : r >= 60 ? "hi" : r < 40 ? "lo" : ""}`} title={`같은팀 ${mt.teamGames}판 · 상대 ${mt.vsGames}판`}>{mt.teamGames ? `${r}%` : "-"}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {mates.length > 8 && (
                      <button type="button" className="sr-link" onClick={() => setShowAllMates(!showAllMates)}>
                        {showAllMates ? "접기" : `전체 ${mates.length}명 보기`}
                      </button>
                    )}
                    <p className="sr-hint">이름을 누르면 함께한 경기만 보여요.<br />내전·사설겜은 상대팀도 포함, 승률은 같은 팀일 때 기준</p>
                  </>
                )}
              </div>

              {/* 시즌별 챔피언 (fow.lol 스타일) */}
              <div className="sr-card">
                <div className="sr-card-head">
                  <h3>시즌별 챔피언</h3>
                  <span className="sr-basis">{QUEUE_TABS.find((t) => t.key === queueTab)?.label} · {seasonGames}게임</span>
                </div>
                <div className="sr-season-tabs">
                  {SEASONS.map((s) => (
                    <button key={s.key} type="button" className={s.key === season.key ? "on" : ""}
                      onClick={() => { setSeasonKey(s.key); setShowAllChamps(false); }}>{s.label}</button>
                  ))}
                </div>

                {seasonChamps.length === 0 ? (
                  <p className="sr-empty">이 시즌에 해당하는 전적이 없어요.</p>
                ) : (
                  <ul className="sr-schamps">
                    {shownChamps.map((c) => {
                      const r = pct(c.wins, c.games);
                      const g = c.games;
                      return (
                        <li key={c.champion}>
                          <Img src={c.icon} size={32} />
                          <span className="nm">
                            <b>{c.name}</b>
                            <small>CS {(c.cs / g).toFixed(1)} ({c.sec > 0 ? (c.cs / (c.sec / 60)).toFixed(1) : "0"})</small>
                          </span>
                          <span className="kda">
                            <b className={kdaClass(c.k, c.d, c.a)}>{kdaRatio(c.k, c.d, c.a)}{c.d > 0 && ":1"}</b>
                            <small>{(c.k / g).toFixed(1)} / {(c.d / g).toFixed(1)} / {(c.a / g).toFixed(1)}</small>
                          </span>
                          <span className="rc">
                            <b className={r >= 60 ? "hi" : r < 40 ? "lo" : ""}>{r}%</b>
                            <small>{g}게임</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {seasonChamps.length > 7 && (
                  <button type="button" className="sr-link" onClick={() => setShowAllChamps(!showAllChamps)}>
                    {showAllChamps ? "접기" : `챔피언 ${seasonChamps.length}개 모두 보기`}
                  </button>
                )}

                {seasonLoading ? (
                  <div className="sr-season-load">
                    <span>{seasonLoading}</span>
                    <button type="button" onClick={() => { seasonCancel.current = true; }}>중지</button>
                  </div>
                ) : seasonIncomplete ? (
                  <>
                    <p className="sr-hint">불러온 {matches.length}판 기준이라 시즌 일부만 집계됐어요.</p>
                    <button type="button" className="sr-season-all" onClick={() => loadSeason(season.start)} disabled={loadingMore}>
                      {season.label} 전체 불러오기
                    </button>
                  </>
                ) : (
                  seasonGames > 0 && <p className="sr-hint">{season.label} 전체 집계 · 다시하기 제외</p>
                )}
              </div>
            </aside>

            {/* ── 오른쪽: 요약 + 전적 ── */}
            <div className="sr-main">
              <div className="sr-tabs">
                {QUEUE_TABS.map((t) => (
                  <button key={t.key} type="button" className={queueTab === t.key ? "on" : ""} onClick={() => setQueueTab(t.key)}>{t.label}</button>
                ))}
              </div>

              {selectedMate && (
                <div className="sr-filter-chip">
                  <Img src={selectedMate.icon} size={20} />
                  <span><b>{selectedMate.name}</b> 님과 함께한 경기</span>
                  <button type="button" onClick={() => setMateFilter(null)} aria-label="필터 해제">✕</button>
                </div>
              )}

              {/* 요약 */}
              <div className="sr-summary">
                <div className="sr-ring" style={{ ["--p" as string]: `${wr}` }}>
                  <span>{summary.games ? `${wr}%` : "-"}</span>
                </div>
                <div className="sr-sum-txt">
                  <span className="muted">{summary.games}전 {summary.wins}승 {summary.losses}패</span>
                  <b className={kdaClass(summary.k, summary.d, summary.a)}>
                    {summary.games ? kdaRatio(summary.k, summary.d, summary.a) : "-"} <small>KDA</small>
                  </b>
                  {summary.games > 0 && (
                    <span className="muted">
                      {(summary.k / summary.games).toFixed(1)} / <i className="d">{(summary.d / summary.games).toFixed(1)}</i> / {(summary.a / summary.games).toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="sr-streak">
                  {visible.slice(0, 20).map((m) => (
                    <i key={m.matchId} className={isRemake(m) ? "re" : winLike(m) ? "w" : "l"} title={`${m.queue} · ${isRemake(m) ? "다시하기" : winLike(m) ? "승" : "패"}`} />
                  ))}
                </div>
              </div>

              {/* 전적 목록 */}
              <section className="sr-list">
                {visible.length === 0 && <p className="sr-empty pad">해당하는 전적이 없어요.</p>}
                {visible.map((m) => {
                  const isOpen = expanded === m.matchId;
                  const remake = isRemake(m);
                  const won = winLike(m);
                  const res = remake ? "re" : won ? "win" : "loss";
                  const label = remake ? "다시하기" : m.isArena ? `${m.placement}위` : won ? "승리" : "패배";
                  const blue = m.participants.filter((p) => p.teamId === 100);
                  const red = m.participants.filter((p) => p.teamId === 200);
                  const maxDmg = Math.max(...m.participants.map((p) => p.damage), 1);
                  const me = m.participants.find((p) => p.isMe);
                  const myTeamKills = myTeam(m).reduce((s, p) => s + p.kills, 0);
                  const kp = me ? pct(me.kills + me.assists, myTeamKills) : 0;
                  const csm = m.durationSec > 0 ? (m.cs / (m.durationSec / 60)).toFixed(1) : "0";
                  const withMate = selectedMate && m.participants.find((p) => p.puuid === selectedMate.puuid);

                  return (
                    <article className={`sr-match ${res} ${isOpen ? "open" : ""}`} key={m.matchId}>
                      <div className="sr-mrow" onClick={() => toggleExpand(m)}>
                        <div className="sr-meta">
                          <b className="q">{m.queue}</b>
                          <span className="ago">{timeAgo(m.createdAt)}</span>
                          <span className="sep" />
                          <b className="res">{label}</b>
                          <span className="dur">{duration(m.durationSec)}</span>
                        </div>

                        <div className="sr-me">
                          <div className="sr-me-top">
                            <div className="sr-champ">
                              <Img src={m.championIcon} size={52} alt={m.championKo} />
                              <span className="lv">{m.champLevel}</span>
                            </div>
                            <div className="sr-sr">
                              <div>{m.spells.map((s, i) => <Img key={i} src={s} size={22} />)}</div>
                              <div><Img src={m.runes.keystone} size={22} className="rune" /><Img src={m.runes.secondary} size={22} className="rune sub" /></div>
                            </div>
                            <div className="sr-kda">
                              <span className="n">{m.kills} / <i>{m.deaths}</i> / {m.assists}</span>
                              <span className={`r ${kdaClass(m.kills, m.deaths, m.assists)}`}>{kdaRatio(m.kills, m.deaths, m.assists)}:1 평점</span>
                            </div>
                            <div className="sr-stat">
                              {!m.isArena && <span>킬관여 <b>{kp}%</b></span>}
                              <span>CS <b>{m.cs}</b> ({csm})</span>
                              {withMate && <span className="with">🤝 {withMate.championKo}</span>}
                            </div>
                          </div>
                          <Items icons={m.items} />
                        </div>

                        {!m.isArena && (
                          <div className="sr-teams" onClick={(e) => e.stopPropagation()}>
                            {[blue, red].map((team, ti) => (
                              <div className="col" key={ti}>
                                {team.slice(0, 5).map((p) => (
                                  <button type="button" key={p.puuid}
                                    className={`${p.isMe ? "me" : ""} ${selectedMate?.puuid === p.puuid ? "mate" : ""}`}
                                    onClick={() => p.tagLine && searchAccount(p.name, p.tagLine)} title={`${p.name}#${p.tagLine}`}>
                                    <Img src={p.championIcon} size={18} />
                                    <span>{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        <span className="sr-caret" aria-hidden>▾</span>
                      </div>

                      {isOpen && (
                        <div className="sr-detail">
                          {(m.isArena ? arenaSubteams(m.participants) : [blue, red]).map((team, i) => {
                            const tWin = m.isArena ? false : team[0]?.win;
                            const tMax = m.isArena ? Math.max(...team.map((p) => p.damage), 1) : maxDmg;
                            const tk = team.reduce((s, p) => s + p.kills, 0);
                            return (
                              <div key={i} className={`sr-dteam ${m.isArena ? (team.some((p) => p.isMe) ? "blue" : "gray") : i === 0 ? "blue" : "red"}`}>
                                <div className="sr-dhead">
                                  {m.isArena
                                    ? <b>{team[0]?.placement ?? i + 1}위</b>
                                    : <b className={tWin ? "w" : "l"}>{tWin ? "승리" : "패배"}</b>}
                                  {!m.isArena && <span>{i === 0 ? "블루팀" : "레드팀"} · {tk}킬</span>}
                                  <span className="cols"><span>KDA</span><span>피해량</span><span>CS</span><span>아이템</span></span>
                                </div>
                                {team.map((p) => (
                                  <DetailRow key={p.puuid} p={p} maxDmg={tMax} tier={tiers[p.puuid]} onSelect={searchAccount} />
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              {notice && <div className="sr-notice">{notice}</div>}
              {!hasMore && matches.length > 0 && <p className="sr-end">불러올 수 있는 전적을 모두 불러왔어요. (최근 2년까지)</p>}
              {hasMore && (
                <button type="button" className="sr-more" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "불러오는 중…" : `더 보기 (+${PAGE}판)`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
