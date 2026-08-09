import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, hashPassword, verifyPassword } from "@/lib/auth";

// 로그인한 본인이 현재 비밀번호를 확인하고 새 비밀번호로 바꾼다.
// (비밀번호를 완전히 잊어버린 경우는 운영진에게 요청해 /api/userinfo/reset-password로 1234 초기화 받아야 한다.)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const { currentPassword, newPassword } = await req.json().catch(() => ({}));
    const cur = String(currentPassword || "");
    const next = String(newPassword || "");

    if (!cur) return NextResponse.json({ error: "현재 비밀번호를 입력하세요." }, { status: 400 });
    if (!next || next.length < 4) {
      return NextResponse.json({ error: "새 비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT password FROM users WHERE id = ?",
      [auth.session.userId]
    ) as [any[], any];
    const row = rows[0];
    if (!row || !verifyPassword(cur, row.password)) {
      return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword(next), auth.session.userId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "비밀번호 변경 실패" }, { status: 500 });
  }
}
