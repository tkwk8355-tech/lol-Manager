import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncScrimMatches } from "@/lib/syncScrim";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { team1, team2, sum1, sum2, diff, slotMemberIds } = body;
    const botUrl = process.env.DISCORD_BOT_URL;
    if (!botUrl) return NextResponse.json({ error: "DISCORD_BOT_URL이 설정되지 않았습니다." }, { status: 500 });

    // 슬롯 1~5번 순서대로 시도, 성공하면 멈춤
    let syncResult = null;
    const memberIds: number[] = (slotMemberIds ?? []).filter(Boolean);
    if (memberIds.length > 0) {
      // 오늘 새벽 6시 ~ 내일 새벽 6시 범위의 매치를 동기화
      const now = new Date();
      let todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
      if (now < todayBase) todayBase = new Date(todayBase.getTime() - 24 * 60 * 60 * 1000);
      const startAt = todayBase.toISOString();
      for (const memberId of memberIds) {
        try {
          syncResult = await syncScrimMatches(memberId, startAt, auth.session.userId);
          console.log(`[notify] sync 성공 memberId=${memberId} added=${syncResult.addedMatches}`);
          break;
        } catch (e) {
          console.log(`[notify] sync 스킵 memberId=${memberId}: ${(e as Error).message}`);
        }
      }
    }

    // 디스코드 전송
    const res = await fetch(`${botUrl}/send-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team1, team2, sum1, sum2, diff }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `봇 서버 오류: ${text}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, syncResult });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "디스코드 전송 실패" }, { status: 500 });
  }
}
