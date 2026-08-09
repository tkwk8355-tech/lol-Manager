import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getAccountByRiotId, getLeagueEntries, RiotApiError } from "@/lib/riot";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { memberId, gameName, tagLine, isMain } = await req.json();
    const name = String(gameName || "").trim();
    const tag = String(tagLine || "").trim();
    if (!memberId || !name || !tag) {
      return NextResponse.json({ error: "클랜원, 소환사명, 태그를 모두 입력하세요." }, { status: 400 });
    }

    let puuid: string;
    try {
      const acc = await getAccountByRiotId(name, tag);
      puuid = acc.puuid;
    } catch (e) {
      if (e instanceof RiotApiError && e.status === 404) {
        return NextResponse.json({ error: "존재하지 않는 Riot ID입니다. (이름/태그 확인)" }, { status: 400 });
      }
      throw e;
    }

    let soloTier: string | null = null;
    let soloRank: string | null = null;
    let soloLp = 0;
    try {
      const entries = await getLeagueEntries(puuid);
      const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
      if (solo) { soloTier = solo.tier; soloRank = solo.rank; soloLp = solo.leaguePoints; }
    } catch {}

    await ensureSchema();
    const pool = getPool();
    try {
      const [result] = await pool.query(
        `INSERT INTO accounts (member_id, game_name, tag_line, puuid, is_main, solo_tier, solo_rank, solo_lp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [Number(memberId), name, tag, puuid, isMain ? 1 : 0, soloTier, soloRank, soloLp]
      ) as any;
      return NextResponse.json({ id: result.insertId });
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: "이미 등록된 계정입니다." }, { status: 409 });
      }
      throw e;
    }
  } catch (err) {
    if (err instanceof RiotApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "계정 추가 실패" }, { status: 500 });
  }
}
