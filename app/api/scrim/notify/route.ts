import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 디스코드 전송만 담당. 경기 동기화는 팀 생성/다시 생성 시점에 /api/scrim/match/sync-today 에서 처리한다.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { allowScrimOnly: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { team1, team2, sum1, sum2, diff } = body;
    const botUrl = process.env.DISCORD_BOT_URL;
    if (!botUrl) return NextResponse.json({ error: "DISCORD_BOT_URL이 설정되지 않았습니다." }, { status: 500 });

    // 디스코드 전송
    const res = await fetch(`${botUrl}/send-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team1, team2, sum1, sum2, diff }),
    });

    if (!res.ok) {
      console.error("[notify] 봇 서버 오류:", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "디스코드 봇 서버 오류" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "디스코드 전송 실패" }, { status: 500 });
  }
}
