import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const pool = getPool();
    const [[memberRow], [partyRow], [recentParties], [lineDist]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM members") as Promise<[any[], any]>,
      pool.query("SELECT COUNT(*) AS c FROM parties WHERE status = 'open'") as Promise<[any[], any]>,
      pool.query(
        `SELECT p.id, p.mode, p.status, p.host_nickname, p.note, p.start_at, p.max_size,
                COUNT(pp.id) AS participant_count
         FROM parties p
         LEFT JOIN party_participants pp ON pp.party_id = p.id AND pp.is_waiting = 0
         WHERE p.status = 'open'
         GROUP BY p.id
         ORDER BY p.created_at DESC LIMIT 2`
      ) as Promise<[any[], any]>,
      pool.query(
        `SELECT main_line, COUNT(*) AS c FROM members WHERE main_line IS NOT NULL GROUP BY main_line`
      ) as Promise<[any[], any]>,
    ]);
    return NextResponse.json({
      memberCount: memberRow[0].c,
      openPartyCount: partyRow[0].c,
      recentParties: recentParties.map((p: any) => ({
        id: p.id,
        mode: p.mode,
        status: p.status,
        hostNickname: p.host_nickname,
        note: p.note,
        startAt: p.start_at,
        maxSize: p.max_size,
        participantCount: Number(p.participant_count),
      })),
      lineDist: Object.fromEntries(lineDist.map((r: any) => [r.main_line, Number(r.c)])),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ memberCount: 0, openPartyCount: 0, recentParties: [], lineDist: {} });
  }
}
