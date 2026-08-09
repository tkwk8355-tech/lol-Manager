import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { resolveMemberLink } from "@/lib/memberLink";

const LINES = ["TOP", "JG", "MID", "ADC", "SUP"];

// POST /api/scrim/recruit/join — 내전 모집에 신청 (클랜원 연동 필요)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const recruitId = Number(body.recruitId);
    const line: string | null = body.line && LINES.includes(body.line) ? body.line : null;
    if (!recruitId) return NextResponse.json({ error: "recruitId가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const { userId } = auth.session;

    const link = await resolveMemberLink(userId);
    if (!link) {
      return NextResponse.json(
        { error: "클랜원 계정과 연동되어 있지 않습니다. 운영진에게 계정 연동을 요청하세요." },
        { status: 403 }
      );
    }

    const [rows] = await pool.query(
      "SELECT id, max_size, status FROM scrim_recruits WHERE id = ?",
      [recruitId]
    ) as [any[], any];
    const recruit = rows[0];
    if (!recruit) return NextResponse.json({ error: "존재하지 않는 모집입니다." }, { status: 404 });
    if (recruit.status !== "open") {
      return NextResponse.json({ error: "이미 마감되었거나 종료된 모집입니다." }, { status: 409 });
    }

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS c FROM scrim_recruit_participants WHERE recruit_id = ?",
      [recruitId]
    ) as [any[], any];
    if (countRows[0].c >= recruit.max_size) {
      return NextResponse.json({ error: "인원이 가득 찼습니다." }, { status: 409 });
    }

    try {
      await pool.query(
        "INSERT INTO scrim_recruit_participants (recruit_id, user_id, member_id, nickname, line) VALUES (?, ?, ?, ?, ?)",
        [recruitId, userId, link.memberId, link.nickname, line]
      );
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: "이미 신청한 모집입니다." }, { status: 409 });
      }
      throw e;
    }

    const [afterRows] = await pool.query(
      "SELECT COUNT(*) AS c FROM scrim_recruit_participants WHERE recruit_id = ?",
      [recruitId]
    ) as [any[], any];
    if (afterRows[0].c >= recruit.max_size) {
      await pool.query("UPDATE scrim_recruits SET status = 'full' WHERE id = ?", [recruitId]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "신청 실패" }, { status: 500 });
  }
}

// DELETE /api/scrim/recruit/join?recruitId=1 — 신청 취소
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const recruitId = Number(new URL(req.url).searchParams.get("recruitId"));
    if (!recruitId) return NextResponse.json({ error: "recruitId가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const { userId } = auth.session;

    await pool.query(
      "DELETE FROM scrim_recruit_participants WHERE recruit_id = ? AND user_id = ?",
      [recruitId, userId]
    );
    await pool.query("UPDATE scrim_recruits SET status = 'open' WHERE id = ? AND status = 'full'", [recruitId]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "신청 취소 실패" }, { status: 500 });
  }
}
