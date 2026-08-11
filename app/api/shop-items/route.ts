import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, name, cost, cond, note, sort_order FROM shop_items ORDER BY sort_order, id"
  ) as [any[], any];
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  const cost = Number(body.cost ?? 0);
  const cond = String(body.cond ?? "").trim().slice(0, 50);
  const note = String(body.note ?? "").trim().slice(0, 255);
  const sort_order = Number(body.sort_order ?? 0);

  if (!name) return NextResponse.json({ error: "name 필수" }, { status: 400 });

  await ensureSchema();
  const pool = getPool();
  const [result] = await pool.query(
    "INSERT INTO shop_items (name, cost, cond, note, sort_order) VALUES (?, ?, ?, ?, ?)",
    [name, cost, cond, note, sort_order]
  ) as [any, any];
  return NextResponse.json({ ok: true, id: result.insertId });
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  const name = String(body.name ?? "").trim().slice(0, 100);
  const cost = Number(body.cost ?? 0);
  const cond = String(body.cond ?? "").trim().slice(0, 50);
  const note = String(body.note ?? "").trim().slice(0, 255);
  const sort_order = Number(body.sort_order ?? 0);

  if (!name) return NextResponse.json({ error: "name 필수" }, { status: 400 });

  const pool = getPool();
  await pool.query(
    "UPDATE shop_items SET name=?, cost=?, cond=?, note=?, sort_order=? WHERE id=?",
    [name, cost, cond, note, sort_order, id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  const pool = getPool();
  await pool.query("DELETE FROM shop_items WHERE id=?", [id]);
  return NextResponse.json({ ok: true });
}
