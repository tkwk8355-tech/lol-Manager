// 내전 점수 계산 로직 (서버/클라이언트 공용)
// 내전 점수 = 티어 기본점수 + 승패 보정
// - 티어 기본점수: 본계정 솔랭 최고 티어 환산
// - 승패 보정: 2판 이상일 때 (승-패) × 1점, 상한 ±6

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
// 챌/그마 또는 마스터 200LP+ → 25
// 마스터 0~199LP → 20
// 다이아 1~2 → 15, 다이아 3~4 → 10
// 에메랄드 → 6, 플래티넘 → 4
// 골드/실버/브론즈/아이언 → 2
// 언랭 → 0
export function tierBaseScore(tier?: string | null, rank?: string | null, lp?: number | null): number {
  const t = (tier || "").toUpperCase();
  switch (t) {
    case "CHALLENGER":
    case "GRANDMASTER":
      return 25;
    case "MASTER":
      return (lp ?? 0) >= 200 ? 25 : 20;
    case "DIAMOND": {
      const r = (rank || "").toUpperCase();
      return r === "I" || r === "II" ? 15 : 10;
    }
    case "EMERALD":
      return 6;
    case "PLATINUM":
      return 4;
    case "GOLD":
    case "SILVER":
    case "BRONZE":
    case "IRON":
      return 2;
    default:
      return 0;
  }
}

// 승패 보정 설정
export const MIN_GAMES_FOR_ADJUST = 2; // 보정 최소 판수
export const WIN_POINTS = 1; // 승 1판당 +1
export const LOSS_POINTS = 1; // 패 1판당 -1
export const ADJUST_CAP = 6; // 보정 상한

// 승패 보정 계산: clamp((승-패) × 1, -6, +6)
export function winLossAdjust(wins: number, losses: number): number {
  const raw = wins * WIN_POINTS - losses * LOSS_POINTS;
  return Math.max(-ADJUST_CAP, Math.min(ADJUST_CAP, raw));
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

// 기본점수 + 경기 목록 → 모드 집계 (2판 이상일 때만 보정 적용)
export function computeModeStats(baseScore: number, games: ScrimGameLine[]): ModeStats {
  let wins = 0;
  let k = 0;
  let d = 0;
  let a = 0;
  for (const g of games) {
    if (g.win) wins++;
    k += g.kills;
    d += g.deaths;
    a += g.assists;
  }
  const n = games.length;
  const losses = n - wins;
  const winrate = n ? (wins / n) * 100 : 0;
  const kda = (k + a) / Math.max(d, 1);
  const qualified = n >= MIN_GAMES_FOR_ADJUST;
  const adjust = qualified ? winLossAdjust(wins, losses) : 0;
  return {
    games: n,
    wins,
    losses,
    winrate: Math.round(winrate),
    kda: round1(kda),
    baseScore: round1(baseScore),
    adjust,
    qualified,
    score: round1(baseScore + adjust),
  };
}

// 팀 생성기
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
