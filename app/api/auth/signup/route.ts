import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { findMemberByRiotId } from "@/lib/memberVerify";
import { MIN_PASSWORD, USERNAME_HINT, USERNAME_RULE } from "@/lib/signupShared";

// =============================================================
// 회원가입 신청
// POST { username, password, riotId, nickname? }
// - 아이디 형식 · 중복 확인
// - 클랜원 인증: 롤 계정(닉네임#태그)으로 명단의 클랜원을 찾아 users.member_id로 연동
//   (클랜원 1명당 계정 1개 — users.member_id UNIQUE라 DB에서도 중복이 막힌다)
// - 가입하면 status = 'pending' → 운영진이 클랜원 관리 > 계정 탭에서 승인해야 로그인 가능
// =============================================================

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "signup", 10, 10 * 60_000);
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => ({}));
    const uname = String(body.username || "").trim();
    const pw = String(body.password || "");
    const riotId = String(body.riotId || "");
    const nickInput = String(body.nickname || "").trim();

    if (!USERNAME_RULE.test(uname)) return NextResponse.json({ error: `아이디는 ${USERNAME_HINT}로 정해 주세요.` }, { status: 400 });
    if (pw.length < MIN_PASSWORD) return NextResponse.json({ error: `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.` }, { status: 400 });
    if (nickInput.length > 30) return NextResponse.json({ error: "닉네임은 30자까지예요." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();
    const match = await findMemberByRiotId(pool, riotId);
    if (!match.ok) return NextResponse.json({ error: match.error }, { status: 400 });
    const nickname = nickInput || match.nickname;

    try {
      await pool.query(
        "INSERT INTO users (username, password, nickname, role, status, member_id) VALUES (?, ?, ?, 'member', 'pending', ?)",
        [uname, hashPassword(pw), nickname, match.memberId]
      );
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        // 아이디가 겹쳤는지, 같은 클랜원으로 동시에 가입했는지 구분
        const isMember = String(e?.sqlMessage ?? "").includes("member_id");
        return NextResponse.json(
          { error: isMember ? "이 클랜원은 이미 가입된 계정이 있어요." : "이미 사용 중인 아이디예요." },
          { status: 409 }
        );
      }
      throw e;
    }
    return NextResponse.json({ ok: true, pending: true, memberNickname: match.nickname });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "가입 처리 중 오류가 발생했어요." }, { status: 500 });
  }
}
