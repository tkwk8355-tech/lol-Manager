import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { findMemberByRiotId } from "@/lib/memberVerify";

// POST { riotId: "닉네임#태그" } → { ok: true, nickname } | { ok: false, error }
// 회원가입 '클랜원 확인' 버튼용. 로그인 전에 부르므로 인증 없음 (횟수 제한만)

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "verify-member", 15, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { riotId?: unknown } | null;
  try {
    await ensureSchema();
    const m = await findMemberByRiotId(getPool(), String(body?.riotId ?? ""));
    // 다른 사람 정보가 새지 않게 클랜원 닉네임만 돌려준다
    return NextResponse.json(m.ok ? { ok: true, nickname: m.nickname } : m);
  } catch (err) {
    console.error("[verify-member]", err);
    return NextResponse.json({ ok: false, error: "확인하지 못했어요." }, { status: 500 });
  }
}
