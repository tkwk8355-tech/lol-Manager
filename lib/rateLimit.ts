import { NextRequest, NextResponse } from "next/server";

// =============================================================
// 아주 단순한 요청 횟수 제한 (서버 메모리, IP 기준)
// 로그인 없이 부를 수 있는 API(아이디 확인 · 클랜원 확인 · 가입)를 마구 찔러 보는 걸 막는다.
// =============================================================

const g = globalThis as unknown as { _rate?: Map<string, number[]> };
const hits = (g._rate ??= new Map<string, number[]>());

const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

/** 제한을 넘으면 429 응답, 아니면 null */
export const rateLimit = (req: NextRequest, bucket: string, max: number, windowMs: number) => {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return null;
};
