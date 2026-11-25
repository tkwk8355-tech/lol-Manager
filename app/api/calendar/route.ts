// =============================================================
// 클랜 공유 캘린더 API
//   GET    /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD   (로그인한 클랜원 전원)
//          → 일정 + 경고 해제일(경고일 + 3개월) + 생일
//   POST   /api/calendar            일정 추가 (운영진)
//   PATCH  /api/calendar            일정 수정 (운영진, 본인이 등록한 일정만)
//   DELETE /api/calendar?id=1       일정 삭제 (운영진, 본인이 등록한 일정만)
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 경고가 풀리기까지의 기간(개월)
const WARNING_MONTHS = 3;
const COLORS = ["blue", "green", "red", "orange", "purple", "gray"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// 'YYYY-MM-DD' (DATE 컬럼은 dateStrings 설정으로 문자열로 옴)
const ymd = (v: string) => String(v).slice(0, 10);

function isLeap(y: number) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

// 입력 검증 + 정리. 문제가 있으면 에러 문구를 돌려준다.
function parseEvent(body: any): { error: string } | {
  title: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; color: string; memo: string | null;
} {
  const title = String(body.title ?? "").trim().slice(0, 100);
  const startDate = String(body.startDate ?? "");
  const endDate = String(body.endDate ?? "") || startDate;
  const allDay = body.allDay !== false;
  const startTime = allDay ? null : String(body.startTime ?? "");
  const endTime = allDay ? null : String(body.endTime ?? "") || null;
  const color = COLORS.includes(body.color) ? body.color : "blue";
  const memo = String(body.memo ?? "").trim().slice(0, 500) || null;

  if (!title) return { error: "제목을 입력하세요." };
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return { error: "날짜 형식이 올바르지 않습니다." };
  if (endDate < startDate) return { error: "종료일이 시작일보다 빠릅니다." };
  if (!allDay) {
    if (!startTime || !TIME_RE.test(startTime)) return { error: "시작 시간을 입력하세요." };
    if (endTime && !TIME_RE.test(endTime)) return { error: "종료 시간 형식이 올바르지 않습니다." };
    if (endTime && startDate === endDate && endTime < startTime) return { error: "종료 시간이 시작 시간보다 빠릅니다." };
  }
  return { title, startDate, endDate, startTime, endTime, color, memo };
}

// 본인이 등록한 일정인지 확인. 아니면 바로 돌려줄 응답을 준다.
async function checkOwner(id: number, userId: number): Promise<NextResponse | null> {
  const [rows] = await getPool().query("SELECT created_by FROM calendar_events WHERE id = ?", [id]) as [any[], any];
  if (rows.length === 0) return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  if (rows[0].created_by !== userId) {
    return NextResponse.json({ error: "본인이 등록한 일정만 수정·삭제할 수 있습니다." }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return NextResponse.json({ error: "from, to (YYYY-MM-DD) 필수" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const pool = getPool();

    // 1) 일정 — 기간이 조회 범위와 겹치는 것
    const [eventRows] = await pool.query(
      `SELECT e.id, e.title, e.start_date, e.end_date, e.start_time, e.end_time, e.color, e.memo,
              e.created_by, COALESCE(u.nickname, '') AS created_by_name
       FROM calendar_events e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.start_date <= ? AND e.end_date >= ?
       ORDER BY e.start_date, e.start_time IS NOT NULL, e.start_time, e.id`,
      [to, from]
    ) as [any[], any];

    // 2) 경고 해제일 — 경고일 + 3개월 이 조회 범위 안에 있는 것 (탈퇴/추방 제외)
    const [warnRows] = await pool.query(
      `SELECT w.id, w.type, w.warned_at,
              DATE_ADD(w.warned_at, INTERVAL ${WARNING_MONTHS} MONTH) AS release_date,
              COALESCE(a.game_name, m.nickname) AS name
       FROM warnings w
       JOIN members m ON m.id = w.member_id
       LEFT JOIN accounts a ON a.member_id = m.id AND a.is_main = 1
       WHERE m.status NOT IN ('withdraw', 'black')
         AND DATE_ADD(w.warned_at, INTERVAL ${WARNING_MONTHS} MONTH) BETWEEN ? AND ?
       ORDER BY release_date, name`,
      [from, to]
    ) as [any[], any];

    // 3) 생일 — 조회 범위에 걸친 연도마다 월/일을 맞춰서 만든다 (탈퇴/추방 제외)
    const [birthRows] = await pool.query(
      `SELECT m.id, m.birth_date, COALESCE(a.game_name, m.nickname) AS name
       FROM members m
       LEFT JOIN accounts a ON a.member_id = m.id AND a.is_main = 1
       WHERE m.birth_date IS NOT NULL AND m.status NOT IN ('withdraw', 'black')`
    ) as [any[], any];
    const birthdays: { memberId: number; name: string; date: string }[] = [];
    const y1 = Number(from.slice(0, 4)), y2 = Number(to.slice(0, 4));
    for (const r of birthRows) {
      const bd = ymd(r.birth_date);
      const md = bd.slice(5); // MM-DD
      for (let y = y1; y <= y2; y++) {
        const d = `${y}-${md === "02-29" && !isLeap(y) ? "02-28" : md}`; // 윤년생은 평년엔 2/28
        if (d >= from && d <= to) birthdays.push({ memberId: r.id, name: r.name, date: d });
      }
    }

    return NextResponse.json({
      events: eventRows.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: ymd(e.start_date),
        endDate: ymd(e.end_date),
        startTime: e.start_time,
        endTime: e.end_time,
        allDay: !e.start_time,
        color: e.color,
        memo: e.memo,
        createdBy: e.created_by_name,
        createdById: e.created_by ?? null,
      })),
      warnings: warnRows.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        warnedAt: ymd(w.warned_at),
        releaseDate: ymd(w.release_date),
      })),
      birthdays,
      warningMonths: WARNING_MONTHS,
    });
  } catch (err) {
    console.error("[calendar] 조회 실패:", err);
    return NextResponse.json({ error: "캘린더 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const ev = parseEvent(await req.json().catch(() => ({})));
  if ("error" in ev) return NextResponse.json({ error: ev.error }, { status: 400 });

  await ensureSchema();
  const [res] = await getPool().query(
    `INSERT INTO calendar_events (title, start_date, end_date, start_time, end_time, color, memo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ev.title, ev.startDate, ev.endDate, ev.startTime, ev.endTime, ev.color, ev.memo, auth.session.userId]
  ) as [any, any];
  return NextResponse.json({ ok: true, id: res.insertId });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const ev = parseEvent(body);
  if ("error" in ev) return NextResponse.json({ error: ev.error }, { status: 400 });

  await ensureSchema();
  const denied = await checkOwner(id, auth.session.userId);
  if (denied) return denied;
  await getPool().query(
    `UPDATE calendar_events
     SET title=?, start_date=?, end_date=?, start_time=?, end_time=?, color=?, memo=?, updated_at=NOW()
     WHERE id=?`,
    [ev.title, ev.startDate, ev.endDate, ev.startTime, ev.endTime, ev.color, ev.memo, id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  await ensureSchema();
  const denied = await checkOwner(id, auth.session.userId);
  if (denied) return denied;
  await getPool().query("DELETE FROM calendar_events WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
