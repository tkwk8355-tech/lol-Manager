import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getAccountByRiotId, getLeagueEntries, RiotApiError } from "@/lib/riot";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/userinfo/sync
// body: { memberId: number }  → 해당 클랜원의 본계정 솔랭 티어만 갱신
// body: {}                    → 전체 클랜원 본계정 솔랭 티어 갱신
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const memberId: number | null = body.memberId ? Number(body.memberId) : null;

    await ensureSchema();
    const pool = getPool();

    const [accounts] = (memberId
      ? await pool.query(
          `SELECT id, game_name, tag_line, puuid FROM accounts WHERE member_id = ? AND is_main = 1`,
          [memberId]
        )
      : await pool.query(
          `SELECT id, game_name, tag_line, puuid FROM accounts WHERE is_main = 1`
        )) as [any[], any];

    const errors: string[] = [];
    let processed = 0;

    for (const acc of accounts) {
      try {
        let puuid = acc.puuid;
        if (!puuid) {
          const a = await getAccountByRiotId(acc.game_name, acc.tag_line);
          puuid = a.puuid;
          await pool.query("UPDATE accounts SET puuid = ? WHERE id = ?", [puuid, acc.id]);
        }

        const entries = await getLeagueEntries(puuid);
        const solo = entries.find((e: any) => e.queueType === "RANKED_SOLO_5x5");
        await pool.query(
          `UPDATE accounts SET solo_tier = ?, solo_rank = ?, solo_lp = ?, last_synced_at = NOW() WHERE id = ?`,
          [solo?.tier ?? null, solo?.rank ?? null, solo?.leaguePoints ?? 0, acc.id]
        );
        processed++;
      } catch (e) {
        if (e instanceof RiotApiError && e.status === 429) {
          errors.push(`${acc.game_name}#${acc.tag_line}: 요청 한도 초과`);
          break;
        }
        errors.push(`${acc.game_name}#${acc.tag_line}: 갱신 실패`);
      }
    }

    return NextResponse.json({ processed, errors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "동기화 실패" }, { status: 500 });
  }
}
