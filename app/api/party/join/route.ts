import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { resolvePartyIdentity } from "@/lib/party";
import { parseLineInput } from "@/lib/partyLine";

// POST /api/party/join — 로그인한 계정이 특정 파티에 참가
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const partyId = Number(body.partyId);
    if (!partyId) return NextResponse.json({ error: "partyId가 필요합니다." }, { status: 400 });

    const lineResult = parseLineInput(body.line);
    if (!lineResult.ok) {
      return NextResponse.json({ error: lineResult.error }, { status: 400 });
    }
    const line = lineResult.value;

    await ensureSchema();
    const pool = getPool();
    const { userId } = auth.session;

    const identity = await resolvePartyIdentity(userId);
    if (!identity) {
      return NextResponse.json(
        { error: "클랜원 계정과 연동되어 있지 않습니다. 운영진에게 계정 연동을 요청하세요." },
        { status: 403 }
      );
    }

    const [rows] = await pool.query(
      "SELECT id, max_size, status FROM parties WHERE id = ?",
      [partyId]
    ) as [any[], any];
    const party = rows[0];
    if (!party) return NextResponse.json({ error: "존재하지 않는 파티입니다." }, { status: 404 });

    // 정원(5자리)이 다 찼어도 신청은 계속 받되, "대기"로 들어간다.
    // status가 'open'이든 'full'이든 신청 자체는 막지 않는다(대기로 채워질 수 있으므로).
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS c FROM party_participants WHERE party_id = ? AND is_waiting = 0",
      [partyId]
    ) as [any[], any];
    const currentCount = countRows[0].c;
    const isWaiting = currentCount >= party.max_size ? 1 : 0;

    try {
      await pool.query(
        "INSERT INTO party_participants (party_id, user_id, nickname, line, is_waiting) VALUES (?, ?, ?, ?, ?)",
        [partyId, userId, identity.displayName, line, isWaiting]
      );
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: "이미 참가한 파티입니다." }, { status: 409 });
      }
      throw e;
    }

    // 정원(대기 제외)이 다 찼으면 자동으로 마감 처리.
    // 방금 대기가 아닌 상태로 들어갔다면 currentCount + 1을 재사용해 쿼리를 한 번 아낀다.
    const afterCount = isWaiting ? currentCount : currentCount + 1;
    if (afterCount >= party.max_size) {
      await pool.query("UPDATE parties SET status = 'full' WHERE id = ?", [partyId]);
    }

    return NextResponse.json({ ok: true, waiting: !!isWaiting });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "참가 실패" }, { status: 500 });
  }
}

// DELETE /api/party/join?partyId=1 — 참가 취소.
// 방장이 나가도 파티 자체는 삭제되지 않고 참가자 명단에서만 빠진다.
// 파티를 아예 없애려면 방장이 DELETE /api/party?id=... 를 호출해야 한다.
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const partyId = Number(new URL(req.url).searchParams.get("partyId"));
    if (!partyId) return NextResponse.json({ error: "partyId가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const { userId } = auth.session;

    const [rows] = await pool.query("SELECT id, max_size FROM parties WHERE id = ?", [partyId]) as [any[], any];
    const party = rows[0];
    if (!party) return NextResponse.json({ error: "존재하지 않는 파티입니다." }, { status: 404 });

    const [leavingRows] = await pool.query(
      "SELECT is_waiting FROM party_participants WHERE party_id = ? AND user_id = ?",
      [partyId, userId]
    ) as [any[], any];
    const wasWaiting = leavingRows[0]?.is_waiting === 1;

    await pool.query(
      "DELETE FROM party_participants WHERE party_id = ? AND user_id = ?",
      [partyId, userId]
    );

    // 참가자가 한 명도 남지 않았으면(대기자 포함) 파티 자체를 자동으로 없앤다.
    // 총 인원과 정원(대기 제외) 인원을 한 쿼리로 함께 구해서 왕복을 줄인다.
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total, SUM(is_waiting = 0) AS nonWaiting FROM party_participants WHERE party_id = ?",
      [partyId]
    ) as [any[], any];
    if (countRows[0].total === 0) {
      await pool.query("UPDATE parties SET status = 'ended', ended_at = NOW() WHERE id = ?", [partyId]);
      return NextResponse.json({ ok: true, deleted: true });
    }

    let nonWaitingCount = Number(countRows[0].nonWaiting) || 0;

    // 정원 자리가 빈 사람이 나갔다면, 대기자 중 가장 먼저 신청한 사람을 정원으로 승급시킨다.
    if (!wasWaiting) {
      const [waitRows] = await pool.query(
        "SELECT user_id FROM party_participants WHERE party_id = ? AND is_waiting = 1 ORDER BY joined_at ASC LIMIT 1",
        [partyId]
      ) as [any[], any];
      if (waitRows[0]) {
        await pool.query(
          "UPDATE party_participants SET is_waiting = 0 WHERE party_id = ? AND user_id = ?",
          [partyId, waitRows[0].user_id]
        );
        nonWaitingCount += 1;
      }
    }

    await pool.query(
      nonWaitingCount >= party.max_size
        ? "UPDATE parties SET status = 'full' WHERE id = ?"
        : "UPDATE parties SET status = 'open' WHERE id = ?",
      [partyId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "참가 취소 실패" }, { status: 500 });
  }
}
