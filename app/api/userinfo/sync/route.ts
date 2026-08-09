import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getAccountByRiotId, getMatchIds, getMatch, getLeagueEntries, RiotApiError } from "@/lib/riot";
import { higherTier } from "@/lib/scrim";
import { requireAdmin } from "@/lib/auth";

const ONE_MONTH_SEC = 30 * 24 * 60 * 60;

function matchNum(id: string | null): number {
  if (!id) return 0;
  const n = Number(id.split("_")[1]);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const accountIds: number[] = Array.isArray(body.accountIds)
      ? body.accountIds.map((n: unknown) => Number(n)).filter(Boolean)
      : [];

    if (accountIds.length === 0) {
      return NextResponse.json({ processed: 0, errors: [] });
    }

    await ensureSchema();
    const pool = getPool();

    const ph = accountIds.map(() => "?").join(",");
    const [accounts] = await pool.query(
      `SELECT id, game_name, tag_line, puuid, last_match_id,
              solo_tier, solo_rank, solo_lp, member_id, last_synced_at
       FROM accounts WHERE id IN (${ph})`,
      accountIds
    ) as [any[], any];

    const [allAccounts] = await pool.query(
      `SELECT id, puuid, member_id FROM accounts WHERE puuid IS NOT NULL`
    ) as [any[], any];
    const allPuuidToAccount = new Map<string, any>();
    for (const a of allAccounts) {
      if (a.puuid) allPuuidToAccount.set(a.puuid, a);
    }

    const oneMonthStart = Math.floor(Date.now() / 1000) - ONE_MONTH_SEC;
    let processed = 0;
    let rateLimited = false;
    const errors: string[] = [];

    for (const acc of accounts) {
      try {
        if (acc.last_synced_at) {
          const lastSync = new Date(acc.last_synced_at).getTime();
          if (Date.now() - lastSync < 24 * 60 * 60 * 1000) {
            processed++;
            continue;
          }
        }

        let puuid = acc.puuid;
        if (!puuid) {
          const a = await getAccountByRiotId(acc.game_name, acc.tag_line);
          puuid = a.puuid;
          await pool.query("UPDATE accounts SET puuid = ? WHERE id = ?", [puuid, acc.id]);
        }

        try {
          const entries = await getLeagueEntries(puuid);
          const solo = entries.find((e: any) => e.queueType === "RANKED_SOLO_5x5");
          if (solo) {
            const stored = acc.solo_tier && acc.solo_rank
              ? { tier: acc.solo_tier, rank: acc.solo_rank, lp: acc.solo_lp }
              : null;
            const best = higherTier(stored, { tier: solo.tier, rank: solo.rank, lp: solo.leaguePoints });
            if (best && (best.tier !== acc.solo_tier || best.rank !== acc.solo_rank || best.lp !== acc.solo_lp)) {
              await pool.query(
                "UPDATE accounts SET solo_tier = ?, solo_rank = ?, solo_lp = ? WHERE id = ?",
                [best.tier, best.rank, best.lp, acc.id]
              );
            }
          }
        } catch {}

        const allIds = await getMatchIds(puuid, 100, oneMonthStart);
        const games2w = allIds.length;
        const newest = allIds[0] ?? acc.last_match_id;

        if (acc.last_match_id == null) {
          await pool.query(
            `UPDATE accounts SET games_2w = ?, last_match_id = ?, last_synced_at = NOW() WHERE id = ?`,
            [games2w, newest, acc.id]
          );
          processed++;
          continue;
        }

        const marker = matchNum(acc.last_match_id);
        const newTotal = allIds.filter((id: string) => matchNum(id) > marker).length;

        await pool.query(
          `UPDATE accounts
           SET games_total = games_total + ?, games_2w = ?,
               last_match_id = ?, last_synced_at = NOW()
           WHERE id = ?`,
          [newTotal, games2w, newest, acc.id]
        );
        processed++;

        const recentMatches = allIds.slice(0, 10);
        for (const matchId of recentMatches) {
          try {
            const matchData = await getMatch(matchId);
            const myParticipant = matchData.info.participants.find((p: any) => p.puuid === puuid);
            if (!myParticipant) continue;

            const teammates = matchData.info.participants.filter(
              (p: any) => p.puuid !== puuid && p.teamId === myParticipant.teamId && allPuuidToAccount.has(p.puuid)
            );

            for (const teammate of teammates) {
              const teammateAcc = allPuuidToAccount.get(teammate.puuid);
              if (!teammateAcc || acc.member_id === teammateAcc.member_id) continue;
              await pool.query(
                `INSERT IGNORE INTO played_with (member_id, with_member_id, match_id, win) VALUES (?, ?, ?, ?)`,
                [acc.member_id, teammateAcc.member_id, matchId, myParticipant.win ? 1 : 0]
              );
            }
          } catch {}
        }
      } catch (e) {
        const label = `${acc.game_name}#${acc.tag_line}`;
        if (e instanceof RiotApiError && e.status === 429) {
          rateLimited = true;
          errors.push(`${label}: 요청 한도 초과로 중단`);
          break;
        }
        errors.push(`${label}: 갱신 실패`);
      }
    }

    return NextResponse.json({ processed, rateLimited, errors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "동기화 실패" }, { status: 500 });
  }
}
