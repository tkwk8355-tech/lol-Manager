import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MODES = ["aram", "rift"];

interface RecruitRow {
  id: number;
  mode: string;
  max_size: number;
  status: string;
  note: string | null;
  created_by: number;
  match_id: number | null;
  created_at: string;
}
interface ParticipantRow {
  recruit_id: number;
  user_id: number;
  member_id: number;
  nickname: string;
  line: string | null;
}

function shape(r: RecruitRow, participants: ParticipantRow[]) {
  return {
    id: r.id,
    mode: r.mode,
    maxSize: r.max_size,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    participants: participants.map((p) => ({
      userId: p.user_id, memberId: p.member_id, nickname: p.nickname, line: p.line,
    })),
  };
}

// GET /api/scrim/recruit — 모집 목록 조회. 일반 클랜원도 볼 수 있다(신청 여부 판단용).
// 상세 점수/전적 데이터는 절대 포함하지 않는다.
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();
    const [recruits] = await pool.query(
      `SELECT id, mode, max_size, status, note, created_by, match_id, created_at
       FROM scrim_recruits ORDER BY created_at DESC LIMIT 30`
    ) as [RecruitRow[], any];

    if (recruits.length === 0) return NextResponse.json({ recruits: [] });

    const ids = recruits.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");
    const [participants] = await pool.query(
      `SELECT recruit_id, user_id, member_id, nickname, line FROM scrim_recruit_participants WHERE recruit_id IN (${ph})`,
      ids
    ) as [ParticipantRow[], any];

    const byRecruit = new Map<number, ParticipantRow[]>();
    for (const p of participants) {
      if (!byRecruit.has(p.recruit_id)) byRecruit.set(p.recruit_id, []);
      byRecruit.get(p.recruit_id)!.push(p);
    }

    return NextResponse.json({ recruits: recruits.map((r) => shape(r, byRecruit.get(r.id) ?? [])) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "모집 조회 실패" }, { status: 500 });
  }
}

// POST /api/scrim/recruit — 내전 모집 열기 (운영진만)
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode;
    const note: string | null = body.note ? String(body.note).trim().slice(0, 255) : null;
    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: "모드를 선택하세요." }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    const [res] = await pool.query(
      `INSERT INTO scrim_recruits (mode, max_size, status, note, created_by) VALUES (?, 10, 'open', ?, ?)`,
      [mode, note, auth.session.userId]
    ) as any;
    return NextResponse.json({ id: res.insertId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "모집 생성 실패" }, { status: 500 });
  }
}

// DELETE /api/scrim/recruit?id=1 — 모집 취소 (운영진만)
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    await ensureSchema();
    const pool = getPool();
    await pool.query("DELETE FROM scrim_recruits WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
