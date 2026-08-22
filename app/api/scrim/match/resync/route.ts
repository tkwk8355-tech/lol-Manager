import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { pickMvpIds, MvpParticipant } from "@/lib/scrim";

// POST /api/scrim/match/resync
// 완료된 경기 중 is_mvp 미설정 경기에 MVP 플래그 및 MMR 소급 적용
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    await ensureSchema();
    const pool = getPool();

    // is_mvp 미설정 경기만 대상
    const [matches] = await pool.query(
      `SELECT sm.id, sm.winner_team, sm.played_at
       FROM scrim_matches sm
       WHERE sm.status = 'done'
         AND NOT EXISTS (
           SELECT 1 FROM scrim_participants sp
           WHERE sp.match_id = sm.id AND sp.is_mvp = 1
         )`
    ) as [any[], any];

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "소급할 경기가 없습니다." });
    }

    const matchIds = matches.map((m: any) => m.id);
    const ph = matchIds.map(() => "?").join(",");
    const [parts] = await pool.query(
      `SELECT match_id, member_id, team, line, kills, deaths, assists, damage, cs
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
        damage: p.damage, cs: p.cs ?? 0,
      }));

      const { mvp1, mvp2 } = pickMvpIds(participants, m.winner_team);

      // is_mvp 플래그 업데이트
      for (const mvpId of [mvp1, mvp2]) {
        if (!mvpId) continue;
        await pool.query(
          `UPDATE scrim_participants SET is_mvp = 1 WHERE match_id = ? AND member_id = ?`,
          [m.id, mvpId]
        );
      }

      // MMR 업데이트
      for (const p of participants) {
        const isWin = p.team === m.winner_team;
        const isMvp = p.memberId === mvp1 || p.memberId === mvp2;
        const delta = isWin ? (isMvp ? 20 : 10) : (isMvp ? 0 : -10);
        await pool.query(
          `UPDATE scrim_ratings SET mmr = GREATEST(0, mmr + ?), updated_at = NOW() WHERE member_id = ?`,
          [delta, p.memberId]
        );
        const [ratingRows] = await pool.query(
          `SELECT mmr FROM scrim_ratings WHERE member_id = ?`, [p.memberId]
        ) as [any[], any];
        const mmrAfter = ratingRows[0]?.mmr ?? 0;
        await pool.query(
          `INSERT IGNORE INTO scrim_mmr_logs (member_id, match_id, delta, mmr_after) VALUES (?, ?, ?, ?)`,
          [p.memberId, m.id, delta, mmrAfter]
        );
      }
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: matches.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "MVP 소급 지급 실패" }, { status: 500 });
  }
}
