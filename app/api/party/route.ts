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

function shapeParty(p: PartyRow, participants: ParticipantRow[]) {
  return {
    id: p.id,
    mode: p.mode,
    maxSize: p.max_size,
    status: p.status,
    hostUserId: p.host_user_id,
    hostNickname: p.host_nickname,
    note: p.note,
    startAt: p.start_at,
    createdAt: p.created_at,
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

      // 기존 참가자 삭제 후 새 명단으로 교체
      await conn.query("DELETE FROM party_participants WHERE party_id = ?", [partyId]);
      for (const nick of nicknames) {
        await conn.query(
          `INSERT INTO party_participants (party_id, user_id, nickname, line) VALUES (?, NULL, ?, NULL)`,
          [partyId, nick]
        );
        // 이력에 없는 닉네임만 추가 (중복 방지)
        const [histRows] = await conn.query(
          "SELECT id FROM party_participant_history WHERE party_id = ? AND nickname = ?",
          [partyId, nick]
        ) as [any[], any];
        if (!histRows.length) {
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
    const [rows] = await pool.query("SELECT id, mode, created_at, start_at FROM parties WHERE id = ?", [id]) as [any[], any];
    if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 파티입니다." }, { status: 404 });
    const party = rows[0];

    await pool.query("UPDATE parties SET status = 'ended', ended_at = NOW() WHERE id = ?", [id]);

    try {
      if (party.mode === "aram") {
        if (games >= 0) await awardAramPoints(pool, id, party, games);
      } else {
        await awardPartyPoints(pool, id, party);
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

// 칼바람: 판수 입력 기반 점수 지급 (4판당 5점, 하루 최대 5점)
async function awardAramPoints(pool: mysql.Pool, partyId: number, party: PartyRow, games: number) {
  const points = Math.min(Math.floor(games / 4) * 5, 5);
  if (points <= 0) return;

  const [histRows] = await pool.query(
    `SELECT DISTINCT nickname FROM party_participant_history WHERE party_id = ?`,
    [partyId]
  ) as [any[], any];
  if (histRows.length < 2) return;

  const today = new Date().toISOString().slice(0, 10);
  for (const h of histRows) {
    const [mRows] = await pool.query(
      `SELECT m.id AS member_id FROM members m
       JOIN accounts a ON a.member_id = m.id AND a.is_main = 1 AND a.game_name = ?`,
      [h.nickname]
    ) as [any[], any];
    if (!mRows.length) continue;
    const memberId = mRows[0].member_id;
    const [already] = await pool.query(
      `SELECT id FROM point_logs WHERE member_id = ? AND type = 'flex' AND DATE(created_at) = ?`,
      [memberId, today]
    ) as [any[], any];
    if (already.length > 0) continue;
    await givePoints(pool, memberId, points, "flex", games, `칼바람 ${games}판`, null, partyId);
  }
}
async function awardPartyPoints(pool: mysql.Pool, partyId: number, party: PartyRow) {
  const [histRows] = await pool.query(
    `SELECT DISTINCT nickname FROM party_participant_history WHERE party_id = ?`,
    [partyId]
  ) as [any[], any];
  console.log(`[award] partyId=${partyId} mode=${party.mode} hist=${histRows.map((r:any)=>r.nickname).join(",")}`);
  if (histRows.length < 2) { console.log(`[award] skip: hist < 2`); return; }

  const memberData: { memberId: number; puuids: string[] }[] = [];
  for (const h of histRows) {
    const [mRows] = await pool.query(
      `SELECT m.id AS member_id, a.puuid
       FROM members m
       JOIN accounts main_a ON main_a.member_id = m.id AND main_a.is_main = 1 AND main_a.game_name = ?
       LEFT JOIN accounts a ON a.member_id = m.id AND a.puuid IS NOT NULL`,
      [h.nickname]
    ) as [any[], any];
    if (!mRows.length) { console.log(`[award] no member for nickname=${h.nickname}`); continue; }
    const memberId = mRows[0].member_id;
    const puuids = [...new Set(mRows.map((r: any) => r.puuid).filter(Boolean))] as string[];
    console.log(`[award] ${h.nickname} memberId=${memberId} puuids=${puuids.length}`);
    if (puuids.length) memberData.push({ memberId, puuids });
  }
  if (memberData.length < 2) { console.log(`[award] skip: memberData < 2`); return; }

  const createdMs = new Date(party.created_at.replace(" ", "T")).getTime();
  const startTime = Math.floor((createdMs - 24 * 60 * 60 * 1000) / 1000);
  const endTime = Math.floor(Date.now() / 1000);
  const minGames = 3;
  const pointsToGive = party.mode === "solo" ? 5 : 10;
  const queueIds = party.mode === "solo" ? [420] : party.mode === "flex" ? [440] : [400, 430];
  const pointType = party.mode === "solo" ? "solo" : party.mode === "flex" ? "flex" : "normal";
  const queueType = party.mode === "solo" ? "ranked" : "normal";
  console.log(`[award] startTime=${new Date(startTime*1000).toISOString()} endTime=${new Date(endTime*1000).toISOString()} queueIds=${queueIds} queueType=${queueType}`);

  const allPartyPuuids = new Set(memberData.flatMap((m) => m.puuids));
  const today = new Date().toISOString().slice(0, 10);

  for (const { memberId, puuids } of memberData) {
    const [alreadyRows] = await pool.query(
      `SELECT id FROM point_logs WHERE member_id = ? AND type = ? AND DATE(created_at) = ?`,
      [memberId, pointType, today]
    ) as [any[], any];
    if (alreadyRows.length > 0) { console.log(`[award] skip memberId=${memberId}: already given today`); continue; }

    const myMatchIds = new Set<string>();
    for (const puuid of puuids) {
      const ids = await getMatchIds(puuid, 50, startTime, queueType).catch((e) => { console.log(`[award] getMatchIds err puuid=${puuid}`, e.message); return [] as string[]; });
      ids.forEach((id) => myMatchIds.add(id));
    }
    console.log(`[award] memberId=${memberId} matchIds=${myMatchIds.size}`);

    let validGames = 0;
    let checkedCount = 0;
    for (const mid of myMatchIds) {
      try {
        const match = await getMatch(mid);
        const created = Math.floor(match.info.gameCreation / 1000);
        if (created < startTime || created > endTime) continue;
        const matchPuuids = match.info.participants.map((p: any) => p.puuid);
        const hasPartyMate = matchPuuids.some(
          (p: string) => !puuids.includes(p) && allPartyPuuids.has(p)
        );
        if (checkedCount < 3) {
          console.log(`[award] match=${mid} queueId=${match.info.queueId} hasPartyMate=${hasPartyMate} created=${new Date(created*1000).toISOString()}`);
          checkedCount++;
        }
        if (!queueIds.includes(match.info.queueId)) continue;
        if (hasPartyMate) validGames++;
      } catch { continue; }
    }
    console.log(`[award] memberId=${memberId} validGames=${validGames} minGames=${minGames}`);

    if (validGames < minGames) { console.log(`[award] skip memberId=${memberId}: validGames=${validGames} < ${minGames}`); continue; }
    await givePoints(pool, memberId, pointsToGive, pointType, validGames, `파티 ${validGames}판 달성`, null, partyId);
    console.log(`[award] gave ${pointsToGive}pts to memberId=${memberId}`);
  }
}
