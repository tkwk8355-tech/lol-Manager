import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePartyIdentity } from "@/lib/party";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null });

  // 클랜원 계정과 연동되어 있는지(=파티 생성/참가 가능 여부)도 함께 내려준다.
  const identity = await resolvePartyIdentity(session.userId).catch(() => null);

  return NextResponse.json({
    user: {
      userId: session.userId,
      username: session.username,
      nickname: session.nickname,
      role: session.role,
      linkedRiotId: identity?.displayName ?? null,
    },
  });
}
