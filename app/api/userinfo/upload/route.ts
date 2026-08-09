import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const { members } = body as {
      members: Array<{
        nickname: string;
        birthYear?: number;
        mainLine?: string;
        subLine?: string;
        accounts: Array<{ gameName: string; tagLine: string; isMain: boolean }>;
      }>;
    };

    if (!members || !Array.isArray(members)) {
      return NextResponse.json({ error: "잘못된 데이터 형식" }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();

    let addedMembers = 0;
    let addedAccounts = 0;
    const errors: string[] = [];

    for (const m of members) {
      if (!m.nickname?.trim()) { errors.push("빈 이름은 건너뜁니다."); continue; }
      try {
        const [result] = await pool.query(
          "INSERT INTO members (nickname, birth_year, main_line, sub_line) VALUES (?, ?, ?, ?)",
          [m.nickname.trim(), m.birthYear || null, m.mainLine?.trim() || null, m.subLine?.trim() || null]
        ) as any;
        const memberId = result.insertId;
        addedMembers++;

        for (const acc of m.accounts ?? []) {
          if (!acc.gameName?.trim() || !acc.tagLine?.trim()) continue;
          try {
            await pool.query(
              "INSERT INTO accounts (member_id, game_name, tag_line, is_main) VALUES (?, ?, ?, ?)",
              [memberId, acc.gameName.trim(), acc.tagLine.trim(), acc.isMain ? 1 : 0]
            );
            addedAccounts++;
          } catch (e: any) {
            errors.push(`${acc.gameName}#${acc.tagLine} ${e?.code === "ER_DUP_ENTRY" ? "이미 존재함" : "추가 실패"}`);
          }
        }
      } catch (e: any) {
        if (e?.code === "ER_DUP_ENTRY") {
          errors.push(`${m.nickname}: 이미 같은 이름의 클랜원이 있어 건너뜁니다.`);
        } else {
          errors.push(`${m.nickname} 추가 실패: ${e.message}`);
        }
      }
    }

    return NextResponse.json({ success: true, addedMembers, addedAccounts, errors: errors.length ? errors : undefined });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
