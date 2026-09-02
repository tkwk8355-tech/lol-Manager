import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

// GET /api/auction/roster → roster에 등록된 사람만 반환
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT m.id AS member_id, m.nickname, m.main_line, m.sub_line,
            a.solo_tier, a.solo_rank,
            r.line, r.champ1, r.champ2, r.champ3
     FROM auction_roster r
     JOIN members m ON m.id = r.member_id
     LEFT JOIN accounts a ON a.member_id = m.id AND a.is_main = 1
     ORDER BY m.nickname ASC`
  ) as any[];
  return NextResponse.json({ roster: rows });
}

// PUT /api/auction/roster → 저장 (upsert)
// body: { memberId, line, champ1, champ2, champ3 }
export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const { memberId, line, champ1, champ2, champ3 } = await req.json();
  if (!memberId) return NextResponse.json({ error: "memberId 필요" }, { status: 400 });
  await pool.query(
    `INSERT INTO auction_roster (member_id, line, champ1, champ2, champ3)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE line=VALUES(line), champ1=VALUES(champ1), champ2=VALUES(champ2), champ3=VALUES(champ3)`,
    [memberId, line || null, champ1 || null, champ2 || null, champ3 || null]
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/auction/roster → 참여자 제거
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const { memberId } = await req.json();
  if (!memberId) return NextResponse.json({ error: "memberId 필요" }, { status: 400 });
  await pool.query(`DELETE FROM auction_roster WHERE member_id = ?`, [memberId]);
  return NextResponse.json({ ok: true });
}
