import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MODES = ["aram", "arena", "normal", "flex", "solo"];

// GET /api/party/history?page=0&limit=20&mode=all&q=닉네임 — 종료(펑)된 파티 내역 (시작 시각 최신순, 페이지 단위)
// 최근 30일만. q: 참가자 닉네임(중간에 빠진 사람 포함) 또는 파티 메모로 검색
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin")
    return NextResponse.json({ error: "운영진만 접근 가능합니다." }, { status: 403 });

  try {
    await ensureSchema();
    const pool = getPool();

    const sp = req.nextUrl.searchParams;
    const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 20));
    const page = Math.max(0, Math.floor(Number(sp.get("page")) || 0));
    const modeParam = sp.get("mode");
    const mode = modeParam && MODES.includes(modeParam) ? modeParam : null;

    const q = (sp.get("q") ?? "").trim().slice(0, 50);

    // 최근 30일(시작 시각 기준)만 보여준다 — 내역이 쌓여도 조회가 무거워지지 않도록
    const conds = [
      "p.status = 'ended'",
      "COALESCE(p.start_at, p.ended_at, p.created_at) >= NOW() - INTERVAL 30 DAY",
    ];
    const whereParams: (string | number)[] = [];
    if (mode) { conds.push("p.mode = ?"); whereParams.push(mode); }
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
      conds.push(`(p.note LIKE ?
        OR EXISTS (SELECT 1 FROM party_participant_history h WHERE h.party_id = p.id AND h.nickname LIKE ?)
        OR EXISTS (SELECT 1 FROM party_participants pp WHERE pp.party_id = p.id AND pp.nickname LIKE ?))`);
      whereParams.push(like, like, like);
    }
    const where = conds.join(" AND ");

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM parties p WHERE ${where}`,
      whereParams
    ) as [any[], any];
    const total = Number(countRow?.total ?? 0);

    // 빠진 파티를 찾기 쉽도록 "펑한 시각"이 아니라 "시작 시각" 기준으로 정렬한다.
    const [parties] = await pool.query(
      `SELECT p.id, p.mode, p.note, p.status, p.created_at, p.ended_at, p.start_at, p.host_nickname,
              u.nickname AS ended_by_nickname
       FROM parties p
       LEFT JOIN users u ON u.id = p.ended_by
       WHERE ${where}
       ORDER BY COALESCE(p.start_at, p.ended_at, p.created_at) DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...whereParams, limit, page * limit]
    ) as [any[], any];

    const partyIds = parties.map((p: any) => p.id);
    const participantMap: Record<number, string[]> = {};
    const historyMap: Record<number, string[]> = {};
    // 칼바람/증바람: 펑할 때 입력한 참가자별 판수 (point_logs에 기록된 값)
    const gamesMap: Record<number, Record<string, number>> = {};
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

      const aramIds = parties.filter((p: any) => p.mode === "aram" || p.mode === "arena").map((p: any) => p.id);
      if (aramIds.length > 0) {
        const ph2 = aramIds.map(() => "?").join(",");
        const [gl] = await pool.query(
          `SELECT pl.ref_id AS party_id, a.game_name AS nickname, SUM(pl.games) AS games
           FROM point_logs pl
           JOIN accounts a ON a.member_id = pl.member_id AND a.is_main = 1
           WHERE pl.ref_table = 'party' AND pl.type = 'aram' AND pl.ref_id IN (${ph2})
           GROUP BY pl.ref_id, a.game_name`,
          aramIds
        ) as [any[], any];
        for (const r of gl) {
          const g = Number(r.games ?? 0);
          if (g <= 0) continue;
          if (!gamesMap[r.party_id]) gamesMap[r.party_id] = {};
          gamesMap[r.party_id][r.nickname] = g;
        }
      }
    }

    return NextResponse.json({
      total,
      page,
      limit,
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
          endedAt: p.ended_at,
          endedBy: p.ended_by_nickname ?? null,
          participants: current,
          pastParticipants: past,
          games: gamesMap[p.id] ?? null,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
