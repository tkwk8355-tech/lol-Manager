import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { tierBaseScore, higherTier, computeModeStats, type ScrimGameLine, type TierInfo } from "@/lib/scrim";

// GET 핸들러가 request 객체를 받지 않으면 Next.js가 프로덕션 빌드에서
// 이 응답을 정적으로 캐싱해버려, DB가 바뀌어도 계속 옛 데이터를 반환하는
// 문제가 있었다. 매 요청마다 새로 실행되도록 강제한다.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const pool = getPool();

    const [members] = await pool.query("SELECT id, nickname FROM members ORDER BY nickname ASC") as [any[], any];

    const [accTiers] = await pool.query(
      `SELECT member_id, is_main, solo_tier, solo_rank, solo_lp
       FROM accounts ORDER BY is_main DESC, id ASC`
    ) as [any[], any];

    const tierByMember = new Map<number, TierInfo | null>();
    const mainSeen = new Set<number>();
    for (const a of accTiers) {
      const cur: TierInfo | null = a.solo_tier
        ? { tier: a.solo_tier, rank: a.solo_rank || "I", lp: a.solo_lp || 0 }
        : null;
      if (a.is_main && !mainSeen.has(a.member_id)) {
        mainSeen.add(a.member_id);
        tierByMember.set(a.member_id, cur);
        continue;
      }
      if (mainSeen.has(a.member_id)) continue;
      tierByMember.set(a.member_id, higherTier(tierByMember.get(a.member_id) ?? null, cur));
    }

    const [parts] = await pool.query(
      `SELECT p.member_id, m.mode, p.team, m.winner_team,
              p.kills, p.deaths, p.assists
       FROM scrim_participants p
       JOIN scrim_matches m ON m.id = p.match_id
       WHERE m.status = 'done'`
    ) as [any[], any];

    const gamesByMember = new Map<number, { aram: ScrimGameLine[]; rift: ScrimGameLine[] }>();
    for (const p of parts) {
      if (!gamesByMember.has(p.member_id)) gamesByMember.set(p.member_id, { aram: [], rift: [] });
      const bucket = gamesByMember.get(p.member_id)!;
      const line: ScrimGameLine = { win: p.team === p.winner_team, kills: p.kills, deaths: p.deaths, assists: p.assists };
      if (p.mode === "aram") bucket.aram.push(line);
      else if (p.mode === "rift") bucket.rift.push(line);
    }

    const players = members.map((m) => {
      const t = tierByMember.get(m.id) ?? null;
      const base = tierBaseScore(t?.tier, t?.rank, t?.lp);
      const g = gamesByMember.get(m.id) ?? { aram: [], rift: [] };
      return {
        memberId: m.id,
        nickname: m.nickname,
        tier: t?.tier ?? null,
        rank: t?.rank ?? null,
        lp: t?.lp ?? 0,
        baseScore: Math.round(base * 10) / 10,
        aram: computeModeStats(base, g.aram),
        rift: computeModeStats(base, g.rift),
      };
    });

    return NextResponse.json({ players });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "내전 명단 조회 실패" }, { status: 500 });
  }
}
