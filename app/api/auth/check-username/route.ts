import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { USERNAME_HINT, USERNAME_RULE } from "@/lib/signupShared";

// GET /api/auth/check-username?username=abc → { available: boolean, error? }
// 회원가입 '중복 확인' 버튼용. 로그인 전에 부르므로 인증 없음 (횟수 제한만)

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "check-username", 30, 60_000);
  if (limited) return limited;
  const username = (req.nextUrl.searchParams.get("username") ?? "").trim();
  if (!USERNAME_RULE.test(username)) return NextResponse.json({ available: false, error: `아이디는 ${USERNAME_HINT}로 정해 주세요.` });
  try {
    await ensureSchema();
    const [rows] = await getPool().query("SELECT 1 FROM users WHERE username = ? LIMIT 1", [username]) as [any[], unknown];
    return NextResponse.json(rows.length ? { available: false, error: "이미 사용 중인 아이디예요." } : { available: true });
  } catch (err) {
    console.error("[check-username]", err);
    return NextResponse.json({ error: "확인하지 못했어요." }, { status: 500 });
  }
}
