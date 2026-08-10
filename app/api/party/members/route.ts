import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/party/members?q=검색어 — 본계정 game_name 기준 클랜원 목록
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const q = new URL(req.url).searchParams.get("q") ?? "";

  const [rows] = await pool.query(
    `SELECT a.game_name, a.tag_line
     FROM accounts a
     WHERE a.is_main = 1
       AND (? = '' OR a.game_name LIKE ?)
     ORDER BY a.game_name ASC
     LIMIT 20`,
    [q, `%${q}%`]
  ) as [any[], any];

  return NextResponse.json({
    members: rows.map((r: any) => ({ gameName: r.game_name, tagLine: r.tag_line }))
  });
}
