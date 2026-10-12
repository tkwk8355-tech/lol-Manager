import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { memberId, achievedAt } = await req.json();
  if (!memberId) return NextResponse.json({ error: "memberId 필요" }, { status: 400 });

  const pool = getPool();
  let dateVal: string;
  if (achievedAt && /^\d{4}-\d{2}-\d{2}$/.test(achievedAt)) {
    dateVal = achievedAt;
  } else {
    const [[today]] = await pool.query(`SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS today`) as [any[], any];
    dateVal = today.today;
  }
  await pool.query(`UPDATE members SET last_achieved_at = ? WHERE id = ?`, [dateVal, memberId]);

  return NextResponse.json({ lastAchievedAt: dateVal });
}
