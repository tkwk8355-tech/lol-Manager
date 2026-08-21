import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — 전체 로그인 계정 목록
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, username, nickname, role, status, created_at FROM users ORDER BY id ASC`
    ) as [any[], any];
    return NextResponse.json({
      users: rows.map((r) => ({
        id: r.id, username: r.username, nickname: r.nickname,
        role: r.role, status: r.status ?? "active", createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// PUT — 역할 변경
export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  // admin만 역할 변경 가능 (subadmin은 불가)
  if (auth.session.role !== "admin") {
    return NextResponse.json({ error: "최고 운영진만 역할을 변경할 수 있습니다." }, { status: 403 });
  }
  try {
    const { userId, role, approve } = await req.json();
    // 승인 처리
    if (approve) {
      await ensureSchema();
      const pool = getPool();
      await pool.query("UPDATE users SET status = 'active' WHERE id = ?", [Number(userId)]);
      return NextResponse.json({ ok: true });
    }
    if (!userId || !["admin", "subadmin", "member"].includes(role)) {
      return NextResponse.json({ error: "userId, role 필수" }, { status: 400 });
    }
    if (userId === auth.session.userId) {
      return NextResponse.json({ error: "본인 역할은 변경할 수 없습니다." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();
    await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, Number(userId)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "역할 변경 실패" }, { status: 500 });
  }
}

// DELETE ?id=1 — 로그인 계정 삭제
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    if (id === auth.session.userId) {
      return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [id]) as [any[], any];
    if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 계정입니다." }, { status: 404 });
    if (rows[0].role === "admin") {
      const [adminRows] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'") as [any[], any];
      if (adminRows[0].c <= 1) return NextResponse.json({ error: "마지막 운영진 계정은 삭제할 수 없습니다." }, { status: 400 });
    }
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
