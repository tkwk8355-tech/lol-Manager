import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { nickname, birthYear, mainLine, subLine } = await req.json();
    const nick = String(nickname || "").trim();
    if (!nick) {
      return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();

    // 같은 이름의 클랜원이 이미 있으면 등록을 막는다. 회원가입 시 이름으로
    // 본인을 찾아 연동하는 구조라, 이름이 중복되면 어느 쪽에 연동될지 알 수 없다.
    const [dupRows] = await pool.query(
      "SELECT id FROM members WHERE nickname = ?", [nick]
    ) as [any[], any];
    if (dupRows.length > 0) {
      return NextResponse.json({ error: "이미 같은 이름의 클랜원이 있습니다." }, { status: 409 });
    }

    const [result] = await pool.query(
      "INSERT INTO members (nickname, birth_year, main_line, sub_line) VALUES (?, ?, ?, ?)",
      [
        nick,
        birthYear ? Number(birthYear) : null,
        mainLine ? String(mainLine).trim() : null,
        subLine ? String(subLine).trim() : null,
      ]
    ) as any;
    return NextResponse.json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "등록 실패" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, nickname, birthYear, mainLine, subLine } = await req.json();
    if (!id) return NextResponse.json({ error: "대상이 없습니다." }, { status: 400 });
    const nick = String(nickname || "").trim();
    if (!nick) {
      return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();

    // 다른 클랜원이 이미 같은 이름을 쓰고 있으면 막는다(본인 이름은 그대로 저장 가능).
    const [dupRows] = await pool.query(
      "SELECT id FROM members WHERE nickname = ? AND id != ?", [nick, Number(id)]
    ) as [any[], any];
    if (dupRows.length > 0) {
      return NextResponse.json({ error: "이미 같은 이름의 클랜원이 있습니다." }, { status: 409 });
    }

    await pool.query(
      "UPDATE members SET nickname = ?, birth_year = ?, main_line = ?, sub_line = ? WHERE id = ?",
      [
        nick,
        birthYear ? Number(birthYear) : null,
        mainLine ? String(mainLine).trim() : null,
        subLine ? String(subLine).trim() : null,
        Number(id),
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
