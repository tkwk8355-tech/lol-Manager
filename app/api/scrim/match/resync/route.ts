import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { givePoints } from "@/lib/points";
import { pickMvpIds, MvpParticipant } from "@/lib/scrim";

// POST /api/scrim/match/resync
// 기존 동기화 경기 중 MVP 포인트(scrim_mvp)가 아직 지급되지 않은 경기에 소급 지급
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    await ensureSchema();
    const pool = getPool();

    // MVP 포인트가 없는 완료된 경기만 대상
    const [matches] = await pool.query(
      `SELECT sm.id, sm.winner_team, sm.played_at
       FROM scrim_matches sm
       WHERE sm.status = 'done'
         AND NOT EXISTS (
           SELECT 1 FROM point_logs pl
           WHERE pl.ref_id = sm.id AND pl.ref_table = 'scrim_match' AND pl.type = 'scrim_mvp'
         )`
    ) as [any[], any];

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "소급할 경기가 없습니다." });
    }

    const matchIds = matches.map((m: any) => m.id);
    const ph = matchIds.map(() => "?").join(",");
    const [parts] = await pool.query(
      `SELECT match_id, member_id, team, line, kills, deaths, assists, damage, vision_score
       FROM scrim_participants WHERE match_id IN (${ph})`,
      matchIds
    ) as [any[], any];

    const byMatch = new Map<number, any[]>();
    for (const p of parts) {
      if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, []);
      byMatch.get(p.match_id)!.push(p);
    }

    let updated = 0;
    for (const m of matches) {
      const ps = byMatch.get(m.id) ?? [];
      if (ps.length === 0) continue;

      const participants: MvpParticipant[] = ps.map((p: any) => ({
        memberId: p.member_id, team: p.team, line: p.line,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        damage: p.damage, visionScore: p.vision_score ?? 0,
      }));

      const { mvp1, mvp2 } = pickMvpIds(participants, m.winner_team);
      const matchTimeLabel = String(m.played_at).slice(5, 16);

      for (const mvpId of [mvp1, mvp2]) {
        if (!mvpId) continue;
        await givePoints(pool, mvpId, 1, "scrim_mvp", 0, `내전 MVP (${matchTimeLabel})`, auth.session.userId, m.id, 0, null, "scrim_match");
      }
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: matches.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "MVP 소급 지급 실패" }, { status: 500 });
  }
}
