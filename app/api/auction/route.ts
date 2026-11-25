import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

// 클라이언트 AuctionTimer.AUCTION_SECONDS 와 같은 값이어야 한다.
const AUCTION_SECONDS = 10;

// GET /api/auction?sessionId=N  → 세션 상태 조회
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.status, s.auction_type, s.current_idx, s.created_at,
              COUNT(DISTINCT ap.id) AS player_count
       FROM auction_sessions s
       LEFT JOIN auction_players ap ON ap.session_id = s.id
       GROUP BY s.id ORDER BY s.id DESC LIMIT 10`
    ) as any[];
    return NextResponse.json({ sessions: rows });
  }

  const [[session]] = await pool.query(
    `SELECT s.id, s.status, s.auction_type, s.current_idx, s.timer_started, CAST(s.timer_started_at AS SIGNED) AS timer_started_at,
            b.ver AS banner_ver
     FROM auction_sessions s
     LEFT JOIN auction_banner b ON b.session_id = s.id
     WHERE s.id = ?`, [sessionId]
  ) as any[];
  if (!session) return NextResponse.json({ error: "세션 없음" }, { status: 404 });

  const [players] = await pool.query(
    `SELECT ap.*, m.nickname, m.main_line, m.sub_line,
            COALESCE(ap.captain_user_id, u.id) AS user_id,
            r.line AS roster_line, r.champ1, r.champ2, r.champ3,
            a.solo_tier, a.solo_rank,
            ai.ver AS intro_ver
     FROM auction_players ap
     JOIN members m ON m.id = ap.member_id
     LEFT JOIN users u ON u.member_id = ap.member_id
     LEFT JOIN auction_roster r ON r.member_id = ap.member_id
     LEFT JOIN accounts a ON a.member_id = ap.member_id AND a.is_main = 1
     LEFT JOIN auction_intro ai ON ai.member_id = ap.member_id
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

  // 경매 순서는 운영진(admin)만 볼 수 있다. 부운영진/팀장/일반 회원에게는
  // 현재 경매 중인 선수(남은 선수 중 첫 번째)만 순서대로 두고, 나머지 남은 선수는
  // 닉네임순으로 섞어 sort_order도 가린다. (클라이언트는 남은 선수 중 첫 번째를 현재 선수로 쓴다)
  const visiblePlayers = auth.session.role === "admin" ? players : hideAuctionOrder(players as any[]);

  return NextResponse.json({ session, players: visiblePlayers, bids, serverNow: Date.now() });
}

function hideAuctionOrder(players: any[]): any[] {
  const captains = players.filter(p => p.is_captain === 1);
  const sold = players.filter(p => p.is_captain === 0 && p.team_id !== null);
  const [current, ...rest] = players.filter(p => p.is_captain === 0 && p.team_id === null);
  const hidden = rest
    .sort((a, b) => String(a.nickname).localeCompare(String(b.nickname), "ko"))
    .map(p => ({ ...p, sort_order: 0 }));
  const unsold = current ? [{ ...current, sort_order: 0 }, ...hidden] : hidden;
  return [...captains, ...sold.map(p => ({ ...p, sort_order: 0 })), ...unsold];
}

// POST /api/auction  → 세션 생성
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const body = await req.json();
  const { captains, playerIds, name, type } = body as {
    captains: { memberId: number; points: number; captainUserId?: number }[];
    playerIds?: number[];
    name?: string;
    type?: string;
  };
  if (!captains?.length)
    return NextResponse.json({ error: "팀장을 입력하세요." }, { status: 400 });
  // member: 팀원 경매(참여자 중 팀장 지정) / team: 팀 경매(참여자가 아닌 클랜원이 팀장, 5라인 모두 경매)
  const auctionType = type === "team" ? "team" : "member";

  const captainIds = new Set(captains.map((c) => c.memberId));

  let players: number[];
  if (playerIds && playerIds.length > 0) {
    players = playerIds.filter((id) => !captainIds.has(id));
  } else {
    const [rosterRows] = await pool.query(
      `SELECT r.member_id FROM auction_roster r
       JOIN members m ON m.id = r.member_id
       WHERE m.status NOT IN ('withdraw', 'black')
       ORDER BY r.member_id ASC`
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
      `INSERT INTO auction_sessions (name, status, auction_type, current_idx, created_by) VALUES (?, 'waiting', ?, 0, ?)`,
      [name || null, auctionType, auth.session.userId]
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
  const auth = await requireAuth(req);
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

    if (!Number.isInteger(points) || points <= 0)
      return NextResponse.json({ error: "잘못된 입찰가입니다." }, { status: 400 });

    // 세션 행을 잠가서 입찰/낙찰이 동시에 처리되지 않도록 직렬화한다.
    const conn = await pool.getConnection();
    try {
    await conn.beginTransaction();
    const fail = async (error: string, status = 400) => {
      await conn.rollback();
      return NextResponse.json({ error }, { status });
    };

    const [[session]] = await conn.query(
      `SELECT id, status, auction_type, timer_started, CAST(timer_started_at AS SIGNED) AS timer_started_at
       FROM auction_sessions WHERE id = ? FOR UPDATE`, [sessionId]
    ) as any[];
    if (!session || session.status !== "running") return fail("경매 진행 중이 아닙니다.");
    if (Number(captain.session_id) !== Number(sessionId)) return fail("이 경매의 팀장이 아닙니다.", 403);

    // 타이머가 돌고 있을 때만 입찰 허용 (0초 이후 입찰 차단)
    const startedAt = session.timer_started_at != null ? Number(session.timer_started_at) : null;
    if (!session.timer_started || !startedAt)
      return fail("아직 입찰이 시작되지 않았습니다.");
    if (Date.now() - startedAt >= AUCTION_SECONDS * 1000)
      return fail("입찰 시간이 종료되었습니다.");

    const [nonCaptains] = await conn.query(
      `SELECT * FROM auction_players WHERE session_id = ? AND is_captain = 0 ORDER BY sort_order ASC`, [sessionId]
    ) as any[];
    // 항상 team_id=null인 첫 번째 선수가 현재 경매 대상
    const currentPlayer = (nonCaptains as any[]).filter((p:any) => p.team_id === null)[0];
    if (!currentPlayer) return fail("경매 대상 없음");

    // 라인 중복 확인: 이미 같은 라인 선수를 낙찰받았으면 입찰 불가.
    // 팀원 경매는 팀장 본인 라인도 채워진 것으로 본다. 팀 경매는 팀장이 선수가 아니라서 5라인 모두 뽑는다.
    const [lineRows] = await conn.query(
      `SELECT ap.id, ap.team_id, r.line FROM auction_players ap
       LEFT JOIN auction_roster r ON r.member_id = ap.member_id
       WHERE ap.session_id = ? AND (ap.id = ? OR ap.id = ? OR ap.team_id = ?)`,
      [sessionId, currentPlayer.id, captainPlayerId, captainPlayerId]
    ) as any[];
    const lineOf = new Map((lineRows as any[]).map((r: any) => [r.id, r.line as string | null]));
    const cpLine = lineOf.get(currentPlayer.id) ?? null;
    if (cpLine) {
      const taken = (lineRows as any[]).some((r: any) =>
        r.line === cpLine && (r.team_id === captainPlayerId || (r.id === captainPlayerId && session.auction_type !== "team")));
      if (taken) return fail("이미 같은 라인 선수를 보유하고 있습니다.");
    }

    const [[topBid]] = await conn.query(
      `SELECT MAX(points) AS max_pts FROM auction_bids WHERE session_id = ? AND player_id = ?`,
      [sessionId, currentPlayer.id]
    ) as any[];
    if (points <= (topBid?.max_pts ?? 0))
      return fail("현재 최고 입찰가보다 높아야 합니다.");

    const [[spent]] = await conn.query(
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
      return fail(`포인트 부족 (잔여: ${remaining})`);

    await conn.query(
      `INSERT INTO auction_bids (session_id, player_id, captain_id, points) VALUES (?, ?, ?, ?)`,
      [sessionId, currentPlayer.id, captainPlayerId, points]
    );
    await conn.query(`UPDATE auction_sessions SET timer_started = 1, timer_started_at = ? WHERE id = ?`, [Date.now(), sessionId]);
    await conn.commit();
    return NextResponse.json({ ok: true });
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }

  if (action === "award") {
    const auth2 = await requireAdmin(req);
    if (!auth2.ok) return auth2.response;

    const conn = await pool.getConnection();
    try {
    await conn.beginTransaction();
    const fail = async (error: string, status = 400) => {
      await conn.rollback();
      return NextResponse.json({ error }, { status });
    };

    // 입찰과 같은 세션 행 잠금 → 낙찰 판정 중에 늦은 입찰이 끼어들 수 없음
    const [[session]] = await conn.query(
      `SELECT id, timer_started, CAST(timer_started_at AS SIGNED) AS timer_started_at
       FROM auction_sessions WHERE id = ? FOR UPDATE`, [sessionId]
    ) as any[];
    if (!session) return fail("세션 없음", 404);
    const startedAt = session.timer_started_at != null ? Number(session.timer_started_at) : null;
    // 마지막 입찰로 타이머가 다시 돌고 있으면 낙찰하지 않는다.
    if (session.timer_started && startedAt && Date.now() - startedAt < AUCTION_SECONDS * 1000)
      return fail("아직 입찰 시간이 남아 있습니다.", 409);

    const [nonCaptains] = await conn.query(
      `SELECT * FROM auction_players WHERE session_id = ? AND is_captain = 0 ORDER BY sort_order ASC`, [sessionId]
    ) as any[];
    // 항상 team_id=null인 첫 번째 선수가 현재 경매 대상
    const currentPlayer = (nonCaptains as any[]).filter((p:any) => p.team_id === null)[0];
    if (!currentPlayer) return fail("대상 없음");

    const [[topBid]] = await conn.query(
      `SELECT ab.*, m.nickname AS captain_name
       FROM auction_bids ab
       JOIN auction_players ap ON ap.id = ab.captain_id
       JOIN members m ON m.id = ap.member_id
       WHERE ab.session_id = ? AND ab.player_id = ? ORDER BY ab.points DESC LIMIT 1`,
      [sessionId, currentPlayer.id]
    ) as any[];

    if (topBid) {
      await conn.query(
        `UPDATE auction_players SET team_id = ? WHERE id = ?`,
        [topBid.captain_id, currentPlayer.id]
      );
    } else {
      // 유찰: sort_order를 최대값+1로 밀어서 맨 뒤로
      const maxOrder = (nonCaptains as any[]).reduce((m: number, p: any) => Math.max(m, p.sort_order), 0);
      await conn.query(
        `UPDATE auction_players SET sort_order = ? WHERE id = ?`,
        [maxOrder + 1, currentPlayer.id]
      );
    }

    await conn.query(
      `UPDATE auction_sessions SET timer_started = 0, timer_started_at = NULL WHERE id = ?`,
      [sessionId]
    );
    await conn.commit();
    // 실제로 낙찰된 입찰을 돌려줘서 화면 표시와 DB가 어긋나지 않게 한다.
    return NextResponse.json({ ok: true, playerId: currentPlayer.id, bid: topBid ?? null });
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }

  if (action === "next") {
    const auth2 = await requireAdmin(req);
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
    const auth2 = await requireAdmin(req);
    if (!auth2.ok) return auth2.response;
    await pool.query(`UPDATE auction_sessions SET timer_started = 1, timer_started_at = ? WHERE id = ?`, [Date.now(), sessionId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "start") {
    const auth2 = await requireAdmin(req);
    if (!auth2.ok) return auth2.response;
    await pool.query(`UPDATE auction_sessions SET status = 'running', current_idx = 0, timer_started = 0, timer_started_at = NULL WHERE id = ?`, [sessionId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "reset") {
    const auth2 = await requireAdmin(req);
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
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const pool = getPool();
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  await pool.query(`DELETE FROM auction_sessions WHERE id = ?`, [sessionId]);
  return NextResponse.json({ ok: true });
}
