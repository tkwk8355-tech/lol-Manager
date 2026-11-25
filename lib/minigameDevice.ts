import { NextRequest, NextResponse } from "next/server";

// =============================================================
// 미니게임은 PC 전용. 화면에서도 막지만, 주소를 직접 열거나 API를 부르는 경우를 위해
// 서버에서도 휴대폰 브라우저(User-Agent)면 참여를 거절한다.
// =============================================================

const MOBILE_UA = /Android|iPhone|iPod|Mobi/i;

export const isMobileRequest = (req: NextRequest) => MOBILE_UA.test(req.headers.get("user-agent") ?? "");

/** 휴대폰이면 403 응답, PC면 null */
export const rejectMobile = (req: NextRequest) =>
  isMobileRequest(req)
    ? NextResponse.json({ error: "미니게임은 PC에서만 참여할 수 있어요." }, { status: 403 })
    : null;
