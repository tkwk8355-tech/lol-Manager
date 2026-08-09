import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  console.log("[userinfo/delete] 요청 수신");
  try {
    const { kind, id } = await req.json();
    console.log("[userinfo/delete] body:", { kind, id });
    if (!id || (kind !== "member" && kind !== "account")) {
      console.warn("[userinfo/delete] 잘못된 요청:", { kind, id });
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();
    const table = kind === "member" ? "members" : "accounts";
    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [Number(id)]) as any;
    console.log(`[userinfo/delete] ${table} id=${id} 삭제, changes=${result.affectedRows}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[userinfo/delete] 오류:", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
