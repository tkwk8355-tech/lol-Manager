import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// 회원가입 화면에서 고를 수 있는, 아직 로그인 계정과 연동되지 않은 클랜원 목록.
// 로그인 전에도 호출해야 해서 인증 없이 공개한다(닉네임만 노출, 개인정보 아님).
export async function GET() {
  try {
    await ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT m.id, m.nickname
       FROM members m
       LEFT JOIN users u ON u.member_id = m.id
       WHERE u.id IS NULL
       ORDER BY m.nickname ASC`
    ) as [any[], any];
    return NextResponse.json({ members: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
