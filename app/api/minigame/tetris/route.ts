import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { rejectMobile } from "@/lib/minigameDevice";
import { MIN_SPRINT_MS, SPRINT_LINES, TETRIS_COUNTDOWN_MS } from "@/lib/tetrisShared";

// =============================================================
// 미니게임: 테트리스 40줄 — 기록 저장 + 랭킹 (시간이 짧을수록 위)
// GET  /api/minigame/tetris?period=week|all → 랭킹(1인 최고 기록) + 내 순위
// POST { action: "start" }                  → 판 시작 시각 기록 (제출 검증용)
// POST { action: "submit", timeMs, pieces }  → 기록 저장
// =============================================================

export const dynamic = "force-dynamic";

const RANK_LIMIT = 20;
const MIN_PIECES = (SPRINT_LINES * 10) / 4; // 40줄 = 400칸 = 블록 최소 100개
const MAX_PIECES = 1_000;
const MAX_PLAY_MS = 30 * 60_000;
const CLOCK_SLACK_MS = 1_500; // 화면 시계와 서버 시계 차이 허용
const SUBMIT_SLACK_MS = 15_000; // 끝난 뒤 제출까지 걸릴 수 있는 시간

const globalForTetris = globalThis as unknown as { _tetrisStarts?: Map<number, number> };
const starts = (globalForTetris._tetrisStarts ??= new Map<number, number>());

type RankRow = { userId: number; nickname: string; timeMs: number; pieces: number; createdAt: string };

const weekStartSql = "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"; // 이번 주 월요일 0시

async function loadRanking(period: "week" | "all"): Promise<RankRow[]> {
  const pool = getPool();
  const inner = period === "week" ? `WHERE created_at >= ${weekStartSql}` : "";
  const outer = period === "week" ? `WHERE r.created_at >= ${weekStartSql}` : "";
  const [rows] = await pool.query(
    `SELECT r.user_id, r.nickname, r.time_ms, r.pieces, r.created_at
     FROM tetris_records r
     JOIN (SELECT user_id, MIN(time_ms) AS best FROM tetris_records ${inner} GROUP BY user_id) b
       ON b.user_id = r.user_id AND b.best = r.time_ms
     ${outer}
     ORDER BY r.time_ms ASC, r.created_at ASC`
  ) as [any[], unknown];
  const seen = new Set<number>();
  const result: RankRow[] = [];
  for (const r of rows) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    result.push({ userId: r.user_id, nickname: r.nickname, timeMs: r.time_ms, pieces: r.pieces, createdAt: r.created_at });
  }
  return result;
}

const toInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

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
    console.error("[minigame/tetris]", err);
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
    starts.set(userId, Date.now());
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "submit") return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });

  const startedAt = starts.get(userId);
  const timeMs = toInt(body.timeMs);
  const pieces = toInt(body.pieces);
  if (!startedAt || timeMs === null || pieces === null) {
    return NextResponse.json({ error: "기록을 확인할 수 없어요. 다시 해 주세요." }, { status: 400 });
  }
  // 서버가 잰 시간(시작 요청 ~ 지금)과 화면이 보낸 기록이 맞는지 확인
  const played = Date.now() - startedAt - TETRIS_COUNTDOWN_MS;
  const plausible =
    timeMs >= MIN_SPRINT_MS && timeMs <= MAX_PLAY_MS
    && timeMs <= played + CLOCK_SLACK_MS && timeMs >= played - SUBMIT_SLACK_MS
    && pieces >= MIN_PIECES && pieces <= MAX_PIECES;
  if (!plausible) {
    return NextResponse.json({ error: "기록이 이상해요. 다시 해 주세요." }, { status: 400 });
  }
  starts.delete(userId);

  try {
    await ensureSchema();
    const pool = getPool();
    const [prevRows] = await pool.query(
      "SELECT MIN(time_ms) AS best FROM tetris_records WHERE user_id = ?", [userId]
    ) as [any[], unknown];
    const prevBest: number | null = prevRows[0]?.best ?? null;
    await pool.query(
      "INSERT INTO tetris_records (user_id, nickname, time_ms, pieces) VALUES (?, ?, ?, ?)",
      [userId, nickname, timeMs, pieces]
    );
    const week = await loadRanking("week");
    const weekRank = week.findIndex(r => r.userId === userId) + 1;
    return NextResponse.json({
      timeMs, pieces,
      best: prevBest === null ? timeMs : Math.min(prevBest, timeMs),
      isNewBest: prevBest === null || timeMs < prevBest,
      weekRank: weekRank || null,
    });
  } catch (err) {
    console.error("[minigame/tetris]", err);
    return NextResponse.json({ error: "기록 저장에 실패했어요." }, { status: 500 });
  }
}
