import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// 로그인 계정 ↔ 클랜원 연동 관리 (운영진만).
// 클랜원 한 명은 로그인 계정 한 개에만 연동될 수 있다(users.member_id UNIQUE).
// 연동된 계정으로 파티를 만들면, 그 클랜원의 "본계정 롤 ID"가 참가자 표시 이름으로 쓰인다.

export const dynamic = "force-dynamic";

// GET — 전체 로그인 계정 목록(연동 상태 포함)
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.nickname, u.role, u.member_id, u.created_at, m.nickname AS member_nickname
       FROM users u LEFT JOIN members m ON m.id = u.member_id
       ORDER BY u.id ASC`
    ) as [any[], any];
    return NextResponse.json({
      users: rows.map((r) => ({
        id: r.id, username: r.username, nickname: r.nickname, role: r.role,
        memberId: r.member_id, memberNickname: r.member_nickname, createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// PUT — 특정 로그인 계정을 특정 클랜원과 연동(또는 해제, memberId: null)
// 그 클랜원에 이미 연동된 다른 계정이 있으면 먼저 해제하고 새 계정으로 교체한다.
export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { userId, memberId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (memberId) {
        // 이 클랜원에 이미 연동된 다른 계정이 있으면 먼저 해제.
        await conn.query("UPDATE users SET member_id = NULL WHERE member_id = ? AND id != ?", [Number(memberId), Number(userId)]);
      }
      await conn.query("UPDATE users SET member_id = ? WHERE id = ?", [memberId ? Number(memberId) : null, Number(userId)]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "연동 실패" }, { status: 500 });
  }
}

// DELETE ?id=1 — 로그인 계정 삭제(운영진만). 클랜원(members) 자체는 삭제하지 않고,
// 그 계정과의 연동만 함께 사라진다(member_id는 이 계정에만 있던 정보라 자연히 없어짐).
// 자기 자신 계정은 삭제할 수 없고, 마지막 남은 admin 계정도 삭제할 수 없다(잠금 방지).
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    if (id === auth.session.userId) {
      return NextResponse.json({ error: "본인 계정은 여기서 삭제할 수 없습니다." }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [id]) as [any[], any];
    if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 계정입니다." }, { status: 404 });

    if (rows[0].role === "admin") {
      const [adminRows] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'") as [any[], any];
      if (adminRows[0].c <= 1) {
        return NextResponse.json({ error: "마지막 남은 운영진 계정은 삭제할 수 없습니다." }, { status: 400 });
      }
    }

    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
