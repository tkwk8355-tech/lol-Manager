import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const pool = getPool();
  const [rows] = await pool.query(`SELECT key_name, value FROM app_settings`) as [any[], any];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key_name] = r.value;
  return NextResponse.json({ settings });
}

// 화면에서 바꿀 수 있는 설정 키 목록. 새 설정을 추가하면 여기에도 넣어야 한다.
const ALLOWED_SETTING_KEYS = new Set(["auction_show_roster"]);

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const pool = getPool();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const entries = Object.entries(body);
  const invalid = entries.filter(([key]) => !ALLOWED_SETTING_KEYS.has(key)).map(([key]) => key);
  if (invalid.length) {
    return NextResponse.json({ error: `허용되지 않은 설정 키: ${invalid.join(", ")}` }, { status: 400 });
  }
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO app_settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?`,
      [key, String(value), String(value)]
    );
  }
  return NextResponse.json({ ok: true });
}
