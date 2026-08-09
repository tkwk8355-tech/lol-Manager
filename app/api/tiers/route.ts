// =============================================================
// 참가자 솔랭 티어 조회 API (상세보기 펼칠 때 on-demand 호출)
//
// 전적 상세에서 각 참가자의 솔로랭크 티어를 보여주기 위해, 해당 경기 10명의
// puuid를 받아 LEAGUE-V4로 티어를 조회한다. 사람마다 호출이 필요해서 비용이
// 크므로, 결과를 메모리에 잠시 캐시해 같은 사람을 반복 조회하지 않는다.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { getLeagueEntries, RiotApiError } from "@/lib/riot";

interface TierInfo {
  tier: string; // 예: EMERALD (언랭이면 빈 문자열)
  rank: string; // 예: IV
}

// puuid → 솔랭 티어 캐시. 티어는 자주 안 바뀌므로 10분간 재사용.
const tierCache = new Map<string, { value: TierInfo; ts: number }>();
const TTL = 10 * 60 * 1000; // 10분

async function getSoloTier(puuid: string): Promise<TierInfo> {
  const cached = tierCache.get(puuid);
  if (cached && Date.now() - cached.ts < TTL) return cached.value;

  let value: TierInfo = { tier: "", rank: "" };
  try {
    const entries = await getLeagueEntries(puuid);
    const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
    if (solo) value = { tier: solo.tier, rank: solo.rank };
  } catch {
    // 조회 실패 시 그냥 언랭(빈 값)으로 둔다.
  }
  tierCache.set(puuid, { value, ts: Date.now() });
  return value;
}

// GET /api/tiers?puuids=p1,p2,p3...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("puuids")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "puuids가 필요합니다." }, { status: 400 });
  }
  const puuids = raw.split(",").filter(Boolean).slice(0, 16); // 안전상 최대 16명

  try {
    // 순차 처리: 초당 요청 한도를 넘기지 않도록.
    const result: Record<string, TierInfo> = {};
    for (const puuid of puuids) {
      result[puuid] = await getSoloTier(puuid);
    }
    return NextResponse.json({ tiers: result });
  } catch (err) {
    if (err instanceof RiotApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
