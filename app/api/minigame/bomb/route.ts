import { NextRequest, NextResponse } from "next/server";
import { requireAuth, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { rejectMobile } from "@/lib/minigameDevice";
import {
  BombGameError, backToLobby, createRoom, joinRoom, leaveRoom, listRooms, startGame, syncRoom,
} from "@/lib/bombGame";

// 방 상태가 서버 메모리에 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

type BombAction =
  | { action: "create"; name?: string }
  | { action: "join"; roomId: number }
  | { action: "leave"; roomId: number }
  | { action: "start"; roomId: number }
  | { action: "lobby"; roomId: number }
  | { action: "sync"; roomId: number; x?: number; y?: number };

const toErrorResponse = (err: unknown) => {
  if (err instanceof BombGameError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[minigame/bomb]", err);
  return NextResponse.json({ error: "서버 오류" }, { status: 500 });
};

// GET /api/minigame/bomb → 방 목록
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ rooms: listRooms() });
}

// POST /api/minigame/bomb → create / join / leave / start / lobby / sync
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as BombAction | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  try {
    // sync는 초당 20번 오므로 DB 조회 없이 쿠키 서명만 확인한다.
    if (body.action === "sync") {
      const session = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
      if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
      const pos = typeof body.x === "number" && typeof body.y === "number" ? { x: body.x, y: body.y } : null;
      return NextResponse.json({ room: syncRoom(session.userId, Number(body.roomId), pos) });
    }

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = { userId: auth.session.userId, nickname: auth.session.nickname };

    // 방 만들기/입장은 PC에서만 (나가기는 휴대폰에서도 허용)
    if (body.action === "create" || body.action === "join") {
      const mobile = rejectMobile(req);
      if (mobile) return mobile;
    }

    switch (body.action) {
      case "create":
        return NextResponse.json({ room: createRoom(user, String(body.name ?? "")) });
      case "join":
        return NextResponse.json({ room: joinRoom(user, Number(body.roomId)) });
      case "leave":
        leaveRoom(user.userId, Number(body.roomId));
        return NextResponse.json({ ok: true });
      case "start":
        return NextResponse.json({ room: startGame(user.userId, Number(body.roomId)) });
      case "lobby":
        return NextResponse.json({ room: backToLobby(user.userId, Number(body.roomId)) });
      default:
        return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
