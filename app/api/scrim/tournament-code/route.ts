import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

const BASE = "https://b2c-api.deeplol.gg";
// 외부 서비스 비밀번호는 코드에 두지 않고 환경변수로 관리한다.
const PASSWORD = process.env.DEEPLOL_TOURNAMENT_PASSWORD;
const HEADERS = {
  "Content-Type": "application/json",
  "Origin": "https://clash.deeplol.gg",
  "Referer": "https://clash.deeplol.gg/",
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { allowScrimOnly: true });
  if (!auth.ok) return auth.response;
  if (!PASSWORD) {
    return NextResponse.json({ error: "DEEPLOL_TOURNAMENT_PASSWORD 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }
  try {
    // 1. 로그인 → server_id 획득
    const loginRes = await fetch(
      `${BASE}/tournament/tournament_login?password=${encodeURIComponent(PASSWORD)}`,
      { method: "POST", headers: HEADERS, body: JSON.stringify({ password: PASSWORD }), cache: "no-store" }
    );
    if (!loginRes.ok) return NextResponse.json({ error: "로그인 실패" }, { status: 502 });
    const loginJson = await loginRes.json();
    const serverId = loginJson.server_id;
    if (!serverId) return NextResponse.json({ error: "server_id 없음" }, { status: 502 });

    // 2. 코드 생성
    const params = new URLSearchParams({
      server_id: String(serverId),
      server_name: "롤 또간집",
      server_comment: "또간집",
      spectator_type: "ALL",
      pick_type: "TOURNAMENT_DRAFT",
      map_name: "SUMMONERS_RIFT",
      platform_id: "KR",
    });
    const codeRes = await fetch(`${BASE}/tournament/tournament_code?${params}`, { headers: HEADERS, cache: "no-store" });
    if (!codeRes.ok) return NextResponse.json({ error: "코드 생성 실패" }, { status: 502 });
    const codeJson = await codeRes.json();
    const code = codeJson.tournament_code_list?.[0];
    if (!code) return NextResponse.json({ error: "코드 없음" }, { status: 502 });

    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ error: "네트워크 오류" }, { status: 500 });
  }
}
