import mysql from "mysql2/promise";
import { getPool, ensureSchema } from "@/lib/db";
import { getAccountByRiotId, getMatchIds, getMatch, RiotApiError } from "@/lib/riot";
import { givePoints } from "@/lib/points";
import { pickMvpIds } from "@/lib/scrim";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function kstDateTimeString(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function syncScrimMatches(memberId: number, startAt: string, givenByUserId: number) {
  const startMs = new Date(startAt).getTime();
  if (!Number.isFinite(startMs)) throw new Error("시작 시각 형식이 올바르지 않습니다.");
  const endMs = startMs + ONE_DAY_MS;
  const startSec = Math.floor(startMs / 1000);

  await ensureSchema();
  const pool = getPool();

  const [accounts] = await pool.query(
    "SELECT id, game_name, tag_line, puuid FROM accounts WHERE member_id = ?",
    [memberId]
  ) as [any[], any];
  if (accounts.length === 0) throw new Error("이 클랜원은 등록된 계정이 없습니다.");

  const [allAccounts] = await pool.query("SELECT member_id, game_name, tag_line FROM accounts") as [any[], any];
  const memberByRiotId = new Map<string, number>();
  for (const a of allAccounts) {
    memberByRiotId.set(`${a.game_name}#${a.tag_line}`.toLowerCase(), a.member_id);
  }
  const [memberRows] = await pool.query("SELECT id, nickname, position FROM members") as [any[], any];
  const nicknameByMemberId = new Map<number, string>(memberRows.map((m: any) => [m.id, m.nickname]));
  const isRookieByMemberId = new Map<number, boolean>(memberRows.map((m: any) => [m.id, m.position === "수습"]));

  const errors: string[] = [];
  let addedMatches = 0, skippedDuplicate = 0, skippedNoCustom = 0;

  for (const acc of accounts) {
    let puuid = acc.puuid;
    try {
      if (!puuid) {
        const a = await getAccountByRiotId(acc.game_name, acc.tag_line);
        puuid = a.puuid;
        await pool.query("UPDATE accounts SET puuid = ? WHERE id = ?", [puuid, acc.id]);
      }
    } catch {
      errors.push(`${acc.game_name}#${acc.tag_line}: 계정 조회 실패`);
      continue;
    }

    let matchIds: string[] = [];
    try {
      matchIds = await getMatchIds(puuid, 100, startSec);
    } catch (e) {
      if (e instanceof RiotApiError && e.status === 429) {
        errors.push("요청 한도 초과로 중단되었습니다.");
        break;
      }
      errors.push(`${acc.game_name}#${acc.tag_line}: 전적 조회 실패`);
      continue;
    }

    for (const matchId of matchIds) {
      try {
        const [dupRows] = await pool.query("SELECT id FROM scrim_matches WHERE riot_match_id = ?", [matchId]) as [any[], any];
        if (dupRows.length > 0) { skippedDuplicate++; continue; }

        const match = await getMatch(matchId);
        const info = match.info;
        if (info.gameCreation < startMs || info.gameCreation > endMs) continue;
        if (info.gameType !== "CUSTOM_GAME") { skippedNoCustom++; continue; }

        const matched = info.participants
          .map((p: any) => {
            const riotId = `${p.riotIdGameName}#${p.riotIdTagline}`.toLowerCase();
            const mId = memberByRiotId.get(riotId);
            if (!mId) return null;
            return { p, memberId: mId };
          })
          .filter((x: any): x is { p: any; memberId: number } => x !== null);

        if (matched.length === 0) continue;

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const winnerTeam = matched.some((m: any) => m.p.teamId === 100 && m.p.win) ? 1
            : matched.some((m: any) => m.p.teamId === 200 && m.p.win) ? 2 : 0;

          const [res] = await conn.query(
            `INSERT INTO scrim_matches (mode, status, winner_team, note, played_at, riot_match_id) VALUES ('rift', 'done', ?, ?, ?, ?)`,
            [winnerTeam, "자동 동기화", new Date(info.gameCreation), matchId]
          ) as any;
          const newMatchId = res.insertId;

          for (const { p, memberId: mId } of matched) {
            const team = p.teamId === 100 ? 1 : 2;
            const line = p.teamPosition === "TOP" ? "TOP" : p.teamPosition === "JUNGLE" ? "JG"
              : p.teamPosition === "MIDDLE" ? "MID" : p.teamPosition === "BOTTOM" ? "ADC"
              : p.teamPosition === "UTILITY" ? "SUP" : null;
            await conn.query(
              `INSERT INTO scrim_participants (match_id, member_id, team, line, champion, kills, deaths, assists, damage, item0, item1, item2, item3, item4, item5, item6, vision_score, cs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [newMatchId, mId, team, line, p.championName, p.kills, p.deaths, p.assists, p.totalDamageDealtToChampions, p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6, p.visionScore, (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)]
            );
          }

          const mvpParticipants = matched.map(({ p, memberId: mId }: any) => ({
            memberId: mId, team: p.teamId === 100 ? 1 : 2, line: p.teamPosition || null,
            kills: p.kills, deaths: p.deaths, assists: p.assists,
            damage: p.totalDamageDealtToChampions,
            cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
          }));
          const { mvp1, mvp2 } = pickMvpIds(mvpParticipants, winnerTeam);
          for (const mvpId of [mvp1, mvp2]) {
            if (!mvpId) continue;
            await conn.query(`UPDATE scrim_participants SET is_mvp = 1 WHERE match_id = ? AND member_id = ?`, [newMatchId, mvpId]);
          }

          for (const { p, memberId: mId } of matched) {
            const isWin = p.win;
            const isMvp = mId === mvp1 || mId === mvp2;
            const delta = isWin ? (isMvp ? 20 : 10) : (isMvp ? 0 : -10);
            await conn.query(`UPDATE scrim_ratings SET mmr = GREATEST(0, mmr + ?), updated_at = NOW() WHERE member_id = ?`, [delta, mId]);
            const [ratingRows] = await conn.query(`SELECT mmr FROM scrim_ratings WHERE member_id = ?`, [mId]) as [any[], any];
            await conn.query(`INSERT INTO scrim_mmr_logs (member_id, match_id, delta, mmr_after) VALUES (?, ?, ?, ?)`, [mId, newMatchId, delta, ratingRows[0]?.mmr ?? 0]);
          }

          await conn.commit();
          addedMatches++;

          const windowStart = kstDateTimeString(startMs);
          const windowEnd = kstDateTimeString(endMs);
          const startLabel = kstDateTimeString(startMs).slice(5, 11);
          for (const { memberId: mId } of matched) {
            const isRookie = isRookieByMemberId.get(mId) === true;
            const checkType = isRookie ? "rookie_session" : "scrim";
            const [alreadyRows] = await pool.query(`SELECT id FROM point_logs WHERE member_id = ? AND type = ? AND ref_id = ? AND ref_table = 'scrim_match'`, [mId, checkType, newMatchId]) as [any[], any];
            if (alreadyRows.length > 0) continue;
            const withMembers = matched.filter((x: any) => x.memberId !== mId).map((x: any) => nicknameByMemberId.get(x.memberId)!).filter(Boolean).join(",") || null;
            if (isRookie) {
              const [windowGamesRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM point_logs pl JOIN scrim_matches sm ON sm.id = pl.ref_id AND pl.ref_table = 'scrim_match' WHERE pl.member_id = ? AND pl.type = 'rookie_session' AND sm.played_at >= ? AND sm.played_at < ?`, [mId, windowStart, windowEnd]) as [any[], any];
              const prevWindowGames = Number(windowGamesRows[0]?.cnt ?? 0);
              const partyCount = Math.ceil((prevWindowGames + 1) / 3) - Math.ceil(prevWindowGames / 3);
              await givePoints(pool, mId, 0, "rookie_session", 1, `내전 참여 (${startLabel})`, givenByUserId, newMatchId, partyCount, null, "scrim_match", withMembers);
            } else {
              const [dayDupRows] = await pool.query(`SELECT pl.id FROM point_logs pl JOIN scrim_matches sm ON sm.id = pl.ref_id AND pl.ref_table = 'scrim_match' WHERE pl.member_id = ? AND pl.type = 'scrim' AND sm.played_at >= ? AND sm.played_at < ?`, [mId, windowStart, windowEnd]) as [any[], any];
              if (dayDupRows.length > 0) continue;
              await givePoints(pool, mId, 30, "scrim", 1, `내전 참여 (${startLabel})`, givenByUserId, newMatchId, 0, null, "scrim_match", withMembers);
            }
          }
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
      } catch {
        errors.push(`매치 ${matchId} 처리 실패`);
      }
    }
  }

  return { ok: true, addedMatches, skippedDuplicate, skippedNoCustom, errors, memberNickname: nicknameByMemberId.get(memberId) ?? null };
}
