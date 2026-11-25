import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

// 경매 플랜카드 API (경매 시작 전 대기 화면에 보여주는 세션별 이미지)
// - 소개사진(auction/intro)과 같은 방식으로 DB(MEDIUMBLOB)에 저장한다.

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// GET /api/auction/banner?sessionId=N(&v=ver) → 이미지 바이너리
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const sessionId = Number(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });

  const [[row]] = await getPool().query(
    `SELECT mime, data FROM auction_banner WHERE session_id = ?`, [sessionId]
  ) as any[];
  if (!row) return NextResponse.json({ error: "플랜카드 없음" }, { status: 404 });

  const buf: Buffer = row.data;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(buf.length),
      // URL에 ?v=ver 가 붙으므로 이미지가 바뀌면 URL도 바뀐다.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// PUT /api/auction/banner  (multipart/form-data: sessionId, file) → 업로드/교체
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const sessionId = Number(form.get("sessionId"));
  const file = form.get("file");
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  if (!file || typeof file === "string") return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "PNG/JPG/WEBP/GIF 이미지만 올릴 수 있어요." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "이미지가 너무 커요. (최대 8MB)" }, { status: 400 });

  const pool = getPool();
  const [[s]] = await pool.query(`SELECT id FROM auction_sessions WHERE id = ?`, [sessionId]) as any[];
  if (!s) return NextResponse.json({ error: "세션 없음" }, { status: 404 });

  const data = Buffer.from(await file.arrayBuffer());
  const ver = Date.now();
  await pool.query(
    `INSERT INTO auction_banner (session_id, mime, data, ver) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), ver = VALUES(ver)`,
    [sessionId, file.type, data, ver]
  );
  return NextResponse.json({ ok: true, ver });
}

// DELETE /api/auction/banner  body: { sessionId } → 플랜카드 삭제
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  await ensureSchema();
  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  await getPool().query(`DELETE FROM auction_banner WHERE session_id = ?`, [sessionId]);
  return NextResponse.json({ ok: true });
}
