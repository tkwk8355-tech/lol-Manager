import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { higherTier, type TierInfo } from "@/lib/scrim";
import { requireAuth } from "@/lib/auth";

// GET 핸들러가 request 객체를 받지 않으면 Next.js가 프로덕션 빌드에서
// 이 응답을 정적으로 캐싱해버려, DB가 바뀌어도(삭제/추가) 계속 옛 데이터를
// 반환하는 문제가 있었다. 매 요청마다 새로 실행되도록 강제한다.
export const dynamic = "force-dynamic";

// 클랜원 명단(이름/티어/계정 정보)은 클랜 내부 정보이므로 로그인해야 조회 가능하다.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT m.id AS member_id, m.nickname, m.memo, m.birth_year, m.main_line, m.sub_line,
             a.id AS account_id, a.game_name, a.tag_line, a.is_main,
             a.puuid, a.games_total, a.games_2w, a.last_synced_at,
             a.solo_tier, a.solo_rank, a.solo_lp
      FROM members m
      LEFT JOIN accounts a ON a.member_id = m.id
      ORDER BY m.nickname ASC, a.is_main DESC, a.id ASC
    `) as [any[], any];

    const map = new Map<number, any>();
    const mainTier = new Map<number, TierInfo | null>();
    const bestTier = new Map<number, TierInfo | null>();

    for (const r of rows) {
      if (!map.has(r.member_id)) {
        map.set(r.member_id, {
          id: r.member_id,
          nickname: r.nickname,
          memo: r.memo,
          birthYear: r.birth_year,
          mainLine: r.main_line,
          subLine: r.sub_line,
          accounts: [],
          gamesTotal: 0,
          games2w: 0,
          tier: null as TierInfo | null,
        });
      }
      const m = map.get(r.member_id);
      if (r.account_id) {
        const gt = r.games_total ?? 0;
        const g2 = r.games_2w ?? 0;
        const accTier: TierInfo | null = r.solo_tier
          ? { tier: r.solo_tier, rank: r.solo_rank || "I", lp: r.solo_lp || 0 }
          : null;
        m.accounts.push({
          id: r.account_id,
          gameName: r.game_name,
          tagLine: r.tag_line,
          isMain: !!r.is_main,
          hasPuuid: !!r.puuid,
          gamesTotal: gt,
          games2w: g2,
          lastSyncedAt: r.last_synced_at ?? null,
          tier: accTier,
        });
        m.gamesTotal += gt;
        m.games2w += g2;

        if (r.is_main && accTier && !mainTier.get(r.member_id)) {
          mainTier.set(r.member_id, accTier);
        }
        bestTier.set(r.member_id, higherTier(bestTier.get(r.member_id) ?? null, accTier));
      }
    }

    for (const [id, m] of map) {
      m.tier = mainTier.get(id) ?? bestTier.get(id) ?? null;
    }

    return NextResponse.json({ members: [...map.values()] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB 조회 실패" }, { status: 500 });
  }
}
