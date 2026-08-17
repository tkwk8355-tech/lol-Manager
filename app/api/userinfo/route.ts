import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { higherTier, type TierInfo } from "@/lib/scrim";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT m.id AS member_id, m.nickname AS member_nickname, m.memo, m.birth_date, m.birth_year, m.gender,
             m.main_line, m.sub_line, m.position, m.status, m.status_note,
             m.total_points, m.created_at AS member_created_at,
             a.id AS account_id, a.game_name, a.tag_line, a.is_main,
             a.puuid, a.games_total, a.games_2w, a.last_synced_at,
             a.solo_tier, a.solo_rank, a.solo_lp
      FROM members m
      LEFT JOIN accounts a ON a.member_id = m.id
      ORDER BY m.id ASC, a.is_main DESC, a.id ASC
    `) as [any[], any];

    // 2주간 파티 참여 게임수 (party_participant_history + point_logs.games 기반)
    // aram: games 합산, normal/flex/solo: 파티 참여 횟수(games 합산)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [partyRows] = await pool.query(`
      SELECT pl.member_id,
             SUM(CASE WHEN pl.type = 'aram' THEN pl.games ELSE 0 END) AS aram_games,
             SUM(CASE WHEN pl.type IN ('normal','flex','solo') THEN pl.games ELSE 0 END) AS normal_games
      FROM point_logs pl
      WHERE pl.type IN ('aram','normal','flex','solo') AND DATE(pl.created_at) >= ?
      GROUP BY pl.member_id
    `, [twoWeeksAgo]) as [any[], any];
    const partyGames = new Map<number, { aram: number; normal: number }>();
    for (const r of partyRows) {
      partyGames.set(r.member_id, { aram: Number(r.aram_games), normal: Number(r.normal_games) });
    }

    const [warnRows] = await pool.query(
      `SELECT member_id, COUNT(*) AS cnt FROM warnings GROUP BY member_id`
    ) as [any[], any];
    const warnCount = new Map<number, number>();
    for (const w of warnRows) warnCount.set(w.member_id, Number(w.cnt));

    // 수습 파티 참여 카운트 + 로그 상세
    const [rookieRows] = await pool.query(`
      SELECT pl.member_id, pl.games, pl.party_count, pl.comment, pl.created_at, pl.ref_id, p.start_at, p.mode
      FROM point_logs pl
      LEFT JOIN parties p ON p.id = pl.ref_id
      WHERE pl.type = 'rookie_session'
      ORDER BY pl.created_at ASC
    `) as [any[], any];

    // 수습별 파티에서 같이 있었던 클랜원 목록
    // 수습 본인이 히스토리에 찍힌 스냅샷 시각과 동일한 시각의 클랜원만 포함
    // (수습이 파티에서 빠진 이후 스냅샷은 제외)
    const partyIds = [...new Set(rookieRows.map((r: any) => r.ref_id).filter(Boolean))];
    // key: "partyId_rookieMemberId" -> Set<nickname>
    const partyRookieMembersMap = new Map<string, Set<string>>();
    if (partyIds.length > 0) {
      const ph = partyIds.map(() => "?").join(",");
      // 수습별 파티 내 모든 스냅샷 시각 조회
      const [rookieSnapRows] = await pool.query(
        `SELECT pph.party_id, m.id AS rookie_member_id, pph.added_at
         FROM party_participant_history pph
         JOIN accounts a ON a.game_name = pph.nickname AND a.is_main = 1
         JOIN members m ON m.id = a.member_id AND m.position = '수습'
         WHERE pph.party_id IN (${ph})`,
        partyIds
      ) as [any[], any];
      // 수습별 스냅샷 시각 목록
      const snapTimesMap = new Map<string, string[]>();
      for (const sr of rookieSnapRows) {
        const key = `${sr.party_id}_${sr.rookie_member_id}`;
        if (!snapTimesMap.has(key)) snapTimesMap.set(key, []);
        snapTimesMap.get(key)!.push(sr.added_at);
      }
      // 각 스냅샷 시각에 함께 있던 클랜원 수집
      for (const [key, snapTimes] of snapTimesMap) {
        const partyId = Number(key.split('_')[0]);
        const memberSet = new Set<string>();
        for (const snapAt of snapTimes) {
          const [clanRows] = await pool.query(
            `SELECT DISTINCT pph.nickname
             FROM party_participant_history pph
             JOIN accounts a ON a.game_name = pph.nickname AND a.is_main = 1
             JOIN members m ON m.id = a.member_id AND m.position IN ('클랜원', '운영진', '부운영진')
             WHERE pph.party_id = ? AND pph.added_at = ?`,
            [partyId, snapAt]
          ) as [any[], any];
          clanRows.forEach((cr: any) => memberSet.add(cr.nickname));
        }
        partyRookieMembersMap.set(key, memberSet);
      }
    }

    const rookiePartyCount = new Map<number, number>();
    const rookieSessionLogs = new Map<number, any[]>();
    const rookieAllMembers = new Map<number, Set<string>>();
    for (const r of rookieRows) {
      const mid = r.member_id;
      rookiePartyCount.set(mid, (rookiePartyCount.get(mid) ?? 0) + Number(r.party_count));
      if (!rookieSessionLogs.has(mid)) rookieSessionLogs.set(mid, []);
      if (!rookieAllMembers.has(mid)) rookieAllMembers.set(mid, new Set());
      rookieSessionLogs.get(mid)!.push({
        games: Number(r.games),
        partyCount: Number(r.party_count),
        comment: r.comment,
        date: (r.start_at ?? r.created_at ?? "").slice(0, 10),
        startAt: (r.start_at ?? r.created_at ?? "").slice(0, 16).replace("T", " "),
        mode: r.mode ?? "flex",
        refId: r.ref_id,
        rookieMemberId: mid,
      });
    }

    const map = new Map<number, any>();
    const mainTier = new Map<number, TierInfo | null>();
    const bestTier = new Map<number, TierInfo | null>();

    for (const r of rows) {
      if (!map.has(r.member_id)) {
        map.set(r.member_id, {
          id: r.member_id,
          nickname: "",       // 본계정 game_name으로 채움
          displayName: "",    // 본계정 game_name#tagLine
          _memberNickname: r.member_nickname ?? null,  // 계정 없을 때 fallback
          memo: r.memo,
          birthDate: r.birth_date ?? null,
          birthYear: r.birth_year ?? null,
          gender: r.gender ?? null,
          mainLine: r.main_line,
          subLine: r.sub_line,
          position: r.position ?? "클랜원",
          status: r.status ?? "active",
          statusNote: r.status_note ?? null,
          totalPoints: r.total_points ?? 0,
          createdAt: r.member_created_at ?? null,
          warningCount: 0,
          rookiePartyCount: 0,
          accounts: [],
          gamesTotal: 0,
          games2w: 0,
          aramGames2w: 0,
          normalGames2w: 0,
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

        // 본계정 game_name을 표시명으로 사용
        if (r.is_main && !m.nickname) {
          m.nickname = r.game_name;
          m.displayName = `${r.game_name}#${r.tag_line}`;
        }
        if (r.is_main && accTier && !mainTier.has(r.member_id)) {
          mainTier.set(r.member_id, accTier);
        }
        bestTier.set(r.member_id, higherTier(bestTier.get(r.member_id) ?? null, accTier));
      }
    }

    for (const [id, m] of map) {
      m.tier = mainTier.get(id) ?? bestTier.get(id) ?? null;
      m.warningCount = warnCount.get(id) ?? 0;
      m.rookiePartyCount = rookiePartyCount.get(id) ?? 0;
      const allMembers = new Set<string>();
      const logs = rookieSessionLogs.get(id) ?? [];
      for (const log of logs) {
        const key = `${log.refId}_${log.rookieMemberId}`;
        (partyRookieMembersMap.get(key) ?? new Set()).forEach((n: string) => allMembers.add(n));
        log.members = [...allMembers];
        delete log.refId;
        delete log.rookieMemberId;
      }
      m.rookieSessionLogs = logs;
      const pg = partyGames.get(id);
      m.aramGames2w = pg?.aram ?? 0;
      m.normalGames2w = pg?.normal ?? 0;
      // 판수미달: 칼바람 4판 미만 AND 협곡(클랜원+자유+솔로) 3판 미만
      m.games2w = (pg?.aram ?? 0) + (pg?.normal ?? 0);
      // 본계정이 없으면 첫 번째 계정 이름 사용, 계정도 없으면 members.nickname 사용
      if (!m.nickname) {
        m.nickname = m.accounts[0]?.gameName ?? m._memberNickname ?? `클랜원#${id}`;
        m.displayName = m.accounts[0]
          ? `${m.accounts[0].gameName}#${m.accounts[0].tagLine}`
          : m._memberNickname ?? `클랜원#${id}`;
      }
      delete m._memberNickname;
    }

    // 본계정 game_name 기준 가나다/알파벳 정렬
    const sorted = [...map.values()].sort((a, b) =>
      a.nickname.localeCompare(b.nickname, "ko")
    );
    return NextResponse.json({ members: sorted });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "DB 조회 실패" }, { status: 500 });
  }
}
