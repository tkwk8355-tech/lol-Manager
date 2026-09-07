import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncScrimMatches } from "@/lib/syncScrim";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const memberId = Number(body.memberId);
    const startAt: string | null = body.startAt ? String(body.startAt) : null;
    if (!memberId) return NextResponse.json({ error: "클랜원을 선택하세요." }, { status: 400 });
    if (!startAt) return NextResponse.json({ error: "시작 시각을 입력하세요." }, { status: 400 });
    const result = await syncScrimMatches(memberId, startAt, auth.session.userId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "동기화 실패" }, { status: 500 });
  }
}
