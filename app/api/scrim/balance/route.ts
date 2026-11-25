import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const LINES = ["TOP", "JG", "MID", "ADC", "SUP"];

// 점수 2배 개편에 맞춘 보정값 (주라인이 아닌 곳에 배정될 때 적용)
const LINE_PENALTY_ALL = -300;     // ALL(부라인 ALL/미지정 또는 ALL 버튼)
const LINE_PENALTY_EXCLUDE = -150; // ALL인데 특정 라인 제외 (예: ALL(정글 제외))
const LINE_PENALTY_SUB = -600;     // 명시적 부라인
const TEAM1_BONUS = 100;           // 팀1 합산 균형 보정

// 10명 중 5명을 고르는 모든 조합 (252가지)
function combinations5(n: number): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  (function rec(start: number) {
    if (pick.length === 5) { out.push([...pick]); return; }
    for (let i = start; i < n; i++) { pick.push(i); rec(i + 1); pick.pop(); }
  })(0);
  return out;
}

// 5개 라인의 모든 배치 순서 (120가지)
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}
const LINE_PERMS = permutations(LINES);

type Player = { id: number; name: string; score: number };
type Assigned = Player & { line: string; lineAdjust: number };
// allowed: 배정 가능한 라인, penalty: 주라인이 아닌 곳에 배정될 때의 보정값
type LineInfo = { mainLine: string | null; allowed: Set<string>; penalty: number };

function lineAdjustOf(info: LineInfo | undefined, line: string): number {
  if (!info) return LINE_PENALTY_ALL;
  return info.mainLine === line ? 0 : info.penalty;
}

// 팀 5명에게 라인을 배정한다.
// 120가지 배치를 모두 따져서, 배정 가능한 것 중 보정값(감점) 합이 가장 작은 배치를 고른다.
// → 주라인이 비어 있으면 주라인을 우선 받게 됨. 배정 불가능하면 null.
function assignLines(team: Player[], infoMap: Map<number, LineInfo>): Assigned[] | null {
  let best: string[] | null = null;
  let bestAdj = -Infinity;
  for (const perm of LINE_PERMS) {
    let adj = 0, ok = true;
    for (let i = 0; i < team.length; i++) {
      const info = infoMap.get(team[i].id);
      if (info && !info.allowed.has(perm[i])) { ok = false; break; }
      adj += lineAdjustOf(info, perm[i]);
    }
    if (ok && adj > bestAdj) { bestAdj = adj; best = perm; }
  }
  if (!best) return null;
  return team.map((p, i) => ({ ...p, line: best![i], lineAdjust: lineAdjustOf(infoMap.get(p.id), best![i]) }));
}

function teamEffectiveSum(team: Player[], infoMap: Map<number, LineInfo>): number | null {
  const assigned = assignLines(team, infoMap);
  if (!assigned) return null;
  return assigned.reduce((s, p) => s + p.score + p.lineAdjust, 0);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { allowScrimOnly: true });
  if (!auth.ok) return auth.response;
  try {
    const { memberIds, overrideAll = [], overrideMain = [], overrideExclude = {}, count = 3 }: {
      memberIds: number[]; overrideAll?: number[]; overrideMain?: number[];
      overrideExclude?: Record<string, string[]>; // { 회원id: ["JG"] } → ALL(정글 제외), 1개만 사용
      count?: number;
    } = await req.json();
    if (!Array.isArray(memberIds) || memberIds.length !== 10)
      return NextResponse.json({ error: "클랜원 10명을 선택하세요." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();

    const [memberRows] = await pool.query(
      `SELECT m.id, m.nickname, m.main_line, m.sub_line, COALESCE(sr.mmr, 0) AS scrim_mmr
       FROM members m LEFT JOIN scrim_ratings sr ON sr.member_id = m.id
       WHERE m.id IN (?)`,
      [memberIds]
    ) as [any[], any];

    function buildInfoMap(useOverride: boolean): Map<number, LineInfo & { nickname: string }> {
      return new Map(
        memberRows.map((m: any) => {
          const main = m.main_line ? String(m.main_line).toUpperCase() : null;
          const sub = m.sub_line ? String(m.sub_line).toUpperCase() : null;
          const excluded = useOverride
            ? (overrideExclude[String(m.id)] ?? []).map((l) => String(l).toUpperCase()).filter((l) => LINES.includes(l)).slice(0, 1) // 제외 라인은 1개만
            : [];
          let allowed: Set<string>;
          let penalty: number;
          if (useOverride && overrideMain.includes(m.id) && main) {
            // 주라인 고정: 주라인만 배정 가능
            allowed = new Set([main]); penalty = 0;
          } else if (excluded.length > 0) {
            // ALL(특정 라인 제외): 제외한 라인 말고는 어디든 가능, 비주라인 -150
            allowed = new Set(LINES.filter((l) => !excluded.includes(l))); penalty = LINE_PENALTY_EXCLUDE;
          } else if ((useOverride && (overrideAll.includes(m.id) || overrideMain.includes(m.id))) || !sub || sub === "ALL") {
            // (주라인 고정인데 주라인 정보가 없는 경우도 기존처럼 ALL 취급)
            // ALL: 어디든 가능, 비주라인 -300
            allowed = new Set(LINES); penalty = LINE_PENALTY_ALL;
          } else {
            // 주/부라인: 둘 중 하나만 가능, 부라인 -600
            allowed = new Set([main, sub].filter((l): l is string => !!l && LINES.includes(l))); penalty = LINE_PENALTY_SUB;
          }
          return [m.id as number, { nickname: m.nickname as string, mainLine: main, allowed, penalty }];
        })
      );
    }

    const LINE_KO: Record<string, string> = { TOP: "탑", JG: "정글", MID: "미드", ADC: "원딜", SUP: "서폿" };

    // 라인 커버 검증은 overrideAll 포함 기준으로 (최대 가능 범위)
    const infoMapFull = buildInfoMap(true);
    const lineCoverage = new Map<string, number>();
    for (const [, info] of infoMapFull) {
      info.allowed.forEach((l) => lineCoverage.set(l, (lineCoverage.get(l) ?? 0) + 1));
    }
    const missingLines = LINES.filter((l) => (lineCoverage.get(l) ?? 0) < 2);
    if (missingLines.length > 0)
      return NextResponse.json({ error: `팀 생성 불가능 (${missingLines.map((l) => LINE_KO[l] ?? l).join(", ")} 라인 커버 인원 부족)` }, { status: 400 });

    const balancePlayers: Player[] = memberRows.map((m: any) => ({
      id: m.id as number,
      name: m.nickname as string,
      score: m.scrim_mmr as number,
    }));

    // 가능한 팀 조합(252가지)을 전부 계산해서 두 팀 점수 차이가 작은 순으로 정렬
    // - 같은 10명을 반대로 나눈 경우(블루/레드만 바뀐 것)는 점수차가 더 작은 쪽만 남김
    // - 점수차가 같은 조합끼리는 순서를 무작위로 섞음
    type Cand = { t1: Player[]; t2: Player[]; diff: number; tie: number };
    function runBalance(infoMap: Map<number, LineInfo>): Cand[] {
      const bySplit = new Map<string, Cand>();
      for (const idx of combinations5(balancePlayers.length)) {
        const set = new Set(idx);
        const t1 = balancePlayers.filter((_, i) => set.has(i));
        const t2 = balancePlayers.filter((_, i) => !set.has(i));
        const s1 = teamEffectiveSum(t1, infoMap), s2 = teamEffectiveSum(t2, infoMap);
        if (s1 === null || s2 === null) continue; // 라인 배정 불가 조합 스킵
        const diff = Math.abs((s1 + TEAM1_BONUS) - s2);
        const key = (set.has(0) ? t1 : t2).map((p) => p.id).sort((x, y) => x - y).join(",");
        const prev = bySplit.get(key);
        if (!prev || diff < prev.diff) bySplit.set(key, { t1, t2, diff, tie: Math.random() });
      }
      return [...bySplit.values()].sort((x, y) => x.diff - y.diff || x.tie - y.tie);
    }

    // 1단계: overrideAll/overrideMain 적용해서 시도, 2단계: 안 되면 override 없이 재시도
    let usedOverride = true;
    let infoMap = buildInfoMap(true);
    let cands = runBalance(infoMap);
    if (cands.length === 0) {
      usedOverride = false;
      infoMap = buildInfoMap(false);
      cands = runBalance(infoMap);
    }
    if (cands.length === 0)
      return NextResponse.json({ error: "팀 생성 불가능 (라인 조합을 찾을 수 없습니다)" }, { status: 400 });

    // 최소 점수차 + DIFF_TOLERANCE 이내 조합들 중에서 무작위로 count개 선택 (다시 생성 시 다른 조합이 나오도록)
    // 허용 범위 안의 조합이 count개보다 적으면 점수차 작은 순으로 채움
    const want = Math.max(1, Math.min(10, Number(count) || 3));
    const DIFF_TOLERANCE = 100;
    const limit = cands[0].diff + DIFF_TOLERANCE;
    const inRange = cands.filter((c) => c.diff <= limit);
    let picked: Cand[];
    if (inRange.length <= want) {
      picked = cands.slice(0, want);
    } else {
      const shuffled = [...inRange];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      picked = shuffled.slice(0, want).sort((x, y) => x.diff - y.diff);
    }

    const toResult = (c: Cand) => {
      const team1 = assignLines(c.t1, infoMap)!;
      const team2 = assignLines(c.t2, infoMap)!;
      const sum1 = Math.round((team1.reduce((s, p) => s + p.score + p.lineAdjust, 0) + TEAM1_BONUS) * 10) / 10;
      const sum2 = Math.round(team2.reduce((s, p) => s + p.score + p.lineAdjust, 0) * 10) / 10;
      return { team1, team2, sum1, sum2, diff: Math.round(Math.abs(sum1 - sum2) * 10) / 10, usedOverride };
    };
    const candidates = picked.map(toResult);

    // team1/team2 등 최상위 필드는 선택된 후보 중 점수차가 가장 작은 조합 (기존 호출부 호환)
    return NextResponse.json({ ...candidates[0], candidates });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "팀 생성 실패" }, { status: 500 });
  }
}
