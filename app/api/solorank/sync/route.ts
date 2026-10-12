import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getMatchIds, getMatch } from "@/lib/riot";

export const dynamic = "force-dynamic";

function calcScore(results: boolean[]): { score: number; games: { win: boolean; bonus: number }[] } {
  let score = 0;
  let streak = 0;
  const games = results.map((win) => {
    let bonus = 0;
    if (win) {
      score += 1;
      streak += 1;
      if (streak === 5) bonus = 2;
      else if (streak === 3) bonus = 1;
      score += bonus;
    } else {
      score -= 1;
      streak = 0;
    }
    return { win, bonus };
  });
  return { score, games };
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const pool = getPool();
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { sessionId, teamNo } = await req.json();

  // 세션 start_at 조회
  const [sessionRows] = await pool.query(
    `SELECT start_at, total_games FROM solorank_sessions WHERE id=?`, [sessionId]
  ) as [any[], any];
  if (!sessionRows[0]) return NextResponse.json({ error: "세션 없음" }, { status: 404 });

  const startAt: string | null = sessionRows[0].start_at;
  const totalGames: number = sessionRows[0].total_games;
  const startTime = startAt ? Math.floor(new Date(startAt).getTime() / 1000) : undefined;
  console.log("[sync] start_at raw:", startAt, "| parsed epoch:", startTime, "| now epoch:", Math.floor(Date.now()/1000), "| diff(min):", startTime ? Math.round((startTime - Date.now()/1000)/60) : "N/A");

  // 해당 팀 참여자 조회
  const [participants] = await pool.query(
    `SELECT sp.member_id, m.nickname FROM solorank_participants sp
     JOIN members m ON m.id=sp.member_id
     WHERE sp.session_id=? AND sp.team=?`,
    [sessionId, teamNo]
  ) as [any[], any];

  if (!participants.length) return NextResponse.json({ error: "팀원 없음" }, { status: 404 });

  // 각 팀원의 main 계정 puuid 조회
  const results: any[] = [];
  for (const p of participants) {
    const [accRows] = await pool.query(
      `SELECT puuid, game_name, tag_line FROM accounts WHERE member_id=? AND is_main=1 LIMIT 1`,
      [p.member_id]
    ) as [any[], any];

    if (!accRows[0] || !accRows[0].puuid) {
      results.push({ memberId: p.member_id, nickname: p.nickname, error: "계정 미연동", games: [], score: 0 });
      continue;
    }

    try {
      const matchIds = await getMatchIds(accRows[0].puuid, totalGames, startTime, "ranked");
      // 솔로랭크(queueId=420)만 필터
      const soloIds: string[] = [];
      for (const mid of matchIds) {
        if (soloIds.length >= totalGames) break;
        try {
          const match = await getMatch(mid);
          if (match.info.queueId === 420) soloIds.push(mid);
        } catch { continue; }
      }

      const winResults: boolean[] = [];
      for (const mid of soloIds) {
        const match = await getMatch(mid);
        const me = match.info.participants.find(pp => pp.puuid === accRows[0].puuid);
        if (me) winResults.push(me.win);
      }

      // soloIds는 최신순 → 연승 계산은 오래된순으로
      const { score, games } = calcScore([...winResults].reverse());
      results.push({ memberId: p.member_id, nickname: p.nickname, score, games: games.reverse() });
    } catch {
      results.push({ memberId: p.member_id, nickname: p.nickname, error: "전적 조회 실패", games: [], score: 0 });
    }
  }

  return NextResponse.json({ results });
}
