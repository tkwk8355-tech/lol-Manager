import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { givePoints } from "@/lib/points";

export const dynamic = "force-dynamic";

// GET /api/points?memberId=1  — 특정 클랜원 포인트 로그
// GET /api/points              — 전체 로그 (운영진만)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const memberId = new URL(req.url).searchParams.get("memberId");

  if (memberId) {
    const [logs] = await pool.query(
      `SELECT pl.id, pl.points, pl.type, pl.games, pl.comment, pl.created_at,
              m2.nickname AS given_by_name
       FROM point_logs pl
       LEFT JOIN users u ON u.id = pl.given_by
       LEFT JOIN members m2 ON m2.id = u.member_id
       WHERE pl.member_id = ?
       ORDER BY pl.created_at DESC`,
      [memberId]
    ) as [any[], any];
    const [totRows] = await pool.query(
      `SELECT total_points FROM members WHERE id = ?`, [memberId]
    ) as [any[], any];
    return NextResponse.json({ logs, totalPoints: totRows[0]?.total_points ?? 0 });
  }

  // 전체 로그 (운영진만)
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin") return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const search = (sp.get("search") ?? "").trim();
  const whereClause = search
    ? `WHERE (SELECT a.game_name FROM accounts a WHERE a.member_id = pl.member_id AND a.is_main = 1 LIMIT 1) LIKE ?`
    : "";
  const searchParam = search ? [`%${search}%`] : [];
  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM point_logs pl ${whereClause}`,
    searchParam
  ) as [any[], any];
  const total = Number(totalRows[0]?.cnt ?? 0);
  const [logs] = await pool.query(
    `SELECT pl.id, pl.member_id,
            COALESCE((SELECT a.game_name FROM accounts a WHERE a.member_id = pl.member_id AND a.is_main = 1 LIMIT 1), '알수없음') AS nickname,
            pl.points, pl.type, pl.games,
            pl.comment, pl.created_at,
            COALESCE((SELECT a2.game_name FROM users u JOIN accounts a2 ON a2.member_id = u.member_id AND a2.is_main = 1 WHERE u.id = pl.given_by LIMIT 1), u2.nickname) AS given_by_name
     FROM point_logs pl
     LEFT JOIN users u2 ON u2.id = pl.given_by
     ${whereClause}
     ORDER BY pl.created_at DESC LIMIT 50 OFFSET ?`,
    [...searchParam, offset]
  ) as [any[], any];
  return NextResponse.json({ logs, total });
}

// POST /api/points — 운영진 수동 포인트 지급 or 상점 구매
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const memberId = Number(body.memberId);
  const points = Number(body.points);
  const comment = String(body.comment ?? "").trim().slice(0, 255);
  const type = String(body.type ?? "manual");

  if (!memberId || !comment) {
    return NextResponse.json({ error: "memberId, points, comment 필수" }, { status: 400 });
  }
  if (type !== "rookie_event" && !points) {
    return NextResponse.json({ error: "memberId, points, comment 필수" }, { status: 400 });
  }

  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query("SELECT id, total_points FROM members WHERE id = ?", [memberId]) as [any[], any];
  if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 클랜원" }, { status: 404 });

  // 상점 구매: 포인트 차감 — 음수 방지
  if (type === "shop") {
    const current = rows[0].total_points ?? 0;
    if (current < points) return NextResponse.json({ error: `포인트 부족 (보유: ${current}P)` }, { status: 400 });
    await givePoints(pool, memberId, -points, "shop", 0, comment, auth.session.userId, null);
    return NextResponse.json({ ok: true });
  }

  // 수습 이벤트 참여: party_count=1, points=0으로 rookie_session 로그 추가
  if (type === "rookie_event") {
    await givePoints(pool, memberId, 0, "rookie_session", 0, comment, auth.session.userId, null, 1, null, null, null);
    return NextResponse.json({ ok: true });
  }

  await givePoints(pool, memberId, points, "manual", 0, comment, auth.session.userId, null);
  return NextResponse.json({ ok: true });
}

// DELETE /api/points?id=1 — 포인트 로그 취소 (운영진만)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query("SELECT member_id, points, type, ref_id FROM point_logs WHERE id = ?", [id]) as [any[], any];
  if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 로그" }, { status: 404 });
  const log = rows[0];

  // 수습 동반 보너스 로그인 경우 rookie_bonus_log도 삭제
  if ((log.type === 'normal' || log.type === 'flex' || log.type === 'solo' || log.type === 'aram') && log.ref_id) {
    // 이 파티에서 수습이 있었는지 확인
    const [rookieRows] = await pool.query(
      `SELECT DISTINCT a.member_id FROM party_participant_history pph
       JOIN accounts a ON a.game_name = pph.nickname AND a.is_main = 1
       JOIN members m ON m.id = a.member_id AND m.position = '수습'
       WHERE pph.party_id = ?`,
      [log.ref_id]
    ) as [any[], any];
    for (const r of rookieRows) {
      await pool.query(
        `DELETE FROM rookie_bonus_log WHERE member_id = ? AND rookie_member_id = ?`,
        [log.member_id, r.member_id]
      );
    }
  }

  await pool.query("UPDATE members SET total_points = total_points - ? WHERE id = ?", [log.points, log.member_id]);
  await pool.query("DELETE FROM point_logs WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
