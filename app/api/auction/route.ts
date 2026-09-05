import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

// GET /api/auction?sessionId=N  → 세션 상태 조회
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    const [rows] = await pool.query(
      `SELECT s.id, s.status, s.current_idx, s.created_at,
              COUNT(DISTINCT ap.id) AS player_count
       FROM auction_sessions s
       LEFT JOIN auction_players ap ON ap.session_id = s.id
       GROUP BY s.id ORDER BY s.id DESC LIMIT 10`
    ) as any[];
    return NextResponse.json({ sessions: rows });
  }

  const [[session]] = await pool.query(
    `SELECT id, status, current_idx, timer_started, CAST(timer_started_at AS SIGNED) AS timer_started_at FROM auction_sessions WHERE id = ?`, [sessionId]
  ) as any[];
  if (!session) return NextResponse.json({ error: "세션 없음" }, { status: 404 });

  const [players] = await pool.query(
    `SELECT ap.*, m.nickname, m.main_line, m.sub_line,
            COALESCE(ap.captain_user_id, u.id) AS user_id,
            r.line AS roster_line, r.champ1, r.champ2, r.champ3,
            a.solo_tier, a.solo_rank
     FROM auction_players ap
     JOIN members m ON m.id = ap.member_id
     LEFT JOIN users u ON u.member_id = ap.member_id
     LEFT JOIN auction_roster r ON r.member_id = ap.member_id
     LEFT JOIN accounts a ON a.member_id = ap.member_id AND a.is_main = 1
     WHERE ap.session_id = ?
     ORDER BY ap.is_captain DESC, ap.sort_order ASC`, [sessionId]
  ) as any[];

  const [bids] = await pool.query(
    `SELECT ab.*, m.nickname AS captain_name
     FROM auction_bids ab
     JOIN auction_players ap ON ap.id = ab.captain_id
     JOIN members m ON m.id = ap.member_id
     WHERE ab.session_id = ?
     ORDER BY ab.created_at DESC`, [sessionId]
  ) as any[];

  return NextResponse.json({ session, players, bids, serverNow: Date.now() });
}

// POST /api/auction  → 세션 생성
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const body = await req.json();
  const { captains, playerIds } = body as {
    captains: { memberId: number; points: number; captainUserId?: number }[];
    playerIds?: number[];
  };
  if (!captains?.length)
    return NextResponse.json({ error: "팀장을 입력하세요." }, { status: 400 });

  const captainIds = new Set(captains.map((c) => c.memberId));

  let players: number[];
  if (playerIds && playerIds.length > 0) {
    players = playerIds.filter((id) => !captainIds.has(id));
  } else {
    const [rosterRows] = await pool.query(
      `SELECT member_id FROM auction_roster ORDER BY member_id ASC`
    ) as any[];
    players = (rosterRows as any[]).map((r) => r.member_id).filter((id: number) => !captainIds.has(id));
  }

  if (players.length === 0)
    return NextResponse.json({ error: "선수가 없습니다. 참여자 관리에서 먼저 등록하세요." }, { status: 400 });

  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query(
      `INSERT INTO auction_sessions (status, current_idx, created_by) VALUES ('waiting', 0, ?)`,
      [auth.session.userId]
    ) as any[];
    const sessionId = res.insertId;

    for (let i = 0; i < captains.length; i++) {
      await conn.query(
        `INSERT INTO auction_players (session_id, member_id, is_captain, points, sort_order, captain_user_id) VALUES (?, ?, 1, ?, ?, ?)`,
        [sessionId, captains[i].memberId, captains[i].points, i, captains[i].captainUserId??null]
      );
    }
    for (let i = 0; i < players.length; i++) {
      await conn.query(
        `INSERT INTO auction_players (session_id, member_id, is_captain, points, sort_order) VALUES (?, ?, 0, 0, ?)`,
        [sessionId, players[i], i]
      );
    }
    await conn.commit();
    return NextResponse.json({ sessionId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// PATCH /api/auction  → 입찰 / 낙찰 / 세션 상태 변경
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const body = await req.json();
  const { action, sessionId } = body;

  if (action === "bid") {
    const { captainPlayerId, points } = body;
    const [[captain]] = await pool.query(
      `SELECT ap.*, m.nickname FROM auction_players ap JOIN members m ON m.id = ap.member_id
       WHERE ap.id = ? AND ap.is_captain = 1`, [captainPlayerId]
    ) as any[];
    if (!captain) return NextResponse.json({ error: "팀장 아님" }, { status: 403 });

    const [[session]] = await pool.query(
      `SELECT * FROM auction_sessions WHERE id = ? AND status = 'running'`, [sessionId]
    ) as any[];
    if (!session) return NextResponse.json({ error: "경매 진행 중이 아닙니다." }, { status: 400 });

    const [nonCaptains] = await pool.query(
      `SELECT * FROM auction_players WHERE session_id = ? AND is_captain = 0 ORDER BY sort_order ASC`, [sessionId]
    ) as any[];
    // 항상 team_id=null인 첫 번째 선수가 현재 경매 대상
    const currentPlayer = (nonCaptains as any[]).filter((p:any) => p.team_id === null)[0];
    if (!currentPlayer) return NextResponse.json({ error: "경매 대상 없음" }, { status: 400 });

    const [[topBid]] = await pool.query(
      `SELECT MAX(points) AS max_pts FROM auction_bids WHERE session_id = ? AND player_id = ?`,
      [sessionId, currentPlayer.id]
    ) as any[];
    if (points <= (topBid?.max_pts ?? 0))
      return NextResponse.json({ error: "현재 최고 입찰가보다 높아야 합니다." }, { status: 400 });

    const [[spent]] = await pool.query(
      `SELECT COALESCE(SUM(max_pts), 0) AS used FROM (
         SELECT MAX(ab.points) AS max_pts
         FROM auction_bids ab
         JOIN auction_players ap2 ON ap2.id = ab.player_id
         WHERE ab.captain_id = ? AND ap2.team_id = ab.captain_id
         GROUP BY ab.player_id
       ) t`,
      [captainPlayerId]
    ) as any[];
    const remaining = captain.points - (spent?.used ?? 0);
    if (points > remaining)
      return NextResponse.json({ error: `포인트 부족 (잔여: ${remaining})` }, { status: 400 });

    await pool.query(
      `INSERT INTO auction_bids (session_id, player_id, captain_id, points) VALUES (?, ?, ?, ?)`,
      [sessionId, currentPlayer.id, captainPlayerId, points]
    );
    await pool.query(`UPDATE auction_sessions SET timer_started = 1, timer_started_at = ? WHERE id = ?`, [Date.now(), sessionId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "award") {
    const auth2 = requireAdmin(req);
    if (!auth2.ok) return auth2.response;

    const [nonCaptains] = await pool.query(
      `SELECT * FROM auction_players WHERE session_id = ? AND is_captain = 0 ORDER BY sort_order ASC`, [sessionId]
    ) as any[];
    // 항상 team_id=null인 첫 번째 선수가 현재 경매 대상
    const currentPlayer = (nonCaptains as any[]).filter((p:any) => p.team_id === null)[0];
    if (!currentPlayer) return NextResponse.json({ error: "대상 없음" }, { status: 400 });

    const [[topBid]] = await pool.query(
      `SELECT * FROM auction_bids WHERE session_id = ? AND player_id = ? ORDER BY points DESC LIMIT 1`,
      [sessionId, currentPlayer.id]
    ) as any[];

    if (topBid) {
      await pool.query(
        `UPDATE auction_players SET team_id = ? WHERE id = ?`,
        [topBid.captain_id, currentPlayer.id]
      );
    } else {
      // 유찰: sort_order를 최대값+1로 밀어서 맨 뒤로
      const maxOrder = (nonCaptains as any[]).reduce((m: number, p: any) => Math.max(m, p.sort_order), 0);
      await pool.query(
        `UPDATE auction_players SET sort_order = ? WHERE id = ?`,
        [maxOrder + 1, currentPlayer.id]
      );
    }

    await pool.query(
      `UPDATE auction_sessions SET timer_started = 0, timer_started_at = NULL WHERE id = ?`,
      [sessionId]
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "next") {
    const auth2 = requireAdmin(req);
    if (!auth2.ok) return auth2.response;

    const [nonCaptains] = await pool.query(
      `SELECT * FROM auction_players WHERE session_id = ? AND is_captain = 0 ORDER BY sort_order ASC`, [sessionId]
    ) as any[];

    // award 후 현재 선수는 team_id가 설정됐거나 sort_order가 뒤로 밀렸으므로
    // team_id=null인 선수가 1명 이하면 done
    const unawardedAll = (nonCaptains as any[]).filter((p: any) => p.team_id === null);
    const isDone = unawardedAll.length === 0;
    await pool.query(
      `UPDATE auction_sessions SET current_idx = current_idx + 1, status = ?, timer_started = 0, timer_started_at = NULL WHERE id = ?`,
      [isDone ? "done" : "running", sessionId]
    );
    return NextResponse.json({ ok: true, done: isDone });
  }

  if (action === "timer_start") {
    const auth2 = requireAdmin(req);
    if (!auth2.ok) return auth2.response;
    await pool.query(`UPDATE auction_sessions SET timer_started = 1, timer_started_at = ? WHERE id = ?`, [Date.now(), sessionId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "start") {
    const auth2 = requireAdmin(req);
    if (!auth2.ok) return auth2.response;
    await pool.query(`UPDATE auction_sessions SET status = 'running', current_idx = 0, timer_started = 0, timer_started_at = NULL WHERE id = ?`, [sessionId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "reset") {
    const auth2 = requireAdmin(req);
    if (!auth2.ok) return auth2.response;
    const [nonCaptains] = await pool.query(
      `SELECT * FROM auction_players WHERE session_id = ? AND is_captain = 0 ORDER BY sort_order ASC`, [sessionId]
    ) as any[];
    const unawarded = (nonCaptains as any[]).filter((p:any) => p.team_id === null);
    const awarded = (nonCaptains as any[]).filter((p:any) => p.team_id !== null);
    const unawardedIds = unawarded.map((p:any) => p.id);
    for (let i = 0; i < unawarded.length; i++) {
      await pool.query(`UPDATE auction_players SET sort_order = ? WHERE id = ?`, [i, unawarded[i].id]);
    }
    for (let i = 0; i < awarded.length; i++) {
      await pool.query(`UPDATE auction_players SET sort_order = ? WHERE id = ?`, [unawarded.length + i, awarded[i].id]);
    }
    if (unawardedIds.length > 0) {
      await pool.query(`DELETE FROM auction_bids WHERE session_id = ? AND player_id IN (?)`, [sessionId, unawardedIds]);
    }
    await pool.query(`UPDATE auction_sessions SET status = 'running', current_idx = 0, timer_started = 0, timer_started_at = NULL WHERE id = ?`, [sessionId]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
}

// DELETE /api/auction?sessionId=N
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  await pool.query(`DELETE FROM auction_sessions WHERE id = ?`, [sessionId]);
  return NextResponse.json({ ok: true });
}
