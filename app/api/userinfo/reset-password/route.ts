import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

// 운영진이 특정 로그인 계정의 비밀번호를 기본값(1234)으로 초기화한다.
// 비밀번호를 잊어버린 클랜원을 위한 구제 절차. 초기화 후 본인이
// 로그인해서 /api/auth/change-password로 다시 바꾸도록 안내해야 한다.
const DEFAULT_RESET_PASSWORD = "1234";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { userId } = await req.json().catch(() => ({}));
    const uid = Number(userId);
    if (!uid) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const [result] = await pool.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashPassword(DEFAULT_RESET_PASSWORD), uid]
    ) as any;
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "존재하지 않는 계정입니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, password: DEFAULT_RESET_PASSWORD });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "초기화 실패" }, { status: 500 });
  }
}
