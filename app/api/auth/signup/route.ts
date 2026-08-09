import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { LINES } from "@/lib/lines";

const LINE_KEYS = LINES.map((l) => l.key);

// 클랜원 본인이 로그인 계정을 만든다. 닉네임을 직접 입력하지 않고,
// 클랜원 목록(아직 로그인 계정과 연동되지 않은 사람)에서 자신을 선택한다.
// 가입과 동시에 그 클랜원과 자동으로 연동되어, 파티 생성 시
// 그 클랜원의 등록된 롤 ID가 바로 표시된다.
// 주라인/부라인을 함께 입력하면 members.main_line/sub_line에 저장된다(선택 사항).
export async function POST(req: NextRequest) {
  try {
    const { username, password, memberId, mainLine, subLine } = await req.json().catch(() => ({}));
    const uname = String(username || "").trim();
    const pw = String(password || "");
    const mid = Number(memberId);

    if (!uname || uname.length < 3) {
      return NextResponse.json({ error: "아이디는 3자 이상이어야 합니다." }, { status: 400 });
    }
    if (!pw || pw.length < 4) {
      return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }
    if (!mid) {
      return NextResponse.json({ error: "클랜원 목록에서 본인을 선택하세요." }, { status: 400 });
    }
    const main = mainLine && LINE_KEYS.includes(mainLine) ? mainLine : null;
    const sub = subLine && LINE_KEYS.includes(subLine) ? subLine : null;
    if (main && sub && main === sub) {
      return NextResponse.json({ error: "주라인과 부라인은 다르게 선택하세요." }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();

    const [memberRows] = await pool.query("SELECT nickname FROM members WHERE id = ?", [mid]) as [any[], any];
    const member = memberRows[0];
    if (!member) return NextResponse.json({ error: "존재하지 않는 클랜원입니다." }, { status: 400 });

    const conn = await pool.getConnection();
    let dupError: string | null = null;
    try {
      await conn.beginTransaction();
      try {
        await conn.query(
          "INSERT INTO users (username, password, nickname, role, member_id) VALUES (?, ?, ?, 'member', ?)",
          [uname, hashPassword(pw), member.nickname, mid]
        );
      } catch (e: any) {
        if (e?.code === "ER_DUP_ENTRY") {
          // username UNIQUE 위반과 member_id UNIQUE 위반을 구분해서 안내.
          const msg = String(e?.sqlMessage || "");
          dupError = msg.includes("member_id") ? "이미 다른 계정과 연동된 클랜원입니다." : "이미 사용 중인 아이디입니다.";
          await conn.rollback();
        } else {
          throw e;
        }
      }
      if (!dupError) {
        if (main || sub) {
          await conn.query("UPDATE members SET main_line = ?, sub_line = ? WHERE id = ?", [main, sub, mid]);
        }
        await conn.commit();
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    if (dupError) return NextResponse.json({ error: dupError }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "가입 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
