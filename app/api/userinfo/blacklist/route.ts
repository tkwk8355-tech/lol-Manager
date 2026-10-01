import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/userinfo/blacklist?memberId=1 (특정) or 전체
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const memberId = new URL(req.url).searchParams.get("memberId");
  const [rows] = await pool.query(
    `SELECT b.id, b.member_id, b.reason, b.added_at, m.nickname AS member_nickname
     FROM blacklist b
     LEFT JOIN members m ON m.id = b.member_id
     ${memberId ? "WHERE b.member_id = ?" : ""}
     ORDER BY b.added_at DESC`,
    memberId ? [Number(memberId)] : []
  ) as [any[], any];
  return NextResponse.json({ blacklist: rows });
}

// POST /api/userinfo/blacklist
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const memberId = Number(body.memberId);
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  const addedAt = String(body.addedAt ?? "").trim();
  if (!memberId || !addedAt) return NextResponse.json({ error: "memberId, addedAt 필수" }, { status: 400 });
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO blacklist (member_id, reason, added_at, given_by) VALUES (?, ?, ?, ?)`,
    [memberId, reason || null, addedAt, auth.session.userId]
  );
  await pool.query(`UPDATE members SET status = 'black', withdrew_at = COALESCE(withdrew_at, ?) WHERE id = ?`, [addedAt, memberId]);
  return NextResponse.json({ ok: true });
}

// PATCH /api/userinfo/blacklist - 블랙 수정
export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  const addedAt = String(body.addedAt ?? "").trim();
  if (!id || !addedAt) return NextResponse.json({ error: "id, addedAt 필수" }, { status: 400 });
  await ensureSchema();
  const pool = getPool();
  await pool.query(`UPDATE blacklist SET reason=?, added_at=? WHERE id=?`, [reason || null, addedAt, id]);
  return NextResponse.json({ ok: true });
}

// DELETE /api/userinfo/blacklist?id=1
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  await ensureSchema();
  const pool = getPool();
  await pool.query("DELETE FROM blacklist WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
