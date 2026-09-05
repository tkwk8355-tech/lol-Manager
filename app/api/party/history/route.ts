import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/party/history — 최근 2주 파티 내역
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin")
    return NextResponse.json({ error: "운영진만 접근 가능합니다." }, { status: 403 });

  try {
    await ensureSchema();
    const pool = getPool();

    const [parties] = await pool.query(
      `SELECT p.id, p.mode, p.note, p.status, p.created_at, p.ended_at, p.start_at, p.host_nickname,
              u.nickname AS ended_by_nickname
       FROM parties p
       LEFT JOIN users u ON u.id = p.ended_by
       WHERE p.status = 'ended'
       ORDER BY p.ended_at DESC
       LIMIT 100`
    ) as [any[], any];

    const partyIds = parties.map((p: any) => p.id);
    let participantMap: Record<number, string[]> = {};
    let historyMap: Record<number, string[]> = {};
    if (partyIds.length > 0) {
      const ph = partyIds.map(() => "?").join(",");
      const [ppts] = await pool.query(
        `SELECT party_id, nickname FROM party_participants WHERE party_id IN (${ph}) AND is_waiting = 0`,
        partyIds
      ) as [any[], any];
      for (const r of ppts) {
        if (!participantMap[r.party_id]) participantMap[r.party_id] = [];
        participantMap[r.party_id].push(r.nickname);
      }
      const [hist] = await pool.query(
        `SELECT party_id, nickname FROM party_participant_history WHERE party_id IN (${ph})`,
        partyIds
      ) as [any[], any];
      for (const r of hist) {
        if (!historyMap[r.party_id]) historyMap[r.party_id] = [];
        historyMap[r.party_id].push(r.nickname);
      }
    }

    return NextResponse.json({
      parties: parties.map((p: any) => {
        const current = participantMap[p.id] ?? [];
        const allHist = historyMap[p.id] ?? [];
        const past = allHist.filter((n: string) => !current.includes(n));
        return {
          id: p.id,
          mode: p.mode,
          note: p.note,
          status: p.status,
          startAt: p.start_at,
          endedBy: p.ended_by_nickname ?? null,
          participants: current,
          pastParticipants: past,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
