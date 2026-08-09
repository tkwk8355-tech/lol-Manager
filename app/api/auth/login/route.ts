import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { createSessionToken, verifyPassword, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC } from "@/lib/auth";
import { resolvePartyIdentity } from "@/lib/party";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json().catch(() => ({}));
    const uname = String(username || "").trim();
    const pw = String(password || "");
    if (!uname || !pw) {
      return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT id, username, password, nickname, role FROM users WHERE username = ?",
      [uname]
    ) as [any[], any];
    const user = rows[0];

    if (!user || !verifyPassword(pw, user.password)) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const token = createSessionToken({
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
    });

    const identity = await resolvePartyIdentity(user.id).catch(() => null);
    const res = NextResponse.json({
      user: {
        userId: user.id, username: user.username, nickname: user.nickname, role: user.role,
        linkedRiotId: identity?.displayName ?? null,
      },
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "로그인 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
