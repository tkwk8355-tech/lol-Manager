import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null });
  const pool = getPool();
  const [rows] = await pool.query("SELECT show_roster FROM users WHERE id = ?", [session.userId]) as [any[], any];
  const showRoster = !!rows[0]?.show_roster;
  return NextResponse.json({
    user: {
      userId: session.userId,
      username: session.username,
      nickname: session.nickname,
      role: session.role,
      scrimOnly: session.scrimOnly ?? false,
      showRoster,
    },
  });
}
