import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { resolvePartyIdentity } from "@/lib/party";
import { parseLineInput } from "@/lib/partyLine";

export const dynamic = "force-dynamic";

// 방장 롤 ID·참가자 명단 같은 클랜 내부 정보가 노출되므로, 목록 조회도 로그인해야 볼 수 있게 한다.

// 파티 종류: 칼바람 / 일반 협곡 / 자유랭크 / 솔로랭크.
// aram만 라인 구분이 없고, 나머지 세 개는 모두 협곡(5v5)이라 라인 선택을 쓴다.
const MODES = ["aram", "normal", "flex", "solo"];

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
  user_id: number;
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
      line: pp.line,
    })),
    waiting: participants.filter((pp) => pp.is_waiting).map((pp) => ({
      userId: pp.user_id,
      nickname: pp.nickname,
      line: pp.line,
    })),
  };
}

// GET /api/party?mode=aram|normal|flex|solo|all — 모집 중/최근 파티 목록 조회
// mode=all이면 종류 구분 없이 전체를 최신순으로 보여준다.
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
           FROM parties WHERE status != 'ended' ORDER BY created_at DESC LIMIT 50`
        ) as [PartyRow[], any]
      : await pool.query(
          `SELECT id, mode, max_size, status, host_user_id, host_nickname, note, start_at, created_at
           FROM parties WHERE mode = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 50`,
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

// POST /api/party — 파티 생성 (로그인한 계정이 방장이 되어 자동 참가)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode;
    const note: string | null = body.note ? String(body.note).trim().slice(0, 255) : null;

    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: "모드를 선택하세요." }, { status: 400 });
    }

    // 라인은 최대 2개까지 고를 수 있고, ALL은 다른 라인과 함께 고를 수 없다.
    const lineResult = parseLineInput(body.line);
    if (!lineResult.ok) {
      return NextResponse.json({ error: lineResult.error }, { status: 400 });
    }
    const line = lineResult.value;

    // 시작 시각(선택): "HH:mm" 형태로 받아서 오늘/내일 날짜에 붙인다.
    // 이미 지난 시각이면 다음날로 간주한다(예: 밤 11시에 "01:00" 입력).
    let startAt: string | null = null;
    if (body.startTime) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(body.startTime).trim());
      if (!m) return NextResponse.json({ error: "시작 시간 형식이 올바르지 않습니다. (HH:mm)" }, { status: 400 });
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (hh > 23 || mm > 59) return NextResponse.json({ error: "시작 시간이 올바르지 않습니다." }, { status: 400 });
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
      if (target.getTime() < now.getTime() - 60 * 1000) target.setDate(target.getDate() + 1);
      const p = (n: number) => String(n).padStart(2, "0");
      startAt = `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())} ${p(target.getHours())}:${p(target.getMinutes())}:00`;
    }

    await ensureSchema();
    const pool = getPool();
    const { userId } = auth.session;

    // 파티에 표시될 이름은 로그인 닉네임이 아니라, 연동된 클랜원의 등록된 본계정 롤 ID다.
    const identity = await resolvePartyIdentity(userId);
    if (!identity) {
      return NextResponse.json(
        { error: "클랜원 계정과 연동되어 있지 않습니다. 운영진에게 계정 연동을 요청하세요." },
        { status: 403 }
      );
    }

    // 솔로랭크는 실제 게임에서 솔로/듀오까지만 같은 파티로 큐를 돌릴 수 있어 최대 2명.
    const maxSize = mode === "solo" ? 2 : 5;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.query(
        `INSERT INTO parties (mode, max_size, status, host_user_id, host_nickname, note, start_at)
         VALUES (?, ?, 'open', ?, ?, ?, ?)`,
        [mode, maxSize, userId, identity.displayName, note, startAt]
      ) as any;
      const partyId = res.insertId;
      await conn.query(
        `INSERT INTO party_participants (party_id, user_id, nickname, line) VALUES (?, ?, ?, ?)`,
        [partyId, userId, identity.displayName, line]
      );
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

// DELETE /api/party?id=1 — 파티를 즉시 종료(펑)한다.
// "방장이었던 사람"이 아니라 "지금 그 파티에 남아있는 참가자"라면 누구나 펑칠 수 있다.
// (예: 방장이 겜 시작 후 명단에서 이름을 뺐다면, 방장은 더 이상 펑 권한이 없고
//  실제로 파티에 남아있는 사람들이 펑을 칠 수 있어야 한다.)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query("SELECT id FROM parties WHERE id = ?", [id]) as [any[], any];
    if (!rows[0]) return NextResponse.json({ error: "존재하지 않는 파티입니다." }, { status: 404 });

    if (auth.session.role !== "admin") {
      const [partRows] = await pool.query(
        "SELECT 1 FROM party_participants WHERE party_id = ? AND user_id = ?",
        [id, auth.session.userId]
      ) as [any[], any];
      if (!partRows[0]) {
        return NextResponse.json({ error: "현재 파티에 참가 중인 사람만 종료할 수 있습니다." }, { status: 403 });
      }
    }

    await pool.query("UPDATE parties SET status = 'ended', ended_at = NOW() WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
