import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { rejectMobile } from "@/lib/minigameDevice";
import { AIM_DURATION_MS, AIM_HIT_POINTS, AIM_MAX_BONUS, AIM_MISS_PENALTY } from "@/lib/aimGameShared";

// =============================================================
// 미니게임: 에임 연습 — 기록 저장 + 랭킹
// GET  /api/minigame/aim?period=week|all → 랭킹(1인 1기록, 최고점) + 내 최고 기록
// POST { action: "start" }               → 판 시작 기록 (기록 제출 검증용)
// POST { action: "submit", hits, misses, bonus } → 점수는 서버에서 계산해서 저장
// =============================================================

export const dynamic = "force-dynamic";

const RANK_LIMIT = 20;
const MIN_PLAY_MS = AIM_DURATION_MS - 1_500; // 네트워크 지연 감안
const MAX_PLAY_MS = 10 * 60_000;
const MAX_HITS = 400; // 30초에 400번 이상 맞히는 건 사람이 아님
const MAX_MISSES = 2_000;

// 판 시작 시각 (userId → ms). 서버 메모리에만 둔다.
const globalForAim = globalThis as unknown as { _aimStarts?: Map<number, number> };
const starts = (globalForAim._aimStarts ??= new Map<number, number>());

type RankRow = { userId: number; nickname: string; score: number; hits: number; misses: number; avgMs: number; createdAt: string };

const weekStartSql = "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"; // 이번 주 월요일 0시

async function loadRanking(period: "week" | "all"): Promise<RankRow[]> {
  const pool = getPool();
  const where = period === "week" ? `WHERE created_at >= ${weekStartSql}` : "";
  const [rows] = await pool.query(
    `SELECT r.user_id, r.nickname, r.score, r.hits, r.misses, r.avg_ms, r.created_at
     FROM aim_records r
     JOIN (SELECT user_id, MAX(score) AS best FROM aim_records ${where} GROUP BY user_id) b
       ON b.user_id = r.user_id AND b.best = r.score
     ${where ? where.replace("created_at", "r.created_at") : ""}
     ORDER BY r.score DESC, r.created_at ASC`
  ) as [any[], unknown];
  const seen = new Set<number>();
  const result: RankRow[] = [];
  for (const r of rows) {
    if (seen.has(r.user_id)) continue; // 같은 최고점이 여러 번이면 처음 것만
    seen.add(r.user_id);
    result.push({
      userId: r.user_id, nickname: r.nickname, score: r.score, hits: r.hits,
      misses: r.misses, avgMs: r.avg_ms, createdAt: r.created_at,
    });
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
    console.error("[minigame/aim]", err);
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
  const elapsed = startedAt ? Date.now() - startedAt : -1;
  if (!startedAt || elapsed < MIN_PLAY_MS || elapsed > MAX_PLAY_MS) {
    return NextResponse.json({ error: "기록을 확인할 수 없어요. 다시 해 주세요." }, { status: 400 });
  }
  const hits = toInt(body.hits), misses = toInt(body.misses), bonus = toInt(body.bonus);
  if (hits === null || misses === null || bonus === null || hits > MAX_HITS || misses > MAX_MISSES || bonus > hits * AIM_MAX_BONUS) {
    return NextResponse.json({ error: "기록이 이상해요. 다시 해 주세요." }, { status: 400 });
  }
  starts.delete(userId);

  const score = Math.max(0, hits * AIM_HIT_POINTS + bonus - misses * AIM_MISS_PENALTY);
  const avgMs = hits > 0 ? Math.round(AIM_DURATION_MS / hits) : 0;

  try {
    await ensureSchema();
    const pool = getPool();
    const [prevRows] = await pool.query(
      "SELECT MAX(score) AS best FROM aim_records WHERE user_id = ?", [userId]
    ) as [any[], unknown];
    const prevBest: number | null = prevRows[0]?.best ?? null;
    await pool.query(
      "INSERT INTO aim_records (user_id, nickname, score, hits, misses, avg_ms) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, nickname, score, hits, misses, avgMs]
    );
    const week = await loadRanking("week");
    const weekRank = week.findIndex(r => r.userId === userId) + 1;
    return NextResponse.json({
      score, hits, misses, avgMs,
      best: Math.max(prevBest ?? 0, score),
      isNewBest: prevBest === null || score > prevBest,
      weekRank: weekRank || null,
    });
  } catch (err) {
    console.error("[minigame/aim]", err);
    return NextResponse.json({ error: "기록 저장에 실패했어요." }, { status: 500 });
  }
}
