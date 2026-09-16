import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { updateLastAchieved } from "@/lib/points";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { memberId } = await req.json();
  if (!memberId) return NextResponse.json({ error: "memberId 필요" }, { status: 400 });

  const pool = getPool();
  await updateLastAchieved(pool, memberId);

  const [[m]] = await pool.query(
    "SELECT DATE(last_achieved_at) as last_achieved_at FROM members WHERE id=?",
    [memberId]
  ) as [any[], any];

  return NextResponse.json({ lastAchievedAt: m?.last_achieved_at ?? null });
}
