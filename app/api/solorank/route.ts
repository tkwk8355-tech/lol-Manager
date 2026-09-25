import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { givePoints } from "@/lib/points";

export const dynamic = "force-dynamic";

// GET: 세션 목록 or 단일 세션 상세
export async function GET(req: NextRequest) {
  await ensureSchema();
  const pool = getPool();
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (sessionId) {
    const [[sessions], [participants], [games]] = await Promise.all([
      pool.query(`SELECT s.*, u.nickname AS creator_name FROM solorank_sessions s JOIN users u ON u.id=s.created_by WHERE s.id=?`, [sessionId]) as Promise<[any[], any]>,
      pool.query(
        `SELECT sp.*, m.nickname FROM solorank_participants sp JOIN members m ON m.id=sp.member_id WHERE sp.session_id=? ORDER BY sp.team, sp.id`,
        [sessionId]
      ) as Promise<[any[], any]>,
      pool.query(`SELECT * FROM solorank_games WHERE session_id=? ORDER BY game_no`, [sessionId]) as Promise<[any[], any]>,
    ]);
    if (!sessions[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ session: sessions[0], participants, games });
  }

  const [rows] = await pool.query(
    `SELECT s.*, COUNT(sp.id) AS participant_count FROM solorank_sessions s LEFT JOIN solorank_participants sp ON sp.session_id=s.id GROUP BY s.id ORDER BY s.created_at DESC`
  ) as [any[], any];
  return NextResponse.json({ sessions: rows });
}

// POST: 세션 생성
export async function POST(req: NextRequest) {
  await ensureSchema();
  const pool = getPool();
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { name, totalGames, team1, team2 } = await req.json();
  if (!team1?.length || !team2?.length) return NextResponse.json({ error: "팀 인원을 입력하세요" }, { status: 400 });

  const [result] = await pool.query(
    `INSERT INTO solorank_sessions (name, total_games, status, created_by) VALUES (?, ?, 'playing', ?)`,
    [name || null, totalGames || 5, auth.session.userId]
  ) as [any, any];
  const sessionId = result.insertId;

  for (const memberId of team1) {
    await pool.query(`INSERT INTO solorank_participants (session_id, member_id, team) VALUES (?, ?, 1)`, [sessionId, memberId]);
  }
  for (const memberId of team2) {
    await pool.query(`INSERT INTO solorank_participants (session_id, member_id, team) VALUES (?, ?, 2)`, [sessionId, memberId]);
  }

  return NextResponse.json({ sessionId });
}

// PATCH: 판 결과 기록 / 세션 종료(포인트 지급)
export async function PATCH(req: NextRequest) {
  await ensureSchema();
  const pool = getPool();
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { action, sessionId, gameNo, winnerTeam, points } = await req.json();

  if (action === "record") {
    await pool.query(
      `INSERT INTO solorank_games (session_id, game_no, winner_team) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE winner_team=VALUES(winner_team)`,
      [sessionId, gameNo, winnerTeam]
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "finish") {
    const pt = Number(points) || 10;
    const [participants] = await pool.query(
      `SELECT member_id FROM solorank_participants WHERE session_id=?`, [sessionId]
    ) as [any[], any];
    for (const p of participants) {
      await givePoints(pool, p.member_id, pt, "event", 0, "솔랭내기 참여", auth.session.userId, sessionId);
    }
    await pool.query(`UPDATE solorank_sessions SET status='done' WHERE id=?`, [sessionId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_game") {
    await pool.query(`DELETE FROM solorank_games WHERE session_id=? AND game_no=?`, [sessionId, gameNo]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

// DELETE: 세션 삭제
export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const pool = getPool();
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  await pool.query(`DELETE FROM solorank_sessions WHERE id=?`, [sessionId]);
  return NextResponse.json({ ok: true });
}
