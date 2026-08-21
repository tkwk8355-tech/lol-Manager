import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password, nickname } = await req.json().catch(() => ({}));
    const uname = String(username || "").trim();
    const pw = String(password || "");
    const nick = String(nickname || "").trim();

    if (!uname || uname.length < 3) return NextResponse.json({ error: "아이디는 3자 이상이어야 합니다." }, { status: 400 });
    if (!pw || pw.length < 4) return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    if (!nick) return NextResponse.json({ error: "닉네임을 입력하세요." }, { status: 400 });

    await ensureSchema();
    const pool = getPool();

    try {
      await pool.query(
        "INSERT INTO users (username, password, nickname, role, status) VALUES (?, ?, ?, 'member', 'pending')",
        [uname, hashPassword(pw), nick]
      );
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "가입 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
