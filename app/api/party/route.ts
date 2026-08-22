import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { getMatchIds, getMatch } from "@/lib/riot";
import { givePoints } from "@/lib/points";

export const dynamic = "force-dynamic";

const MODES = ["aram", "normal", "flex", "solo", "scrim"];

interface PartyRow {
  id: number;
  mode: string;
  max_size: number;
  status: string;
  host_user_id: number;
  host_nickname: string;
  note: string | null;
  start_at: string | null;
  created_at: string;
}
interface ParticipantRow {
  party_id: number;
  user_id: number | null;
  nickname: string;
  line: string | null;
  is_waiting: number;
}

function toKstString(val: string | Date | null): string | null {
  if (!val) return null;
  const ms = val instanceof Date ? val.getTime() : new Date(val).getTime();
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function shapeParty(p: PartyRow, participants: ParticipantRow[]) {
  return {
    id: p.id,
    mode: p.mode,
    maxSize: p.max_size,
    status: p.status,
    hostUserId: p.host_user_id,
    hostNickname: p.host_nickname,
    note: p.note,
    startAt: toKstString(p.start_at),
    createdAt: toKstString(p.created_at)!,
    participants: participants.filter((pp) => !pp.is_waiting).map((pp) => ({
      userId: pp.user_id,
      nickname: pp.nickname,
    })),
    waiting: [],
  };
}

// GET /api/party?mode=...
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const mode = new URL(req.url).searchParams.get("mode");
    if (!mode || (mode !== "all" && !MODES.includes(mode))) {
      return NextResponse.json({ error: "mode가 필요합니다." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();

    const [parties] = mode === "all"
      ? await pool.query(
          `SELECT id, mode, max_size, status, host_user_id, host_nickname, note, start_at, created_at
           FROM parties WHERE status != 'ended' ORDER BY COALESCE(start_at, created_at) ASC LIMIT 50`
        ) as [PartyRow[], any]
      : await pool.query(
          `SELECT id, mode, max_size, status, host_user_id, host_nickname, note, start_at, created_at
           FROM parties WHERE mode = ? AND status != 'ended' ORDER BY COALESCE(start_at, created_at) ASC LIMIT 50`,
          [mode]
        ) as [PartyRow[], any];

    if (parties.length === 0) return NextResponse.json({ parties: [] });

    const ids = parties.map((p) => p.id);
    const ph = ids.map(() => "?").join(",");
    const [participants] = await pool.query(
      `SELECT party_id, user_id, nickname, line, is_waiting FROM party_participants WHERE party_id IN (${ph})`,
      ids
    ) as [ParticipantRow[], any];

    const byParty = new Map<number, ParticipantRow[]>();
    for (const pp of participants) {
      if (!byParty.has(pp.party_id)) byParty.set(pp.party_id, []);
      byParty.get(pp.party_id)!.push(pp);
    }

    const result = parties.map((p) => shapeParty(p, byParty.get(p.id) ?? []));
    return NextResponse.json({ parties: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "파티 조회 실패" }, { status: 500 });
  }
}

// POST /api/party — 파티 생성 (운영진만)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin") {
    return NextResponse.json({ error: "운영진만 파티를 생성할 수 있습니다." }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode;
    const note: string | null = body.note ? String(body.note).trim().slice(0, 255) : null;
    const nicknames: string[] = Array.isArray(body.participants)
      ? body.participants.map((n: string) => String(n).trim()).filter(Boolean)
      : [];

    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: "모드를 선택하세요." }, { status: 400 });
    }

    let startAt: string | null = null;
    if (!body.startTime) {
      return NextResponse.json({ error: "시작 시간을 입력하세요." }, { status: 400 });
    }
    if (body.startTime) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(body.startTime).trim());
      if (!m) return NextResponse.json({ error: "시작 시간 형식이 올바르지 않습니다. (HH:mm)" }, { status: 400 });
      const hh = Number(m[1]), mm = Number(m[2]);
      if (hh > 23 || mm > 59) return NextResponse.json({ error: "시작 시간이 올바르지 않습니다." }, { status: 400 });
      const dateStr = body.startDate ? String(body.startDate).trim() : new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
      const p = (n: number) => String(n).padStart(2, "0");
      startAt = `${dateStr} ${p(hh)}:${p(mm)}:00`;

    }

    await ensureSchema();
    const pool = getPool();
    const { userId } = auth.session;
    const hostNickname = auth.session.nickname ?? "운영진";
    const maxSize = mode === "solo" ? 2 : 5;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.query(
        `INSERT INTO parties (mode, max_size, status, host_user_id, host_nickname, note, start_at)
         VALUES (?, ?, 'open', ?, ?, ?, ?)`,
        [mode, maxSize, userId, hostNickname, note, startAt]
      ) as any;
      const partyId = res.insertId;

      for (const nick of nicknames) {
        await conn.query(
          `INSERT INTO party_participants (party_id, user_id, nickname, line) VALUES (?, NULL, ?, NULL)`,
          [partyId, nick]
        );
        // 이력에도 기록
        await conn.query(
          `INSERT INTO party_participant_history (party_id, nickname) VALUES (?, ?)`,
          [partyId, nick]
        );
      }

      await conn.commit();
      return NextResponse.json({ id: partyId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "파티 생성 실패" }, { status: 500 });
  }
}

// PATCH /api/party — 파티 참가자 수정 (운영진만)
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin" && auth.session.role !== "subadmin") {
    return NextResponse.json({ error: "운영진만 수정할 수 있습니다." }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const partyId = Number(body.id);
    const nicknames: string[] = Array.isArray(body.participants)
      ? body.participants.map((n: string) => String(n).trim()).filter(Boolean)
      : [];
    if (!partyId) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();

    const [rows] = await pool.query("SELECT id, status FROM parties WHERE id = ?", [partyId]) as [any[], any];
    if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 파티입니다." }, { status: 404 });
    if (rows[0].status === "ended") return NextResponse.json({ error: "종료된 파티는 수정할 수 없습니다." }, { status: 400 });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 기존 참가자 조회
      const [prevRows] = await conn.query(
        "SELECT nickname FROM party_participants WHERE party_id = ? AND is_waiting = 0",
        [partyId]
      ) as [any[], any];
      const prevNicks = new Set(prevRows.map((r: any) => r.nickname));
      const newNicks = new Set(nicknames);
      const changed = prevNicks.size !== newNicks.size || nicknames.some(n => !prevNicks.has(n));

      // 기존 참가자 삭제 후 새 명단으로 교체
      await conn.query("DELETE FROM party_participants WHERE party_id = ?", [partyId]);
      for (const nick of nicknames) {
        await conn.query(
          `INSERT INTO party_participants (party_id, user_id, nickname, line) VALUES (?, NULL, ?, NULL)`,
          [partyId, nick]
        );
        // 명단이 실제로 바뀐 경우에만 history 기록
        if (changed) {
          await conn.query(
            `INSERT INTO party_participant_history (party_id, nickname) VALUES (?, ?)`,
            [partyId, nick]
          );
        }
      }

      await conn.commit();
      return NextResponse.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

// DELETE /api/party?id=1 — 파티 종료(펑), 운영진만
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    const games = Number(new URL(req.url).searchParams.get("games") ?? "-1");
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query("SELECT id, mode, created_at, start_at, note FROM parties WHERE id = ?", [id]) as [any[], any];
    if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 파티입니다." }, { status: 404 });
    const party = rows[0];

    await pool.query("UPDATE parties SET status = 'ended', ended_at = NOW() WHERE id = ?", [id]);

    // 펑을 누른 사람을 포인트 지급자로 남긴다.
    const givenBy = auth.session.userId;
    try {
      if (party.mode === "aram") {
        if (games >= 0) await awardAramPoints(pool, id, party, games, givenBy);
      } else {
        await awardPartyPoints(pool, id, party, givenBy);
      }
    } catch (e) {
      console.error("[points] 전적 조회 실패 (점수 미지급):", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}

// 칼바람 파티에 수습이 있는지 확인
async function checkHasRookie(pool: mysql.Pool, histRows: any[]): Promise<boolean> {
  for (const h of histRows) {
    const [mRows] = await pool.query(
      `SELECT m.position FROM members m JOIN accounts a ON a.member_id = m.id AND a.is_main = 1 AND a.game_name = ?`,
      [h.nickname]
    ) as [any[], any];
    if (mRows[0]?.position === '수습') return true;
  }
  return false;
}

// 어떤 파티 때문에 포인트를 받았는지 알 수 있도록, 파티 시작 시각(+메모)을 comment에 붙일 라벨을 만든다.
function toKstDateString(val: string | Date): string {
  const ms = typeof val === 'string' ? new Date(val).getTime() : val.getTime();
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function partyLabel(party: PartyRow): string {
  const raw = party.start_at ?? party.created_at;
  const dt = new Date(new Date(raw).getTime() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(5, 16);
  const notePart = party.note ? ` ${party.note}` : "";
  return ` (${dt}${notePart})`;
}

// 칼바람: 판수 입력 기반 점수 지급 (DB 설정 기반)
async function awardAramPoints(pool: mysql.Pool, partyId: number, party: PartyRow, games: number, givenBy: number) {
  const [settingRows] = await pool.query(`SELECT points, min_games FROM party_point_settings WHERE mode = 'aram'`) as [any[], any];
  const cfg = settingRows[0] ?? { points: 5, min_games: 4 };
  const points = Math.min(Math.floor(games / cfg.min_games) * cfg.points, cfg.points);

  const [histRows] = await pool.query(
    `SELECT DISTINCT nickname FROM party_participant_history WHERE party_id = ?`,
    [partyId]
  ) as [any[], any];
  if (histRows.length < 2) return;

  const hasRookie = await checkHasRookie(pool, histRows);

  for (const h of histRows) {
    const [mRows] = await pool.query(
      `SELECT m.id AS member_id, m.position FROM members m
       JOIN accounts a ON a.member_id = m.id AND a.is_main = 1 AND a.game_name = ?`,
      [h.nickname]
    ) as [any[], any];
    if (!mRows.length) continue;
    const memberId = mRows[0].member_id;
    const isRookie = mRows[0].position === '수습';
    if (isRookie) continue; // 칼바람은 수습 카운트 미적용, 로그 저장 안 함
    // 같은 날(KST 기준) 칼바람 포인트 중복 지급 방지
    const partyStartAt = party.start_at ?? party.created_at;
    const partyDate = toKstDateString(partyStartAt);
    const [already] = await pool.query(
      `SELECT pl.id FROM point_logs pl
       JOIN parties p ON p.id = pl.ref_id AND pl.ref_table = 'party'
       WHERE pl.member_id = ? AND pl.type = 'aram'
       AND DATE(COALESCE(p.start_at, p.created_at)) = ?`,
      [memberId, partyDate]
    ) as [any[], any];
    if (already.length > 0) { console.log(`[award] skip memberId=${memberId}: already got aram on ${partyDate}`); continue; }

    if (points <= 0 && !hasRookie) continue; // 판수미달 + 수습없으면 스킵

    let rookieBonus = 0;
    if (hasRookie) {
      const rookieMemberIds: number[] = [];
      for (const h2 of histRows) {
        const [rm] = await pool.query(
          `SELECT m.id FROM members m JOIN accounts a ON a.member_id = m.id AND a.is_main = 1 AND a.game_name = ? WHERE m.position = '수습'`,
          [h2.nickname]
        ) as [any[], any];
        if (rm[0]) rookieMemberIds.push(rm[0].id);
      }
      for (const rookieMemberId of rookieMemberIds) {
        const [bonusRows] = await pool.query(
          `SELECT id FROM rookie_bonus_log WHERE member_id = ? AND rookie_member_id = ?`,
          [memberId, rookieMemberId]
        ) as [any[], any];
        if (bonusRows.length === 0) { rookieBonus = 10; break; }
      }
      if (rookieBonus > 0) {
        for (const rookieMemberId of rookieMemberIds) {
          await pool.query(`INSERT IGNORE INTO rookie_bonus_log (member_id, rookie_member_id) VALUES (?, ?)`, [memberId, rookieMemberId]);
        }
      }
    }

    const finalPoints = points + rookieBonus;
    const comment = (points <= 0
      ? `칼바람 ${games}판 (수습 동반)`
      : rookieBonus > 0 ? `칼바람 ${games}판 (수습 동반)` : `칼바람 ${games}판`) + partyLabel(party);
    const withMembersAram = histRows.filter((x: any) => x.nickname !== h.nickname).map((x: any) => x.nickname).join(",") || null;
    await givePoints(pool, memberId, finalPoints, "aram", games, comment, givenBy, partyId, 0, null, "party", withMembersAram);
  }
}
async function awardPartyPoints(pool: mysql.Pool, partyId: number, party: PartyRow, givenBy: number) {
  const [settingRows] = await pool.query(`SELECT points, min_games FROM party_point_settings WHERE mode = ?`, [party.mode]) as [any[], any];
  const cfg = settingRows[0] ?? { points: party.mode === "solo" ? 5 : 5, min_games: 3 };
  const pointsToGive = cfg.points;
  const minGames = cfg.min_games;

  const [histRows] = await pool.query(
    `SELECT DISTINCT nickname FROM party_participant_history WHERE party_id = ?`,
    [partyId]
  ) as [any[], any];
  console.log(`[award] partyId=${partyId} mode=${party.mode} hist=${histRows.map((r:any)=>r.nickname).join(",")}`);
  if (histRows.length < 2) { console.log(`[award] skip: hist < 2`); return; }

  const memberData: { memberId: number; nickname: string; puuids: string[]; isRookie: boolean }[] = [];
  for (const h of histRows) {
    const [mRows] = await pool.query(
      `SELECT m.id AS member_id, m.position, a.puuid
       FROM members m
       JOIN accounts main_a ON main_a.member_id = m.id AND main_a.is_main = 1 AND main_a.game_name = ?
       LEFT JOIN accounts a ON a.member_id = m.id AND a.puuid IS NOT NULL`,
      [h.nickname]
    ) as [any[], any];
    if (!mRows.length) { console.log(`[award] no member for nickname=${h.nickname}`); continue; }
    const memberId = mRows[0].member_id;
    const isRookie = mRows[0].position === '수습';
    const puuids = [...new Set(mRows.map((r: any) => r.puuid).filter(Boolean))] as string[];
    console.log(`[award] ${h.nickname} memberId=${memberId} puuids=${puuids.length}`);
    if (puuids.length) memberData.push({ memberId, nickname: h.nickname, puuids, isRookie });
  }
  if (memberData.length < 2) { console.log(`[award] skip: memberData < 2`); return; }

  const baseTime = party.start_at
    ? new Date(party.start_at.replace(" ", "T") + "+09:00").getTime()
    : new Date(party.created_at.replace(" ", "T")).getTime();
  // 전적 조회 범위: 파티 시작시간 기준 0 ~ +8시간
  const partyDate = toKstDateString(party.start_at ?? party.created_at);
  const startTime = Math.floor(baseTime / 1000);
  const endTime = Math.floor((baseTime + 8 * 60 * 60 * 1000) / 1000);
  const queueIds = party.mode === "solo" ? [420] : party.mode === "flex" ? [440] : [400, 430];
  const pointType = party.mode === "solo" ? "solo" : party.mode === "flex" ? "flex" : "normal";
  const queueType = party.mode === "solo" || party.mode === "flex" ? "ranked" : "normal";
  console.log(`[award] startTime=${new Date(startTime*1000).toISOString()} endTime=${new Date(endTime*1000).toISOString()} queueIds=${queueIds} queueType=${queueType}`);

  const rookiePuuids = new Set(memberData.filter(m => m.isRookie).flatMap(m => m.puuids));
  const allPartyPuuids = new Set(memberData.flatMap((m) => m.puuids));

  // 매치 데이터 캐시 (API 호출 최소화)
  const matchCache = new Map<string, any>();
  async function fetchMatch(mid: string) {
    if (!matchCache.has(mid)) matchCache.set(mid, await getMatch(mid));
    return matchCache.get(mid);
  }

  for (const { memberId, nickname, puuids, isRookie } of memberData) {
    // 수습은 rookie_session 타입으로 중복 체크, 일반 클랜원은 pointType으로 체크
    const checkType = isRookie ? "rookie_session" : pointType;
    const partyStartAt = party.start_at ?? party.created_at;
    const partyDate = toKstDateString(partyStartAt);
    const [alreadyRows] = await pool.query(
      isRookie
        ? `SELECT pl.id FROM point_logs pl WHERE pl.member_id = ? AND pl.type = ? AND pl.ref_id = ? AND pl.ref_table = 'party'`
        : `SELECT pl.id FROM point_logs pl JOIN parties p ON p.id = pl.ref_id AND pl.ref_table = 'party' WHERE pl.member_id = ? AND pl.type = ? AND DATE(COALESCE(p.start_at, p.created_at)) = ?`,
      isRookie ? [memberId, checkType, partyId] : [memberId, checkType, partyDate]
    ) as [any[], any];
    if (alreadyRows.length > 0) {
      // 수습이 아닌 클랜원이고 이미 포인트를 받았어도, 새로운 수습이 있으면 보너스는 지급해야 함
      if (!isRookie && rookiePuuids.size > 0) {
        // 이미 지급된 포인트 로그의 ref_id 확인
        const [prevLog] = await pool.query(
          `SELECT pl.ref_id FROM point_logs pl JOIN parties p ON p.id = pl.ref_id AND pl.ref_table = 'party' WHERE pl.member_id = ? AND pl.type = ? AND DATE(COALESCE(p.start_at, p.created_at)) = ? LIMIT 1`,
          [memberId, checkType, partyDate]
        ) as [any[], any];
        // 이전 파티와 다른 파티이고 수습 동반이면 보너스 체크
        if (prevLog[0]?.ref_id !== partyId) {
          // 이미 이 수습에게 보너스를 지급한 적 없으면 +10점
          const rookieMemberIds = memberData.filter(m => m.isRookie).map(m => m.memberId);
          let rookieBonus = 0;
          for (const rookieMemberId of rookieMemberIds) {
            const [bonusRows] = await pool.query(
              `SELECT id FROM rookie_bonus_log WHERE member_id = ? AND rookie_member_id = ?`,
              [memberId, rookieMemberId]
            ) as [any[], any];
            if (bonusRows.length === 0) { rookieBonus = 10; break; }
          }
          if (rookieBonus > 0) {
            for (const rookieMemberId of rookieMemberIds) {
              await pool.query(`INSERT IGNORE INTO rookie_bonus_log (member_id, rookie_member_id) VALUES (?, ?)`, [memberId, rookieMemberId]);
            }
            await givePoints(pool, memberId, rookieBonus, pointType, 0, `파티 (수습 동반 추가보너스)${partyLabel(party)}`, givenBy, partyId, 0, null, "party");
            console.log(`[award] +10 rookie bonus (additional party) to memberId=${memberId}`);
          }
        }
      }
      console.log(`[award] skip memberId=${memberId}: already got ${checkType} on ${partyDate}`);
      continue;
    }

    const myMatchIds = new Set<string>();
    for (const puuid of puuids) {
      const ids = await getMatchIds(puuid, 50, startTime, queueType).catch((e) => { console.log(`[award] getMatchIds err puuid=${puuid}`, e.message); return [] as string[]; });
      ids.forEach((id) => myMatchIds.add(id));
    }
    console.log(`[award] memberId=${memberId} matchIds=${myMatchIds.size}`);

    let validGames = 0;
    let playedWithRookie = false;
    for (const mid of myMatchIds) {
      try {
        const match = await fetchMatch(mid);
        const created = Math.floor(match.info.gameCreation / 1000);
        if (created < startTime || created > endTime) continue;
        if (!queueIds.includes(match.info.queueId)) continue;
        const matchPuuids: string[] = match.info.participants.map((p: any) => p.puuid);
        const hasPartyMate = matchPuuids.some((p) => !puuids.includes(p) && allPartyPuuids.has(p));
        console.log(`[award] match=${mid} queueId=${match.info.queueId} hasPartyMate=${hasPartyMate} created=${new Date(created*1000).toISOString()}`);
        if (!hasPartyMate) continue;
        validGames++;
        if (!isRookie && rookiePuuids.size > 0 && matchPuuids.some((p) => rookiePuuids.has(p))) {
          playedWithRookie = true;
        }
      } catch { continue; }
    }
    console.log(`[award] memberId=${memberId} validGames=${validGames} minGames=${minGames} isRookie=${isRookie} playedWithRookie=${playedWithRookie}`);

    if (isRookie) {
      const [snapRows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM party_participant_history WHERE party_id = ? AND nickname = (SELECT game_name FROM accounts WHERE member_id = ? AND is_main = 1 LIMIT 1)`,
        [partyId, memberId]
      ) as [any[], any];
      const snapCount = Number(snapRows[0]?.cnt ?? 0);
      if (snapCount > 0) {
        const countableMode = party.mode === 'flex' || party.mode === 'scrim';
        const withMembers = memberData.filter(m => m.memberId !== memberId).map(m => m.nickname).join(",") || null;
        await givePoints(pool, memberId, 0, "rookie_session", validGames, `수습 파티 ${snapCount}회${partyLabel(party)}`, givenBy, partyId, countableMode ? snapCount : 0, null, "party", withMembers);
        console.log(`[award] rookie session recorded: memberId=${memberId} snapCount=${snapCount} countable=${countableMode}`);
      }
      continue;
    }

    // 수습 동반 보너스: 이미 지급한 수습이 있으면 제외, 새로운 수습에게만 지급
    let rookieBonus = 0;
    if (playedWithRookie) {
      // 이 파티에서 함께 게임한 수습 멤버 ID 목록
      const rookieMemberIds = memberData.filter(m => m.isRookie).map(m => m.memberId);
      for (const rookieMemberId of rookieMemberIds) {
        const [bonusRows] = await pool.query(
          `SELECT id FROM rookie_bonus_log WHERE member_id = ? AND rookie_member_id = ?`,
          [memberId, rookieMemberId]
        ) as [any[], any];
        if (bonusRows.length === 0) {
          rookieBonus = 10; // 최대 10점 캡 (수습 여러 명이어도 10점)
          break;
        }
      }
      // 보너스 지급 시 로그 기록
      if (rookieBonus > 0) {
        for (const rookieMemberId of rookieMemberIds) {
          await pool.query(
            `INSERT IGNORE INTO rookie_bonus_log (member_id, rookie_member_id) VALUES (?, ?)`,
            [memberId, rookieMemberId]
          );
        }
      }
    }

    const withMembersNormal = memberData.filter(m => m.memberId !== memberId).map(m => m.nickname).join(",") || null;

    if (validGames >= minGames) {
      const finalPoints = pointsToGive + rookieBonus;
      const comment = (rookieBonus > 0 ? `파티 ${validGames}판 달성 (수습 동반)` : `파티 ${validGames}판 달성`) + partyLabel(party);
      await givePoints(pool, memberId, finalPoints, pointType, validGames, comment, givenBy, partyId, 0, null, "party", withMembersNormal);
      console.log(`[award] gave ${finalPoints}pts to memberId=${memberId}`);
    } else if (rookieBonus > 0) {
      // 판수 미달이어도 수습 동반 시 +10점
      await givePoints(pool, memberId, 10, pointType, validGames, `파티 (수습 동반)${partyLabel(party)}`, givenBy, partyId, 0, null, "party", withMembersNormal);
      console.log(`[award] +10 rookie bonus (under min) to memberId=${memberId}`);
    } else {
      console.log(`[award] skip memberId=${memberId}: validGames=${validGames} < ${minGames}`);
    }
  }
}
