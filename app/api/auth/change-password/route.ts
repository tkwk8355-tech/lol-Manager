import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import {
  requireAuth, hashPassword, verifyPassword, createSessionToken, invalidateUserState,
  SESSION_COOKIE_NAME, sessionCookieOptions,
} from "@/lib/auth";

// 로그인한 본인이 현재 비밀번호를 확인하고 새 비밀번호로 바꾼다.
// (비밀번호를 완전히 잊어버린 경우는 운영진에게 요청해 /api/userinfo/reset-password로 1234 초기화 받아야 한다.)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
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

    // token_version을 올려 다른 기기/브라우저의 기존 로그인을 모두 끊는다.
    await pool.query(
      "UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?",
      [hashPassword(next), auth.session.userId]
    );
    invalidateUserState(auth.session.userId);
    const [verRows] = await pool.query("SELECT token_version FROM users WHERE id = ?", [auth.session.userId]) as [any[], any];

    // 지금 요청한 브라우저는 로그인 상태를 유지하도록 새 쿠키를 발급한다.
    const { exp: _exp, ...rest } = auth.session;
    const token = createSessionToken({ ...rest, tv: Number(verRows[0]?.token_version ?? 0) });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(undefined, req));
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "비밀번호 변경 실패" }, { status: 500 });
  }
}
