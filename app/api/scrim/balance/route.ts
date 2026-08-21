import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { tierBaseScore, winRateAdjust, generateTeams } from "@/lib/scrim";

export const dynamic = "force-dynamic";

const LINES = ["TOP", "JG", "MID", "ADC", "SUP"];

function assignLines(
  team: { id: number; name: string; score: number }[],
  infoMap: Map<number, { mainLine: string | null; subLine: string | null }>
) {
  const available = [...LINES];
  const result: { id: number; name: string; score: number; line: string; lineAdjust: number }[] = [];
  const remaining = [...team];

  // 1pass: 주라인
  for (const line of [...LINES]) {
    if (!available.includes(line)) continue;
    const idx = remaining.findIndex((p) => infoMap.get(p.id)?.mainLine?.toUpperCase() === line);
    if (idx !== -1) {
      const p = remaining.splice(idx, 1)[0];
      result.push({ ...p, line, lineAdjust: 0 });
      available.splice(available.indexOf(line), 1);
    }
  }
  // 2pass: 부라인
  for (const line of [...available]) {
    const idx = remaining.findIndex((p) => infoMap.get(p.id)?.subLine?.toUpperCase() === line);
    if (idx !== -1) {
      const p = remaining.splice(idx, 1)[0];
      result.push({ ...p, line, lineAdjust: -5 });
      available.splice(available.indexOf(line), 1);
    }
  }
  // 3pass: 나머지
  for (const p of remaining) {
    const line = available.shift()!;
    result.push({ ...p, line, lineAdjust: -10 });
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const { memberIds }: { memberIds: number[] } = await req.json();
    if (!Array.isArray(memberIds) || memberIds.length !== 10)
      return NextResponse.json({ error: "클랜원 10명을 선택하세요." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();

    const [accRows] = await pool.query(
      `SELECT member_id, is_main, solo_tier, solo_lp FROM accounts WHERE member_id IN (?) ORDER BY is_main DESC, id ASC`,
      [memberIds]
    ) as [any[], any];

    const tierMap = new Map<number, { tier: string | null; lp: number }>();
    const mainSeen = new Set<number>();
    for (const a of accRows) {
      if (a.is_main && !mainSeen.has(a.member_id)) {
        mainSeen.add(a.member_id);
        tierMap.set(a.member_id, { tier: a.solo_tier ?? null, lp: a.solo_lp ?? 0 });
        continue;
      }
      if (mainSeen.has(a.member_id)) continue;
      if (!tierMap.has(a.member_id))
        tierMap.set(a.member_id, { tier: a.solo_tier ?? null, lp: a.solo_lp ?? 0 });
    }

    const [partRows] = await pool.query(
      `SELECT p.member_id, IF(m.winner_team > 0 AND p.team = m.winner_team, 1, 0) AS win
       FROM scrim_participants p JOIN scrim_matches m ON m.id = p.match_id
       WHERE m.status = 'done' AND p.member_id IN (?)`,
      [memberIds]
    ) as [any[], any];

    const winMap = new Map<number, { wins: number; games: number }>();
    for (const r of partRows) {
      const cur = winMap.get(r.member_id) ?? { wins: 0, games: 0 };
      cur.games++;
      if (r.win === 1) cur.wins++;
      winMap.set(r.member_id, cur);
    }

    const [memberRows] = await pool.query(
      `SELECT id, nickname, main_line, sub_line FROM members WHERE id IN (?)`,
      [memberIds]
    ) as [any[], any];

    const infoMap = new Map<number, { nickname: string; mainLine: string | null; subLine: string | null }>(
      memberRows.map((m: any) => [m.id, { nickname: m.nickname, mainLine: m.main_line ?? null, subLine: m.sub_line ?? null }])
    );

    const balancePlayers = memberIds.map((id) => {
      const t = tierMap.get(id) ?? { tier: null, lp: 0 };
      const w = winMap.get(id) ?? { wins: 0, games: 0 };
      const info = infoMap.get(id) ?? { nickname: String(id), mainLine: null, subLine: null };
      return {
        id,
        name: info.nickname,
        score: tierBaseScore(t.tier, t.lp) + winRateAdjust(w.wins, w.games),
      };
    });

    const result = generateTeams(balancePlayers, { tolerance: 5, iterations: 10000 });
    if (!result) return NextResponse.json({ error: "팀 생성 실패" }, { status: 500 });

    const team1 = assignLines(result.team1, infoMap);
    const team2 = assignLines(result.team2, infoMap);
    const sum1 = Math.round(team1.reduce((s, p) => s + p.score + p.lineAdjust, 0) * 10) / 10;
    const sum2 = Math.round(team2.reduce((s, p) => s + p.score + p.lineAdjust, 0) * 10) / 10;

    return NextResponse.json({ team1, team2, sum1, sum2, diff: Math.round(Math.abs(sum1 - sum2) * 10) / 10 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "팀 생성 실패" }, { status: 500 });
  }
}
