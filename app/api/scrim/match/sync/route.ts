import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getAccountByRiotId, getMatchIds, getMatch, RiotApiError } from "@/lib/riot";

// POST /api/scrim/match/sync
// 클랜원 한 명(memberId)의 등록된 계정으로 Riot 전적을 조회해서,
// 입력한 시작 시각부터 24시간 이내에 진행된 "커스텀 게임"만 찾아
// scrim_matches / scrim_participants에 자동으로 채워 넣는다.
// - 참가자 10명 중 클랜원 계정(accounts.game_name/tag_line)으로 등록되지 않은 사람은 제외한다.
// - 이미 동기화된 경기(riot_match_id 중복)는 다시 넣지 않는다.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const memberId = Number(body.memberId);
    const startAt: string | null = body.startAt ? String(body.startAt) : null;

    if (!memberId) return NextResponse.json({ error: "클랜원을 선택하세요." }, { status: 400 });
    if (!startAt) return NextResponse.json({ error: "시작 시각을 입력하세요." }, { status: 400 });

    const startMs = new Date(startAt).getTime();
    if (!Number.isFinite(startMs)) {
      return NextResponse.json({ error: "시작 시각 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const endMs = startMs + ONE_DAY_MS;
    const startSec = Math.floor(startMs / 1000);

    await ensureSchema();
    const pool = getPool();

    // 1) 이 클랜원의 계정(들) 조회 — puuid가 없으면 Riot ID로 조회해서 채운다.
    const [accounts] = await pool.query(
      "SELECT id, game_name, tag_line, puuid FROM accounts WHERE member_id = ?",
      [memberId]
    ) as [any[], any];
    if (accounts.length === 0) {
      return NextResponse.json({ error: "이 클랜원은 등록된 계정이 없습니다." }, { status: 400 });
    }

    // 2) 클랜 전체 계정 목록(Riot ID -> memberId 매칭용). 매치 참가자 10명 중
    //    클랜원으로 등록된 사람만 골라내기 위해 필요하다.
    const [allAccounts] = await pool.query(
      "SELECT member_id, game_name, tag_line FROM accounts"
    ) as [any[], any];
    const memberByRiotId = new Map<string, number>();
    for (const a of allAccounts) {
      memberByRiotId.set(`${a.game_name}#${a.tag_line}`.toLowerCase(), a.member_id);
    }
    const [memberRows] = await pool.query("SELECT id, nickname FROM members") as [any[], any];
    const nicknameByMemberId = new Map<number, string>(memberRows.map((m: any) => [m.id, m.nickname]));

    const errors: string[] = [];
    let addedMatches = 0;
    let skippedDuplicate = 0;
    let skippedNoCustom = 0;

    // 이 클랜원의 puuid부터 확보(계정이 여러 개면 전부 시도).
    for (const acc of accounts) {
      let puuid = acc.puuid;
      try {
        if (!puuid) {
          const a = await getAccountByRiotId(acc.game_name, acc.tag_line);
          puuid = a.puuid;
          await pool.query("UPDATE accounts SET puuid = ? WHERE id = ?", [puuid, acc.id]);
        }
      } catch (e) {
        errors.push(`${acc.game_name}#${acc.tag_line}: 계정 조회 실패`);
        continue;
      }

      let matchIds: string[] = [];
      try {
        matchIds = await getMatchIds(puuid, 100, startSec);
      } catch (e) {
        if (e instanceof RiotApiError && e.status === 429) {
          errors.push("요청 한도 초과로 중단되었습니다. 잠시 후 다시 시도하세요.");
          break;
        }
        errors.push(`${acc.game_name}#${acc.tag_line}: 전적 조회 실패`);
        continue;
      }

      for (const matchId of matchIds) {
        try {
          // 이미 동기화된 경기면 건너뛴다.
          const [dupRows] = await pool.query(
            "SELECT id FROM scrim_matches WHERE riot_match_id = ?",
            [matchId]
          ) as [any[], any];
          if (dupRows.length > 0) { skippedDuplicate++; continue; }

          const match = await getMatch(matchId);
          const info = match.info;

          // 시간 범위(시작~+24시간) 밖이면 건너뛴다. count 조회에서 startTime 이후만 오지만,
          // 상한(끝 시각)은 API가 못 걸러주므로 여기서 직접 확인한다.
          if (info.gameCreation < startMs || info.gameCreation > endMs) continue;

          // 커스텀 게임이 아니면 건너뛴다(랭크/일반 게임은 이 동기화 대상이 아님).
          if (info.gameType !== "CUSTOM_GAME") { skippedNoCustom++; continue; }

          // 참가자 중 클랜원으로 등록된 사람만 추린다.
          const matched = info.participants
            .map((p) => {
              const riotId = `${p.riotIdGameName}#${p.riotIdTagline}`.toLowerCase();
              const mId = memberByRiotId.get(riotId);
              if (!mId) return null;
              return { p, memberId: mId };
            })
            .filter((x): x is { p: typeof info.participants[number]; memberId: number } => x !== null);

          if (matched.length === 0) continue; // 클랜원이 아무도 없으면 등록하지 않는다.

          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            const winnerTeam = matched.some((m) => m.p.teamId === 100 && m.p.win) ? 1
              : matched.some((m) => m.p.teamId === 200 && m.p.win) ? 2 : 0;

            const [res] = await conn.query(
              `INSERT INTO scrim_matches (mode, status, winner_team, note, played_at, riot_match_id)
               VALUES ('rift', 'done', ?, ?, ?, ?)`,
              [winnerTeam, "자동 동기화", new Date(info.gameCreation), matchId]
            ) as any;
            const newMatchId = res.insertId;

            for (const { p, memberId: mId } of matched) {
              const team = p.teamId === 100 ? 1 : 2;
              const line = p.teamPosition === "TOP" ? "TOP"
                : p.teamPosition === "JUNGLE" ? "JG"
                : p.teamPosition === "MIDDLE" ? "MID"
                : p.teamPosition === "BOTTOM" ? "ADC"
                : p.teamPosition === "UTILITY" ? "SUP" : null;
              await conn.query(
                `INSERT INTO scrim_participants
                   (match_id, member_id, team, line, champion, kills, deaths, assists, damage,
                    item0, item1, item2, item3, item4, item5, item6)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  newMatchId, mId, team, line, p.championName,
                  p.kills, p.deaths, p.assists, p.totalDamageDealtToChampions,
                  p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
                ]
              );
            }
            await conn.commit();
            addedMatches++;
          } catch (err) {
            await conn.rollback();
            throw err;
          } finally {
            conn.release();
          }
        } catch (e) {
          errors.push(`매치 ${matchId} 처리 실패`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      addedMatches,
      skippedDuplicate,
      skippedNoCustom,
      errors,
      memberNickname: nicknameByMemberId.get(memberId) ?? null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "동기화 실패" }, { status: 500 });
  }
}
