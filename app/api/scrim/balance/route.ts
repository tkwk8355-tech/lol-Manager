import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

const LINES = ["TOP", "JG", "MID", "ADC", "SUP"];

type Player = { id: number; name: string; score: number };
type Assigned = Player & { line: string; lineAdjust: number };
type LineInfo = { mainLine: string | null; subLine: string | null; originalSubLine: string | null };

function assignLines(
  team: Player[],
  infoMap: Map<number, LineInfo>
): Assigned[] | null {
  // originalSubLine이 ALL이거나 null인 사람 = 어느 라인이든 가능
  // fixed = 주/부라인이 명시적으로 지정된 사람
  const isAll = (p: Player) => { const s = infoMap.get(p.id)?.originalSubLine?.toUpperCase(); return !s || s === "ALL"; };
  const fixedPlayers = team.filter((p) => !isAll(p));
  const allPlayers   = team.filter((p) => isAll(p));

  const assignment = new Map<number, string>();
  const usedLines  = new Set<string>();

  function canTake(id: number, line: string) {
    const info = infoMap.get(id);
    const main = info?.mainLine?.toUpperCase();
    const sub  = info?.originalSubLine?.toUpperCase();
    return main === line || (sub && sub !== "ALL" && sub === line);
  }

  function backtrack(idx: number): boolean {
    if (idx === fixedPlayers.length) return true;
    const p = fixedPlayers[idx];
    for (const line of LINES) {
      if (usedLines.has(line)) continue;
      if (!canTake(p.id, line)) continue;
      usedLines.add(line); assignment.set(p.id, line);
      if (backtrack(idx + 1)) return true;
      usedLines.delete(line); assignment.delete(p.id);
    }
    return false;
  }

  backtrack(0);

  // fixedPlayers 중 배정 못 받은 사람이 있으면 이 팀 조합은 불가
  const unmatched = fixedPlayers.filter((p) => !assignment.has(p.id));
  if (unmatched.length > 0) return null;

  function calcLineAdjust(p: Player, assignedLine: string): number {
    const info = infoMap.get(p.id);
    const main = info?.mainLine?.toUpperCase();
    const origSub = info?.originalSubLine?.toUpperCase();
    if (main === assignedLine) return 0;
    // 비주라인 배정: 부라인이 ALL(또는 null)이면 -150, 명시적 부라인이면 -300
    return (!origSub || origSub === "ALL") ? -150 : -300;
  }

  const result: Assigned[] = [];
  for (const p of fixedPlayers) {
    const line = assignment.get(p.id)!;
    result.push({ ...p, line, lineAdjust: calcLineAdjust(p, line) });
  }

  const takenLines = new Set(assignment.values());
  const remainingLines = LINES.filter((l) => !takenLines.has(l));
  for (let i = 0; i < remainingLines.length && i < allPlayers.length; i++) {
    const p = allPlayers[i];
    const assignedLine = remainingLines[i];
    result.push({ ...p, line: assignedLine, lineAdjust: calcLineAdjust(p, assignedLine) });
  }

  return result;
}

function teamEffectiveSum(team: Player[], infoMap: Map<number, LineInfo>): number | null {
  const assigned = assignLines(team, infoMap);
  if (!assigned) return null;
  return assigned.reduce((s, p) => s + p.score + p.lineAdjust, 0);
}

export async function POST(req: NextRequest) {
  try {
    const { memberIds, overrideAll = [] }: { memberIds: number[]; overrideAll?: number[] } = await req.json();
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
          const originalSubLine = m.sub_line ?? null;
          const isOverride = useOverride && overrideAll.includes(m.id);
          const effectiveSub = isOverride ? "ALL" : originalSubLine;
          return [m.id as number, {
            nickname: m.nickname as string,
            mainLine: m.main_line ?? null,
            subLine: effectiveSub,
            originalSubLine: effectiveSub,
          }];
        })
      );
    }

    const LINE_KO: Record<string, string> = { TOP: "탑", JG: "정글", MID: "미드", ADC: "원딜", SUP: "서폿" };

    // 라인 커버 검증은 overrideAll 포함 기준으로 (최대 가능 범위)
    const infoMapFull = buildInfoMap(true);
    const lineCoverage = new Map<string, number>();
    for (const [, info] of infoMapFull) {
      const main = info.mainLine?.toUpperCase();
      const orig = info.originalSubLine?.toUpperCase();
      if (main && LINES.includes(main)) lineCoverage.set(main, (lineCoverage.get(main) ?? 0) + 1);
      if (orig === "ALL") LINES.forEach((l) => lineCoverage.set(l, (lineCoverage.get(l) ?? 0) + 1));
      else if (orig && LINES.includes(orig) && orig !== main) lineCoverage.set(orig, (lineCoverage.get(orig) ?? 0) + 1);
    }
    const missingLines = LINES.filter((l) => (lineCoverage.get(l) ?? 0) < 2);
    if (missingLines.length > 0)
      return NextResponse.json({ error: `팀 생성 불가능 (${missingLines.map((l) => LINE_KO[l] ?? l).join(", ")} 라인 커버 인원 부족)` }, { status: 400 });

    const balancePlayers: Player[] = memberRows.map((m: any) => ({
      id: m.id as number,
      name: m.nickname as string,
      score: m.scrim_mmr as number,
    }));

    function runBalance(infoMap: Map<number, LineInfo>) {
      const half = 5, iterations = 10000, tolerance = 200;
      let best: { t1: typeof balancePlayers; t2: typeof balancePlayers; diff: number } | null = null;
      const acceptable: { t1: typeof balancePlayers; t2: typeof balancePlayers; diff: number }[] = [];
      for (let i = 0; i < iterations; i++) {
        const arr = [...balancePlayers];
        for (let j = arr.length - 1; j > 0; j--) {
          const m = Math.floor(Math.random() * (j + 1));
          [arr[j], arr[m]] = [arr[m], arr[j]];
        }
        const t1 = arr.slice(0, half), t2 = arr.slice(half);
        const s1 = teamEffectiveSum(t1, infoMap), s2 = teamEffectiveSum(t2, infoMap);
        if (s1 === null || s2 === null) continue; // 라인 배정 불가 조합 스킵
        const diff = Math.abs(s1 - s2);
        if (!best || diff < best.diff) best = { t1, t2, diff };
        if (diff <= tolerance && acceptable.length < 300) acceptable.push({ t1, t2, diff });
      }
      return acceptable.length > 0 ? acceptable[Math.floor(Math.random() * acceptable.length)] : best;
    }

    // 1단계: overrideAll 없이 원래 주/부라인으로 시도
    const infoMap1 = buildInfoMap(false);
    let chosen = runBalance(infoMap1);
    let usedOverride = false;

    // 2단계: 안 되면 overrideAll 적용해서 재시도
    if (!chosen && overrideAll.length > 0) {
      const infoMap2 = buildInfoMap(true);
      chosen = runBalance(infoMap2);
      if (chosen) usedOverride = true;
    }

    if (!chosen)
      return NextResponse.json({ error: "팀 생성 불가능 (라인 조합을 찾을 수 없습니다)" }, { status: 400 });

    const finalInfoMap = buildInfoMap(usedOverride);
    const team1 = assignLines(chosen.t1, finalInfoMap);
    const team2 = assignLines(chosen.t2, finalInfoMap);
    if (!team1 || !team2)
      return NextResponse.json({ error: "팀 생성 불가능 (라인 조합을 찾을 수 없습니다)" }, { status: 400 });
    const sum1 = Math.round(team1.reduce((s, p) => s + p.score + p.lineAdjust, 0) * 10) / 10;
    const sum2 = Math.round(team2.reduce((s, p) => s + p.score + p.lineAdjust, 0) * 10) / 10;

    return NextResponse.json({ team1, team2, sum1, sum2, diff: Math.round(Math.abs(sum1 - sum2) * 10) / 10, usedOverride });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "팀 생성 실패" }, { status: 500 });
  }
}
