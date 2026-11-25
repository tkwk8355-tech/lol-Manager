import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { CATALOG_MAP, MAX_COPIES, availableCount, isOnceOnly, parseRoom, priceOf, validateRoom } from "@/lib/roomShared";

// =============================================================
// 방꾸미기 / 프로필
// GET  /api/room               → 내 방 + 내 프로필 + 가진 물건 + 내 포인트
// GET  /api/room?userId=3      → 다른 사람 방 구경 (보기만)
// POST { action: "buy", key }                    → 포인트로 사기 (point_logs에 'shop'으로 남음)
// POST { action: "save", wallpaper, flooring, items } → 방 배치 저장
// POST { action: "frame" | "icon", key }         → 프로필 테두리 / 아이콘 바꾸기
// =============================================================

export const dynamic = "force-dynamic";

async function loadOwned(userId: number): Promise<Record<string, number>> {
  const [rows] = await getPool().query(
    "SELECT item_key, COUNT(*) AS n FROM user_items WHERE user_id = ? GROUP BY item_key", [userId]
  ) as [any[], unknown];
  return Object.fromEntries(rows.map(r => [r.item_key, Number(r.n)]));
}

async function loadProfile(userId: number) {
  const [rows] = await getPool().query(
    `SELECT u.id, u.nickname, u.role, u.member_id, m.total_points,
            r.wallpaper, r.flooring, r.items, r.frame, r.icon
     FROM users u
     LEFT JOIN members m ON m.id = u.member_id
     LEFT JOIN user_rooms r ON r.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  ) as [any[], unknown];
  return rows[0] ?? null;
}

const frameOf = (key: string | null) => (key && CATALOG_MAP[key]?.cat === "frame" ? key : "frame_none");
const iconOf = (key: string | null) => (key && CATALOG_MAP[key]?.cat === "icon" ? key : "icon_letter");

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const me = auth.session.userId;
  const target = Number(req.nextUrl.searchParams.get("userId") || me);
  if (!Number.isInteger(target) || target <= 0) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  try {
    await ensureSchema();
    const p = await loadProfile(target);
    if (!p) return NextResponse.json({ error: "없는 사용자예요." }, { status: 404 });
    const base = {
      owner: { userId: p.id, nickname: p.nickname, role: p.role, frame: frameOf(p.frame), icon: iconOf(p.icon) },
      room: parseRoom(p.wallpaper, p.flooring, p.items),
    };
    if (target !== me) return NextResponse.json(base);
    return NextResponse.json({
      ...base,
      owned: await loadOwned(me),
      points: p.member_id ? Number(p.total_points ?? 0) : null, // null = 클랜원 명단과 연동 안 됨
    });
  } catch (err) {
    console.error("[room]", err);
    return NextResponse.json({ error: "방을 불러오지 못했어요." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const userId = auth.session.userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  await ensureSchema();
  const pool = getPool();

  // ---------- 사기 ----------
  if (body.action === "buy") {
    const item = CATALOG_MAP[String(body.key ?? "")];
    if (!item) return NextResponse.json({ error: "없는 상품이에요." }, { status: 400 });
    if (priceOf(item) <= 0) return NextResponse.json({ error: "무료 상품이라 살 필요 없어요." }, { status: 400 });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [urows] = await conn.query("SELECT member_id FROM users WHERE id = ? FOR UPDATE", [userId]) as [any[], unknown];
      const memberId: number | null = urows[0]?.member_id ?? null;
      if (!memberId) {
        await conn.rollback();
        return NextResponse.json({ error: "클랜원 명단과 연동된 계정만 포인트로 살 수 있어요. 운영진에게 연동을 요청해 주세요." }, { status: 400 });
      }
      const [crows] = await conn.query(
        "SELECT COUNT(*) AS n FROM user_items WHERE user_id = ? AND item_key = ?", [userId, item.key]
      ) as [any[], unknown];
      const have = Number(crows[0]?.n ?? 0);
      if (isOnceOnly(item.cat) ? have >= 1 : have >= MAX_COPIES) {
        await conn.rollback();
        return NextResponse.json({ error: isOnceOnly(item.cat) ? "이미 갖고 있어요." : `같은 가구는 ${MAX_COPIES}개까지 살 수 있어요.` }, { status: 400 });
      }
      // 포인트가 모자라면 차감되지 않는다 (동시에 눌러도 마이너스가 되지 않게 조건부 UPDATE)
      const [upd] = await conn.query(
        "UPDATE members SET total_points = total_points - ? WHERE id = ? AND total_points >= ?",
        [item.price, memberId, item.price]
      ) as [any, unknown];
      if (!upd.affectedRows) {
        await conn.rollback();
        return NextResponse.json({ error: `포인트가 부족해요. (${item.price}P 필요)` }, { status: 400 });
      }
      await conn.query(
        `INSERT INTO point_logs (member_id, points, type, games, comment, given_by) VALUES (?, ?, 'shop', 0, ?, ?)`,
        [memberId, -item.price, `[방꾸미기] ${item.name}`, userId]
      );
      await conn.query("INSERT INTO user_items (user_id, item_key, price) VALUES (?, ?, ?)", [userId, item.key, item.price]);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      console.error("[room/buy]", err);
      return NextResponse.json({ error: "구매에 실패했어요." }, { status: 500 });
    } finally {
      conn.release();
    }
    const p = await loadProfile(userId);
    return NextResponse.json({ ok: true, owned: await loadOwned(userId), points: Number(p?.total_points ?? 0) });
  }

  // ---------- 방 저장 ----------
  if (body.action === "save") {
    const owned = await loadOwned(userId);
    const v = validateRoom(body, owned);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    await pool.query(
      `INSERT INTO user_rooms (user_id, wallpaper, flooring, items) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE wallpaper = VALUES(wallpaper), flooring = VALUES(flooring), items = VALUES(items)`,
      [userId, v.room.wallpaper, v.room.flooring, JSON.stringify(v.room.items)]
    );
    return NextResponse.json({ ok: true, room: v.room });
  }

  // ---------- 프로필 테두리 / 아이콘 ----------
  if (body.action === "frame" || body.action === "icon") {
    const cat = body.action; // 'frame' | 'icon' — 컬럼 이름과 같다
    const key = String(body.key ?? "");
    const label = cat === "frame" ? "테두리" : "아이콘";
    if (CATALOG_MAP[key]?.cat !== cat) return NextResponse.json({ error: `없는 ${label}예요.` }, { status: 400 });
    if (availableCount(await loadOwned(userId), key) < 1) return NextResponse.json({ error: `갖고 있지 않은 ${label}예요.` }, { status: 400 });
    await pool.query(
      cat === "frame"
        ? "INSERT INTO user_rooms (user_id, frame) VALUES (?, ?) ON DUPLICATE KEY UPDATE frame = VALUES(frame)"
        : "INSERT INTO user_rooms (user_id, icon) VALUES (?, ?) ON DUPLICATE KEY UPDATE icon = VALUES(icon)",
      [userId, key]
    );
    return NextResponse.json({ ok: true, [cat]: key });
  }

  return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
}
