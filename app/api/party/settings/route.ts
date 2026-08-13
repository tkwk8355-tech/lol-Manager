import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query(`SELECT mode, points, min_games FROM party_point_settings`) as [any[], any];
  return NextResponse.json({ settings: rows });
}

export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  // body: [{ mode, points, min_games }, ...]
  const settings: { mode: string; points: number; min_games: number }[] = Array.isArray(body) ? body : [];
  if (!settings.length) return NextResponse.json({ error: "설정값이 없습니다." }, { status: 400 });
  await ensureSchema();
  const pool = getPool();
  for (const s of settings) {
    await pool.query(
      `INSERT INTO party_point_settings (mode, points, min_games) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE points = VALUES(points), min_games = VALUES(min_games)`,
      [s.mode, Number(s.points), Number(s.min_games)]
    );
  }
  return NextResponse.json({ ok: true });
}
