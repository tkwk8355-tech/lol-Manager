import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WARNING_TYPES = ["운영 방침 위반", "지각 및 노쇼", "판수 미달", "불화 조장"] as const;

// GET /api/userinfo/warning?memberId=1
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const memberId = Number(new URL(req.url).searchParams.get("memberId"));
  if (!memberId) return NextResponse.json({ error: "memberId 필수" }, { status: 400 });

  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT w.id, w.type, w.reason, w.warned_at, m.nickname AS given_by_name
     FROM warnings w
     LEFT JOIN users u ON u.id = w.given_by
     LEFT JOIN members m ON m.id = u.member_id
     WHERE w.member_id = ?
     ORDER BY w.warned_at DESC`,
    [memberId]
  ) as [any[], any];
  return NextResponse.json({ warnings: rows });
}

// POST /api/userinfo/warning
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const memberId = Number(body.memberId);
  const type = String(body.type ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  const warnedAt = String(body.warnedAt ?? "").trim();

  if (!memberId || !WARNING_TYPES.includes(type as any) || !warnedAt) {
    return NextResponse.json({ error: "memberId, type, warnedAt 필수" }, { status: 400 });
  }

  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO warnings (member_id, type, reason, warned_at, given_by) VALUES (?, ?, ?, ?, ?)`,
    [memberId, type, reason || null, warnedAt, auth.session.userId]
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/userinfo/warning?id=1
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  await ensureSchema();
  const pool = getPool();
  await pool.query("DELETE FROM warnings WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
