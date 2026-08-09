import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/party/history?month=YYYY-MM — 운영진 전용 파티 내역
// month 미지정 시 이번 달
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin")
    return NextResponse.json({ error: "운영진만 접근 가능합니다." }, { status: 403 });

  try {
    await ensureSchema();
    const pool = getPool();

    const monthParam = new URL(req.url).searchParams.get("month");
    let year: number, month: number;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      [year, month] = monthParam.split("-").map(Number);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    const start = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
    const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
    const end   = `${nextMonth}-01 00:00:00`;

    // 해당 월의 파티 목록 (ended 포함 전체)
    const [parties] = await pool.query(
      `SELECT p.id, p.mode, p.note, p.status, p.created_at, p.ended_at, p.start_at,
              p.host_nickname,
              COUNT(pp.id) AS participant_count
       FROM parties p
       LEFT JOIN party_participants pp ON pp.party_id = p.id AND pp.is_waiting = 0
       WHERE p.created_at >= ? AND p.created_at < ?
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [start, end]
    ) as [any[], any];

    const [memberStats] = await pool.query(
      `SELECT pp.nickname, COUNT(DISTINCT pp.party_id) AS party_count
       FROM party_participants pp
       JOIN parties p ON p.id = pp.party_id
       WHERE pp.is_waiting = 0 AND p.created_at >= ? AND p.created_at < ?
       GROUP BY pp.nickname
       ORDER BY party_count DESC`,
      [start, end]
    ) as [any[], any];

    return NextResponse.json({
      year, month,
      parties: parties.map((p: any) => ({
        id: p.id,
        mode: p.mode,
        note: p.note,
        status: p.status,
        createdAt: p.created_at,
        endedAt: p.ended_at,
        startAt: p.start_at,
        hostNickname: p.host_nickname,
        participantCount: Number(p.participant_count),
      })),
      memberStats: memberStats.map((r: any) => ({
        nickname: r.nickname,
        partyCount: Number(r.party_count),
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
