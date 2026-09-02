import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, nickname FROM users WHERE role = 'captain' AND status = 'active' ORDER BY id ASC`
  ) as any[];
  return NextResponse.json({ captains: rows });
}
