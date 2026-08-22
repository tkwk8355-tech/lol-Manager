import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { soloBadgeToInitialMmr } from "@/lib/scrim";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/scrim/rating/init — 솔랭 기반 초기 MMR 일괄 배정 (어드민)
// PATCH /api/scrim/rating — 특정 멤버 MMR 수동 수정 (어드민)

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "admin" && session.role !== "subadmin"))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  await ensureSchema();
  const pool = getPool();

  // 솔랭 티어 기준 최고 계정 조회
  const [accRows] = await pool.query(
    `SELECT member_id, solo_tier FROM accounts WHERE is_main = 1`
  ) as [any[], any];

  // 주계정 없는 멤버는 서브계정 중 최고 티어로
  const [subRows] = await pool.query(
    `SELECT member_id, solo_tier FROM accounts WHERE is_main = 0`
  ) as [any[], any];

  const tierMap = new Map<number, string | null>();
  for (const r of subRows) if (!tierMap.has(r.member_id)) tierMap.set(r.member_id, r.solo_tier);
  for (const r of accRows) tierMap.set(r.member_id, r.solo_tier);

  if (tierMap.size === 0) return NextResponse.json({ updated: 0 });

  let updated = 0;
  for (const [memberId, tier] of tierMap) {
    const mmr = soloBadgeToInitialMmr(tier);
    await pool.query(
      `INSERT INTO scrim_ratings (member_id, mmr) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE mmr = VALUES(mmr)`,
      [memberId, mmr]
    );
    updated++;
  }

  return NextResponse.json({ updated });
}

export async function PATCH(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "admin" && session.role !== "subadmin"))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { memberId, mmr }: { memberId: number; mmr: number } = await req.json();
  if (!memberId || mmr == null) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO scrim_ratings (member_id, mmr) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE mmr = VALUES(mmr)`,
    [memberId, Math.max(0, mmr)]
  );
  return NextResponse.json({ ok: true });
}
