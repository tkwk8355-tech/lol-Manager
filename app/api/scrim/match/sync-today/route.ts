import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncScrimMatches } from "@/lib/syncScrim";

export const dynamic = "force-dynamic";

// 팀 생성 / 다시 생성 때 호출: 오늘(새벽 6시 기준) 내전 경기를 자동 동기화한다.
// 명단 슬롯 순서대로 시도하고, 성공한 클랜원 한 명 기준으로 끝낸다.
// 다시 생성을 연달아 눌러도 동기화가 겹치지 않도록 실행 중이면 그 결과를 같이 기다린다.
let running: Promise<any> | null = null;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { allowScrimOnly: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const memberIds: number[] = (Array.isArray(body.memberIds) ? body.memberIds : [])
    .map(Number)
    .filter((id: number) => id > 0);
  if (memberIds.length === 0) return NextResponse.json({ error: "클랜원이 없습니다." }, { status: 400 });

  if (running) {
    const result = await running.catch(() => null);
    return NextResponse.json({ ok: true, shared: true, syncResult: result });
  }

  running = (async () => {
    const now = new Date();
    let todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
    if (now < todayBase) todayBase = new Date(todayBase.getTime() - 24 * 60 * 60 * 1000);
    const startAt = todayBase.toISOString();
    for (const memberId of memberIds) {
      try {
        const r = await syncScrimMatches(memberId, startAt, auth.session.userId);
        console.log(`[sync-today] 성공 memberId=${memberId} added=${r.addedMatches}`);
        return r;
      } catch (e) {
        console.log(`[sync-today] 스킵 memberId=${memberId}: ${(e as Error).message}`);
      }
    }
    return null;
  })();

  try {
    const syncResult = await running;
    return NextResponse.json({ ok: true, syncResult });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? "동기화 실패" }, { status: 500 });
  } finally {
    running = null;
  }
}
