import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { rejectMobile } from "@/lib/minigameDevice";
import { APPLE_COUNTDOWN_MS, APPLE_GAME_MS, makeAppleBoard, replayAppleMoves } from "@/lib/appleGameShared";

// =============================================================
// 미니게임: 사과게임 — 기록 저장 + 랭킹 (점수가 높을수록 위)
// GET  /api/minigame/apple?period=week|all → 랭킹(1인 최고점) + 내 순위
// POST { action: "start" }           → 새 판을 만들어 돌려주고 시작 시각 기록
// POST { action: "submit", moves }   → 서버가 묶음을 다시 따라가 점수 계산 후 저장
// =============================================================

export const dynamic = "force-dynamic";

const RANK_LIMIT = 20;
const CLOCK_SLACK_MS = 1_500; // 화면 시계와 서버 시계 차이 허용
const SUBMIT_SLACK_MS = 20_000; // 끝난 뒤 제출까지 걸릴 수 있는 시간

type Session = { at: number; board: number[] };
const globalForApple = globalThis as unknown as { _appleStarts?: Map<number, Session> };
const starts = (globalForApple._appleStarts ??= new Map<number, Session>());

type RankRow = { userId: number; nickname: string; score: number; createdAt: string };

const weekStartSql = "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"; // 이번 주 월요일 0시

async function loadRanking(period: "week" | "all"): Promise<RankRow[]> {
  const pool = getPool();
  const inner = period === "week" ? `WHERE created_at >= ${weekStartSql}` : "";
  const outer = period === "week" ? `WHERE r.created_at >= ${weekStartSql}` : "";
  const [rows] = await pool.query(
    `SELECT r.user_id, r.nickname, r.score, r.created_at
     FROM apple_records r
     JOIN (SELECT user_id, MAX(score) AS best FROM apple_records ${inner} GROUP BY user_id) b
       ON b.user_id = r.user_id AND b.best = r.score
     ${outer}
     ORDER BY r.score DESC, r.created_at ASC`
  ) as [any[], unknown];
  const seen = new Set<number>();
  const result: RankRow[] = [];
  for (const r of rows) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    result.push({ userId: r.user_id, nickname: r.nickname, score: r.score, createdAt: r.created_at });
  }
  return result;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const period = req.nextUrl.searchParams.get("period") === "all" ? "all" : "week";
  try {
    await ensureSchema();
    const all = await loadRanking(period);
    const myIndex = all.findIndex(r => r.userId === auth.session.userId);
    return NextResponse.json({
      period,
      ranking: all.slice(0, RANK_LIMIT),
      me: myIndex >= 0 ? { ...all[myIndex], rank: myIndex + 1 } : null,
      total: all.length,
    });
  } catch (err) {
    console.error("[minigame/apple]", err);
    return NextResponse.json({ error: "랭킹을 불러오지 못했어요." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, nickname } = auth.session;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  if (body.action === "start") {
    const mobile = rejectMobile(req);
    if (mobile) return mobile;
    const board = makeAppleBoard();
    starts.set(userId, { at: Date.now(), board });
    return NextResponse.json({ board });
  }
  if (body.action !== "submit") return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });

  const session = starts.get(userId);
  if (!session) return NextResponse.json({ error: "기록을 확인할 수 없어요. 다시 해 주세요." }, { status: 400 });

  // 2분이 다 지난 뒤에 낸 기록인지 확인 (일찍 내거나 한참 뒤에 내면 거절)
  const played = Date.now() - session.at - APPLE_COUNTDOWN_MS;
  if (played < APPLE_GAME_MS - CLOCK_SLACK_MS || played > APPLE_GAME_MS + SUBMIT_SLACK_MS) {
    starts.delete(userId);
    return NextResponse.json({ error: "기록 시간이 맞지 않아요. 다시 해 주세요." }, { status: 400 });
  }
  const score = replayAppleMoves(session.board, body.moves);
  starts.delete(userId);
  if (score === null) return NextResponse.json({ error: "기록이 이상해요. 다시 해 주세요." }, { status: 400 });
  const moveCount = (body.moves as unknown[]).length;

  try {
    await ensureSchema();
    const pool = getPool();
    const [prevRows] = await pool.query(
      "SELECT MAX(score) AS best FROM apple_records WHERE user_id = ?", [userId]
    ) as [any[], unknown];
    const prevBest: number | null = prevRows[0]?.best ?? null;
    await pool.query(
      "INSERT INTO apple_records (user_id, nickname, score, moves) VALUES (?, ?, ?, ?)",
      [userId, nickname, score, moveCount]
    );
    const week = await loadRanking("week");
    const weekRank = week.findIndex(r => r.userId === userId) + 1;
    return NextResponse.json({
      score,
      moves: moveCount,
      best: prevBest === null ? score : Math.max(prevBest, score),
      isNewBest: prevBest === null || score > prevBest,
      weekRank: weekRank || null,
    });
  } catch (err) {
    console.error("[minigame/apple]", err);
    return NextResponse.json({ error: "기록 저장에 실패했어요." }, { status: 500 });
  }
}
