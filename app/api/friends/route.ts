import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_FRIENDS = 3;

// GET /api/friends — 전체 클랜원 + 지인 목록
// 지인 = 내가 등록한 사람 + 나를 등록한 사람 (양방향 표시, 단방향 저장)
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    await ensureSchema();
    const pool = getPool();

    const [members] = await pool.query(
      `SELECT m.id, m.nickname, a.game_name
       FROM members m
       LEFT JOIN accounts a ON a.member_id = m.id AND a.is_main = 1
       ORDER BY COALESCE(a.game_name, m.nickname) ASC`
    ) as [any[], any];

    // 양방향 조회: 내가 등록한 + 나를 등록한
    const [friends] = await pool.query(
      `SELECT f.member_id, f.friend_id,
              COALESCE(a.game_name, m.nickname) AS friend_name
       FROM member_friends f
       JOIN members m ON m.id = f.friend_id
       LEFT JOIN accounts a ON a.member_id = f.friend_id AND a.is_main = 1`
    ) as [any[], any];

    // 내가 등록한 지인만
    const friendMap: Record<number, { friendId: number; friendName: string }[]> = {};
    for (const f of friends) {
      if (!friendMap[f.member_id]) friendMap[f.member_id] = [];
      friendMap[f.member_id].push({ friendId: f.friend_id, friendName: f.friend_name });
    }

    const result = members.map((m: any) => ({
      id: m.id,
      nickname: m.game_name ?? m.nickname,
      friends: friendMap[m.id] ?? [],
    }));

    return NextResponse.json({ members: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// POST /api/friends — 지인 추가 (운영진만), 단방향 저장
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { memberId, friendId } = await req.json();
    if (!memberId || !friendId || memberId === friendId)
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();

    // 이미 등록됐는지 확인 (양방향 중복 체크)
    const [existing] = await pool.query(
      `SELECT id FROM member_friends WHERE (member_id = ? AND friend_id = ?) OR (member_id = ? AND friend_id = ?)`,
      [memberId, friendId, friendId, memberId]
    ) as [any[], any];
    if (existing.length > 0)
      return NextResponse.json({ error: "이미 지인 관계입니다." }, { status: 400 });

    // memberId 기준 직접 등록한 지인 수만 체크
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM member_friends WHERE member_id = ?`,
      [memberId]
    ) as [any[], any];
    if (countRows[0].c >= MAX_FRIENDS)
      return NextResponse.json({ error: "지인은 최대 3명까지 등록 가능합니다." }, { status: 400 });

    // 단방향 저장
    await pool.query(
      `INSERT IGNORE INTO member_friends (member_id, friend_id) VALUES (?, ?)`,
      [memberId, friendId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "추가 실패" }, { status: 500 });
  }
}

// DELETE /api/friends?memberId=1&friendId=2 — 지인 삭제 (운영진만), 양방향 삭제
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const memberId = Number(url.searchParams.get("memberId"));
    const friendId = Number(url.searchParams.get("friendId"));
    if (!memberId || !friendId)
      return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();

    // 양방향 삭제 (어느 방향으로 저장됐든 삭제)
    await pool.query(
      `DELETE FROM member_friends WHERE (member_id = ? AND friend_id = ?) OR (member_id = ? AND friend_id = ?)`,
      [memberId, friendId, friendId, memberId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
