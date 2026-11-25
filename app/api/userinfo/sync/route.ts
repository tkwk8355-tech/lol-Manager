import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPool, ensureSchema } from "@/lib/db";
import { syncMainSoloTiers } from "@/lib/soloTierSync";
import { getSoloTierSchedule } from "@/lib/soloTierScheduler";

export const dynamic = "force-dynamic";

// GET /api/userinfo/sync → 마지막 전체 동기화 기록 + 다음 자동 실행 시각 (클랜원 관리 상단 표시용)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = (await pool.query(
      `SELECT id, trigger_type, started_at, finished_at, total, processed, error_count, errors, rate_limited
       FROM solo_sync_runs ORDER BY id DESC LIMIT 1`
    )) as [any[], any];
    const r = rows[0];
    return NextResponse.json({
      lastRun: r
        ? {
            trigger: r.trigger_type,
            startedAt: r.started_at,
            finishedAt: r.finished_at,
            total: r.total,
            processed: r.processed,
            errorCount: r.error_count,
            errors: r.errors ? String(r.errors).split("\n") : [],
            rateLimited: !!r.rate_limited,
          }
        : null,
      schedule: getSoloTierSchedule(),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// POST /api/userinfo/sync
// body: { memberId: number }  → 해당 클랜원의 본계정 솔랭 티어만 갱신
// body: {}                    → 전체 클랜원 본계정 솔랭 티어 갱신 (실행 기록 남김)
// (매일 새벽 자동 동기화는 lib/soloTierScheduler.ts 에서 같은 함수를 사용)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const memberId: number | null = body.memberId ? Number(body.memberId) : null;

    const { processed, errors } = await syncMainSoloTiers({ memberId, logAs: memberId ? undefined : "manual" });
    return NextResponse.json({ processed, errors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "동기화 실패" }, { status: 500 });
  }
}
