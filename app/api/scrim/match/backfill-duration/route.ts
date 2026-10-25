import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getMatch, RiotApiError } from "@/lib/riot";
import { matchDurationSec } from "@/lib/scrim";

export const dynamic = "force-dynamic";

// POST /api/scrim/match/backfill-duration
// game_duration 컬럼 추가 전에 동기화된 Riot 경기의 경기 시간을 채운다 (DPM / 분당 CS 계산용).
// Riot API 요청 한도 때문에 한 번에 최대 limit(기본 80)경기만 처리한다. remaining이 0이 될 때까지 다시 호출하면 된다.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    await ensureSchema();
    const pool = getPool();
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 80, 1), 200);

    const [rows] = await pool.query(
      `SELECT id, riot_match_id FROM scrim_matches
       WHERE riot_match_id IS NOT NULL AND game_duration = 0
       ORDER BY id DESC LIMIT ?`,
      [limit]
    ) as [any[], any];

    let updated = 0;
    let stoppedByRateLimit = false;
    const failed: string[] = [];
    for (const r of rows) {
      try {
        const m = await getMatch(r.riot_match_id);
        const dur = matchDurationSec(m.info);
        if (dur > 0) {
          await pool.query(`UPDATE scrim_matches SET game_duration = ? WHERE id = ?`, [dur, r.id]);
          updated++;
        }
      } catch (e) {
        if (e instanceof RiotApiError && e.status === 429) { stoppedByRateLimit = true; break; }
        failed.push(r.riot_match_id);
      }
    }

    const [cntRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM scrim_matches WHERE riot_match_id IS NOT NULL AND game_duration = 0`
    ) as [any[], any];

    return NextResponse.json({ ok: true, updated, failed, stoppedByRateLimit, remaining: Number(cntRows[0].c) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "경기 시간 보충 실패" }, { status: 500 });
  }
}
