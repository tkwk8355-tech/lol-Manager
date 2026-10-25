// =============================================================
// 간단한 로그인/세션 유틸리티 (서버 전용).
// - 비밀번호: Node 내장 crypto.scrypt로 해싱 (salt:hash 형태 저장)
// - 세션: HMAC-SHA256으로 서명한 쿠키 토큰 (별도 DB 조회 없이 검증 가능)
// 외부 인증 라이브러리 없이 이 소규모 클랜 관리 앱에 맞는 수준으로 구현했다.
// =============================================================

import crypto from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7일

export type Role = "admin" | "subadmin" | "member" | "captain";

export interface SessionPayload {
  userId: number;
  username: string;
  nickname: string;
  role: Role;
  scrimOnly?: boolean;
  tv?: number; // users.token_version (비밀번호 변경 시 기존 세션 무효화용)
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // 프로덕션에서 SESSION_SECRET 없이 실행되면 즉시 종료
    if (process.env.NODE_ENV === "production") {
      console.error("[auth] FATAL: SESSION_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.");
      process.exit(1);
    }
    console.warn("[auth] WARNING: SESSION_SECRET 미설정 — 개발용 기본값을 사용합니다. 절대 프로덕션에서 사용하지 마세요.");
    return "dev-only-insecure-secret-please-set-SESSION_SECRET";
  }
  return secret;
}

/**
 * 세션 쿠키 옵션을 반환한다.
 * HTTPS=true 이거나, 요청이 HTTPS로 들어온 경우(리버스 프록시의 x-forwarded-proto 포함) secure 쿠키를 쓴다.
 * 평문 HTTP로만 운영 중인 서버에서도 로그인이 깨지지 않도록 요청 기준으로 판단한다.
 */
export function sessionCookieOptions(
  maxAge = SESSION_MAX_AGE_SEC,
  req?: NextRequest
): Parameters<typeof NextResponse.prototype.cookies.set>[2] {
  let secure = process.env.HTTPS === "true";
  if (!secure && req) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    secure = proto === "https" || req.nextUrl.protocol === "https:";
  }
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
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

// ------------------------------ DB 기반 세션 검증 ------------------------------
// 쿠키 서명만 믿으면 권한 회수/계정 삭제/비밀번호 변경이 쿠키 만료(7일)까지 반영되지 않는다.
// 그래서 매 요청마다 users 테이블의 현재 상태(role, scrim_only, status, token_version)를 확인한다.
// 같은 사용자의 연속 요청 부하를 줄이기 위해 아주 짧게(5초) 메모리 캐시한다.

interface UserState {
  role: Role;
  nickname: string;
  scrimOnly: boolean;
  status: string;
  tokenVersion: number;
}

const USER_STATE_TTL_MS = 5_000;
const userStateCache = new Map<number, { value: UserState | null; ts: number }>();

async function loadUserState(userId: number): Promise<UserState | null> {
  const cached = userStateCache.get(userId);
  if (cached && Date.now() - cached.ts < USER_STATE_TTL_MS) return cached.value;
  await ensureSchema();
  const [rows] = (await getPool().query(
    "SELECT role, nickname, scrim_only, status, token_version FROM users WHERE id = ?",
    [userId]
  )) as [any[], any];
  const r = rows[0];
  const value: UserState | null = r
    ? {
        role: r.role,
        nickname: r.nickname,
        scrimOnly: !!r.scrim_only,
        status: r.status ?? "active",
        tokenVersion: Number(r.token_version ?? 0),
      }
    : null;
  userStateCache.set(userId, { value, ts: Date.now() });
  return value;
}

/** 사용자 권한/비밀번호/삭제 등 users 행을 바꾼 뒤 호출해 캐시를 즉시 비운다. */
export function invalidateUserState(userId: number): void {
  userStateCache.delete(userId);
}

/**
 * 요청의 세션을 검증하고, DB의 최신 권한 정보로 덮어쓴 세션을 반환한다.
 * 계정이 삭제됐거나, 승인 대기 상태로 바뀌었거나, 비밀번호가 바뀐(토큰 버전 불일치) 경우 null.
 */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  let state: UserState | null;
  try {
    state = await loadUserState(payload.userId);
  } catch (err) {
    console.error("[auth] 사용자 상태 조회 실패:", err);
    return null;
  }
  if (!state) return null;
  if (state.status === "pending") return null;
  if ((payload.tv ?? 0) !== state.tokenVersion) return null;
  return { ...payload, role: state.role, nickname: state.nickname, scrimOnly: state.scrimOnly };
}

type AuthResult = { ok: true; session: SessionPayload } | { ok: false; response: NextResponse };

export interface RequireAuthOptions {
  /** 내전 전용(관람) 계정도 허용할지. 기본값 false — 내전 화면에서 쓰는 API만 true로 연다. */
  allowScrimOnly?: boolean;
}

// 요청에 대해 로그인 여부만 확인한다(운영진이 아니어도 됨). 파티 생성/참가처럼
// 클랜원이면 누구나 쓸 수 있는 기능에서 사용한다.
// 내전 전용 계정은 기본적으로 차단한다(화면 리다이렉트만으로는 API 직접 호출을 막을 수 없음).
export async function requireAuth(req: NextRequest, opts: RequireAuthOptions = {}): Promise<AuthResult> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (session.scrimOnly && !opts.allowScrimOnly) {
    return { ok: false, response: NextResponse.json({ error: "내전 전용 계정은 사용할 수 없는 기능입니다." }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** 운영진(admin/subadmin) 여부. */
export function isAdminRole(role: Role | undefined | null): boolean {
  return role === "admin" || role === "subadmin";
}

// 요청에 대해 운영진 권한을 확인한다. 실패 시 바로 반환할 NextResponse를 함께 준다.
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (session.scrimOnly || !isAdminRole(session.role)) {
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
