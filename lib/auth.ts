// =============================================================
// 간단한 로그인/세션 유틸리티 (서버 전용).
// - 비밀번호: Node 내장 crypto.scrypt로 해싱 (salt:hash 형태 저장)
// - 세션: HMAC-SHA256으로 서명한 쿠키 토큰 (별도 DB 조회 없이 검증 가능)
// 외부 인증 라이브러리 없이 이 소규모 클랜 관리 앱에 맞는 수준으로 구현했다.
// =============================================================

import crypto from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7일

export type Role = "admin" | "subadmin" | "member" | "captain";

export interface SessionPayload {
  userId: number;
  username: string;
  nickname: string;
  role: Role;
  scrimOnly?: boolean;
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return "dev-only-insecure-secret-please-set-SESSION_SECRET";
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

// 요청에 대해 로그인 여부만 확인한다(운영진이 아니어도 됨). 파티 생성/참가처럼
// 클랜원이면 누구나 쓸 수 있는 기능에서 사용한다.
export function requireAuth(
  req: NextRequest
): { ok: true; session: SessionPayload } | { ok: false; response: NextResponse } {
  const session = getSessionFromRequest(req);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  return { ok: true, session };
}

// 요청에 대해 운영진 권한을 확인한다. 실패 시 바로 반환할 NextResponse를 함께 준다.
export function requireAdmin(
  req: NextRequest
): { ok: true; session: SessionPayload } | { ok: false; response: NextResponse } {
  const session = getSessionFromRequest(req);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (session.role !== "admin" && session.role !== "subadmin") {
    return { ok: false, response: NextResponse.json({ error: "운영진만 사용할 수 있습니다." }, { status: 403 }) };
  }
  return { ok: true, session };
}

// ------------------------------ 비밀번호 해싱 ------------------------------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
