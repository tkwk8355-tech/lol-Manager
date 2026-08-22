// 내전 점수 계산 로직 (서버/클라이언트 공용)
// 내전 점수 = 티어 기본점수 + 승패 보정
// - 티어 기본점수: 본계정 솔랭 최고 티어 환산
// - 승패 보정: 2판 이상일 때 (승-패) × 1점, 상한 ±6

// 내전 전용 티어
export const SCRIM_TIERS = ["BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER"] as const;
export type ScrimTier = typeof SCRIM_TIERS[number];

export const SCRIM_TIER_KO: Record<ScrimTier, string> = {
  BRONZE: "브론즈", SILVER: "실버", GOLD: "골드",
  PLATINUM: "플래티넘", EMERALD: "에메랄드", DIAMOND: "다이아", MASTER: "마스터",
};

// 점수 → 내전 티어
export function mmrToScrimTier(mmr: number): ScrimTier {
  if (mmr >= 650) return "MASTER";
  if (mmr >= 550) return "DIAMOND";
  if (mmr >= 450) return "EMERALD";
  if (mmr >= 350) return "PLATINUM";
  if (mmr >= 250) return "GOLD";
  if (mmr >= 150) return "SILVER";
  return "BRONZE";
}

// 솔랭 티어 → 내전 초기 MMR
export function soloBadgeToInitialMmr(tier?: string | null): number {
  switch ((tier ?? "").toUpperCase()) {
    case "SILVER":      return 150;
    case "GOLD":        return 250;
    case "PLATINUM":    return 350;
    case "EMERALD":     return 450;
    case "DIAMOND":
    case "MASTER":
    case "GRANDMASTER":
    case "CHALLENGER":  return 550;
    default:            return 0; // 언랭/아이언/브론즈
  }
}

export interface TierInfo {
  tier: string;
  rank: string;
  lp: number;
}

export const TIER_ORDER = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", 
  "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
] as const;

export const DIVISION_ORDER = ["IV", "III", "II", "I"] as const;

function tierIndex(tier?: string | null): number {
  if (!tier) return -1;
  return TIER_ORDER.indexOf(tier.toUpperCase() as (typeof TIER_ORDER)[number]);
}

function divIndex(rank?: string | null): number {
  return Math.max(
    0,
    DIVISION_ORDER.indexOf((rank || "I").toUpperCase() as (typeof DIVISION_ORDER)[number])
  );
}

// 두 티어 중 더 높은 쪽 반환 (티어 → 단계 → LP 순 비교)
export function higherTier(a: TierInfo | null, b: TierInfo | null): TierInfo | null {
  if (!a) return b;
  if (!b) return a;
  const va = tierIndex(a.tier) * 1e6 + divIndex(a.rank) * 1e4 + (a.lp || 0);
  const vb = tierIndex(b.tier) * 1e6 + divIndex(b.rank) * 1e4 + (b.lp || 0);
  return va >= vb ? a : b;
}

// 티어 → 기본점수
// 언랭/아이언/브론즈=0, 실버=10, 골드=20, 플래=30, 에메=40, 다이아=50
// 마스터 0~299LP=60, 마스터 300LP+=70, 그마/챌=80
export function tierBaseScore(tier?: string | null, lp?: number | null): number {
  switch ((tier ?? "").toUpperCase()) {
    case "SILVER":      return 10;
    case "GOLD":        return 20;
    case "PLATINUM":    return 30;
    case "EMERALD":     return 40;
    case "DIAMOND":     return 50;
    case "MASTER":      return (lp ?? 0) >= 300 ? 70 : 60;
    case "GRANDMASTER":
    case "CHALLENGER":  return 80;
    default:            return 0;
  }
}

// 승률 보정: 50% 기준 5%단위 ±2점, 상한 ±6 (2판 이상일 때만)
export function winRateAdjust(wins: number, games: number): number {
  if (games < 2) return 0;
  const steps = Math.floor(((wins / games) * 100 - 50) / 5);
  return Math.max(-6, Math.min(6, steps * 2));
}

// 라인 보정: 주라인=0, 부라인=-5, 그외=-10
export function lineAdjust(assignedLine: string | null, mainLine: string | null, subLine: string | null): number {
  if (!assignedLine || !mainLine) return 0;
  const a = assignedLine.toUpperCase();
  if (a === mainLine.toUpperCase()) return 0;
  if (subLine && a === subLine.toUpperCase()) return -5;
  return -10;
}

export interface ScrimGameLine {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

export interface ModeStats {
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  kda: number;
  baseScore: number;
  adjust: number;
  qualified: boolean; // 2판 이상 여부
  score: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// 기본점수 + 경기 목록 → 모드 집계
export function computeModeStats(baseScore: number, games: ScrimGameLine[]): ModeStats {
  let wins = 0;
  let k = 0, d = 0, a = 0;
  for (const g of games) {
    if (g.win) wins++;
    k += g.kills; d += g.deaths; a += g.assists;
  }
  const n = games.length;
  const winrate = n ? (wins / n) * 100 : 0;
  const kda = (k + a) / Math.max(d, 1);
  const adjust = winRateAdjust(wins, n);
  return {
    games: n, wins, losses: n - wins,
    winrate: Math.round(winrate),
    kda: round1(kda),
    baseScore: round1(baseScore),
    adjust, qualified: n >= 2,
    score: round1(baseScore + adjust),
  };
}

// MVP 계산 (라인 구분 없이 단일 가중치 사용)
// KDA=0.25, 딜=0.40, CS=0.05, KP=0.30
const MVP_W_KDA = 0.25;
const MVP_W_DMG = 0.40;
const MVP_W_CS  = 0.05;
const MVP_W_KP  = 0.30;

export interface MvpParticipant {
  memberId: number;
  team: number;
  line: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  cs?: number;
}

function calcMvpScore(p: MvpParticipant, team: MvpParticipant[], isWin: boolean): number {
  const kda = (p.kills + p.assists) / Math.max(p.deaths, 1);
  const maxKda = Math.max(...team.map((x) => (x.kills + x.assists) / Math.max(x.deaths, 1)), 1);
  const maxDmg = Math.max(...team.map((x) => x.damage), 1);
  const maxCs  = Math.max(...team.map((x) => x.cs ?? 0), 1);
  const teamKills = Math.max(team.reduce((s, x) => s + x.kills, 0), 1);
  const kp = (p.kills + p.assists) / teamKills;
  return (kda / maxKda) * MVP_W_KDA
       + (p.damage / maxDmg) * MVP_W_DMG
       + ((p.cs ?? 0) / maxCs) * MVP_W_CS
       + kp * MVP_W_KP;
}

// MMR 변동: 팀 내 순위(1~5) → +10/+5/0/-5/-10
export const SCRIM_MMR_DELTA = [10, 5, 0, -5, -10] as const;

// 팀별 MVP 점수 계산 후 순위 순으로 정렬된 { memberId, delta } 배열 반환
export function calcMmrDeltas(
  participants: MvpParticipant[],
  winnerTeam: number
): { memberId: number; delta: number }[] {
  const result: { memberId: number; delta: number }[] = [];
  for (const teamNum of [1, 2]) {
    const team = participants.filter((p) => p.team === teamNum);
    if (team.length === 0) continue;
    const isWin = winnerTeam === teamNum;
    const scored = team
      .map((p) => ({ memberId: p.memberId, score: calcMvpScore(p, team, isWin) }))
      .sort((a, b) => b.score - a.score);
    scored.forEach((p, i) => {
      result.push({ memberId: p.memberId, delta: SCRIM_MMR_DELTA[Math.min(i, 4)] });
    });
  }
  return result;
}

// 팀 참가자 목록과 승리팀 번호를 받아 각 팀의 MVP memberId를 반환
export function pickMvpIds(participants: MvpParticipant[], winnerTeam: number): { mvp1: number | null; mvp2: number | null } {
  const t1 = participants.filter((p) => p.team === 1);
  const t2 = participants.filter((p) => p.team === 2);
  const pick = (team: MvpParticipant[], isWin: boolean) => {
    if (team.length === 0) return null;
    return team.reduce((best, p) =>
      calcMvpScore(p, team, isWin) >= calcMvpScore(best, team, isWin) ? p : best
    ).memberId;
  };
  return { mvp1: pick(t1, winnerTeam === 1), mvp2: pick(t2, winnerTeam === 2) };
}
export interface BalancePlayer {
  id: number;
  name: string;
  score: number;
  line?: string; // 협곡 라인 (TOP/JG/MID/ADC/SUP)
}

export interface BalanceResult {
  team1: BalancePlayer[];
  team2: BalancePlayer[];
  sum1: number;
  sum2: number;
  avg1: number;
  avg2: number;
  diff: number;
  linesOk: boolean; // 라인 제약 만족 여부 (협곡)
}

interface GenerateOptions {
  tolerance?: number; // 허용 평균차 (기본 3)
  iterations?: number; // 셔플 시도 횟수 (기본 5000)
  distinctLines?: boolean; // 각 팀 내 라인 중복 금지 (협곡)
}

function stats(players: BalancePlayer[]): { sum: number; avg: number } {
  const sum = players.reduce((s, p) => s + p.score, 0);
  return { sum, avg: players.length ? sum / players.length : 0 };
}

// 한 팀 안에 같은 라인(빈 값 제외)이 중복되면 false
function teamLinesDistinct(team: BalancePlayer[]): boolean {
  const seen = new Set<string>();
  for (const p of team) {
    const l = p.line;
    if (!l) continue;
    if (seen.has(l)) return false;
    seen.add(l);
  }
  return true;
}

// 선수들을 두 팀으로 무작위 섞되 평균 점수가 비슷하게 나눔
// - 무작위 셔플을 여러 번 시도해 평균 차가 tolerance 이하인 조합 수집
// - 라인 제약(distinctLines)이 있으면 각 팀 내 라인 중복 금지
// - 유효 조합 중 하나를 무작위로 반환
export function generateTeams(
  players: BalancePlayer[],
  opts: GenerateOptions = {}
): BalanceResult | null {
  const { tolerance = 3, iterations = 5000, distinctLines = false } = opts;
  if (players.length < 2) return null;
  const half = Math.ceil(players.length / 2);

  const makeResult = (t1: BalancePlayer[], t2: BalancePlayer[]): BalanceResult => {
    const s1 = stats(t1);
    const s2 = stats(t2);
    const linesOk = !distinctLines || (teamLinesDistinct(t1) && teamLinesDistinct(t2));
    return {
      team1: t1,
      team2: t2,
      sum1: round1(s1.sum),
      sum2: round1(s2.sum),
      avg1: round1(s1.avg),
      avg2: round1(s2.avg),
      diff: round1(Math.abs(s1.avg - s2.avg)),
      linesOk,
    };
  };

  const acceptable: BalanceResult[] = [];
  let best: BalanceResult | null = null;

  for (let i = 0; i < iterations; i++) {
    const arr = [...players];
    for (let j = arr.length - 1; j > 0; j--) {
      const m = Math.floor(Math.random() * (j + 1));
      [arr[j], arr[m]] = [arr[m], arr[j]];
    }
    const res = makeResult(arr.slice(0, half), arr.slice(half));
    if (!best || res.diff < best.diff) best = res;
    if (res.linesOk && res.diff <= tolerance && acceptable.length < 300) {
      acceptable.push(res);
    }
  }

  if (acceptable.length > 0) {
    return acceptable[Math.floor(Math.random() * acceptable.length)];
  }
  return best;
}
