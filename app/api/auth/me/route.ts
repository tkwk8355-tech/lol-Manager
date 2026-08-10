import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      userId: session.userId,
      username: session.username,
      nickname: session.nickname,
      role: session.role,
    },
  });
}
