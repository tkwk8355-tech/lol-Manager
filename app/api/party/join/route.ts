import { NextResponse } from "next/server";

// 파티는 운영진이 수기로 참가자를 직접 입력하는 방식으로 변경되어
// 개별 참가/취소 API는 더 이상 사용하지 않습니다.
export async function POST() {
  return NextResponse.json({ error: "지원하지 않는 기능입니다." }, { status: 410 });
}
export async function DELETE() {
  return NextResponse.json({ error: "지원하지 않는 기능입니다." }, { status: 410 });
}
