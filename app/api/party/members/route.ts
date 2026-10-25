import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/party/members?q=검색어 — 본계정 game_name 기준 클랜원 목록
// GET /api/party/members?all=1 — 전체 목록 (모집글 붙여넣기 매칭용, 클랜 닉네임 포함)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? "";
  const all = sp.get("all") === "1";

  const [rows] = await pool.query(
    `SELECT a.game_name, a.tag_line, m.nickname
     FROM accounts a
     JOIN members m ON m.id = a.member_id
     WHERE a.is_main = 1
       AND m.status NOT IN ('withdraw', 'black')
       AND (? = '' OR a.game_name LIKE ?)
     ORDER BY a.game_name ASC
     LIMIT ?`,
    [q, `%${q}%`, all ? 1000 : 20]
  ) as [any[], any];

  return NextResponse.json({
    members: rows.map((r: any) => ({ gameName: r.game_name, tagLine: r.tag_line, nickname: r.nickname }))
  });
}
