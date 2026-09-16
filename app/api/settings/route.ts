import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const pool = getPool();
  const [rows] = await pool.query(`SELECT key_name, value FROM app_settings`) as [any[], any];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key_name] = r.value;
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const pool = getPool();
  const body = await req.json();
  for (const [key, value] of Object.entries(body)) {
    await pool.query(
      `INSERT INTO app_settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?`,
      [key, String(value), String(value)]
    );
  }
  return NextResponse.json({ ok: true });
}
