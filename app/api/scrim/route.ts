import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { tierBaseScore, winRateAdjust, mmrToScrimTier, SCRIM_TIER_KO } from "@/lib/scrim";

export const dynamic = "force-dynamic";

const TIER_ORDER = ["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"];
const RANK_ORDER: Record<string,number> = { IV:0, III:1, II:2, I:3 };

function tierScore(tier: string|null, rank: string|null, lp: number) {
  if (!tier) return -1;
  return TIER_ORDER.indexOf(tier) * 400 + (RANK_ORDER[rank ?? "IV"] ?? 0) * 100 + (lp ?? 0);
}

export async function GET() {
  try {
    await ensureSchema();
    const pool = getPool();

    // scrim_only 계정(내전관람 등)은 통계에서 제외
    const [members] = await pool.query(
      `SELECT m.id, m.nickname FROM members m
       WHERE (m.main_line != 'ARAM' OR m.main_line IS NULL)
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.member_id = m.id AND u.scrim_only = 1)
       ORDER BY m.nickname ASC`
    ) as [any[], any];

    const [accTiers] = await pool.query(
      `SELECT member_id, is_main, solo_tier, solo_rank, solo_lp FROM accounts ORDER BY is_main DESC, id ASC`
    ) as [any[], any];

    const tierByMember = new Map<number, { tier:string; rank:string; lp:number } | null>();
    const mainSeen = new Set<number>();
    for (const a of accTiers) {
      const cur = a.solo_tier ? { tier: a.solo_tier, rank: a.solo_rank||"I", lp: a.solo_lp||0 } : null;
      if (a.is_main && !mainSeen.has(a.member_id)) {
        mainSeen.add(a.member_id);
        tierByMember.set(a.member_id, cur);
        continue;
      }
      if (mainSeen.has(a.member_id)) continue;
      const prev = tierByMember.get(a.member_id) ?? null;
      tierByMember.set(a.member_id,
        tierScore(cur?.tier??null, cur?.rank??null, cur?.lp??0) > tierScore(prev?.tier??null, prev?.rank??null, prev?.lp??0) ? cur : prev
      );
    }

    const [ratingRows] = await pool.query(
      `SELECT member_id, mmr FROM scrim_ratings`
    ) as [any[], any];
    const ratingMap = new Map<number, number>(ratingRows.map((r: any) => [r.member_id, r.mmr]));

    const [parts] = await pool.query(
      `SELECT p.member_id, p.line, p.champion, p.kills, p.deaths, p.assists,
              IF(m.winner_team > 0 AND p.team = m.winner_team, 1, 0) AS win
       FROM scrim_participants p
       JOIN scrim_matches m ON m.id = p.match_id WHERE m.status = 'done'`
    ) as [any[], any];

    // MVP 횟수 (scrim_mvp 타입 point_logs)
    const [mvpRows] = await pool.query(
      `SELECT member_id, COUNT(*) AS cnt FROM point_logs WHERE type = 'scrim_mvp' GROUP BY member_id`
    ) as [any[], any];
    const mvpCountByMember = new Map<number, number>(mvpRows.map((r: any) => [r.member_id, Number(r.cnt)]));

    const LINES = ["TOP","JG","MID","ADC","SUP"];
    const emptyLineStats = () => Object.fromEntries(LINES.map((l) => [l, {games:0,kills:0,deaths:0,assists:0}]));
    const emptyLineChamps = () => Object.fromEntries(LINES.map((l) => [l, new Map<string,number>()]));

    const statMap = new Map<number, {
      lineStats: Record<string,{games:number;kills:number;deaths:number;assists:number}>;
      lineChamps: Record<string, Map<string,number>>;
      kills:number; deaths:number; assists:number; games:number; wins:number;
    }>();
    for (const p of parts) {
      if (!statMap.has(p.member_id)) statMap.set(p.member_id, {
        lineStats: emptyLineStats(), lineChamps: emptyLineChamps(),
        kills:0, deaths:0, assists:0, games:0, wins:0
      });
      const s = statMap.get(p.member_id)!;
      const line = (p.line ?? "").toUpperCase();
      if (LINES.includes(line)) {
        s.lineStats[line].games++;
        s.lineStats[line].kills += p.kills;
        s.lineStats[line].deaths += p.deaths;
        s.lineStats[line].assists += p.assists;
        if (p.champion) {
          const cm = s.lineChamps[line];
          cm.set(p.champion, (cm.get(p.champion) ?? 0) + 1);
        }
      }
      s.kills += p.kills; s.deaths += p.deaths; s.assists += p.assists; s.games++;
      if (p.win === 1) s.wins++;
    }

    const players = members.map((m) => {
      const t = tierByMember.get(m.id) ?? null;
      const s = statMap.get(m.id) ?? {
        lineStats: emptyLineStats(), lineChamps: emptyLineChamps(),
        kills:0, deaths:0, assists:0, games:0, wins:0
      };
      const lineCounts = Object.fromEntries(LINES.map((l) => [l, s.lineStats[l].games]));
      const lineChamps = Object.fromEntries(LINES.map((l) => [
        l,
        [...s.lineChamps[l].entries()].sort((a,b) => b[1]-a[1]).slice(0,3).map(([id,count]) => ({id,count})),
      ]));
      const kda = s.games > 0 ? ((s.kills + s.assists) / Math.max(s.deaths, 1)).toFixed(2) : null;
      const winRate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : null;
      const mvpCount = mvpCountByMember.get(m.id) ?? 0;
      const base = tierBaseScore(t?.tier, t?.lp);
      const adjust = winRateAdjust(s.wins, s.games);
      const scrimScore = base + adjust;
      return {
        memberId: m.id, nickname: m.nickname,
        tier: t?.tier ?? null, rank: t?.rank ?? null, lp: t?.lp ?? 0,
        lineCounts, lineStats: s.lineStats, lineChamps, kills: s.kills, deaths: s.deaths, assists: s.assists, games: s.games, wins: s.wins, kda, winRate,
        mvpCount, scrimScore,
        scrimMmr: ratingMap.has(m.id) ? ratingMap.get(m.id)! : null,
        scrimTier: ratingMap.has(m.id) ? SCRIM_TIER_KO[mmrToScrimTier(ratingMap.get(m.id)!)] : null,
      };
    });

    players.sort((a, b) => b.games - a.games || a.nickname.localeCompare(b.nickname));
    return NextResponse.json({ players });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "내전 통계 조회 실패" }, { status: 500 });
  }
}
