import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getAccountByRiotId, getLeagueEntries, RiotApiError } from "@/lib/riot";
import { requireAdmin } from "@/lib/auth";

// POST: 클랜원 신규 등록 (본계정 Riot ID 기반)
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { gameName, tagLine } = await req.json().catch(() => ({}));
    const name = String(gameName || "").trim();
    const tag = String(tagLine || "").trim();
    if (!name || !tag) {
      return NextResponse.json({ error: "소환사명과 태그를 입력하세요." }, { status: 400 });
    }

    let puuid: string;
    try {
      const acc = await getAccountByRiotId(name, tag);
      puuid = acc.puuid;
    } catch (e) {
      if (e instanceof RiotApiError && e.status === 404) {
        return NextResponse.json({ error: "존재하지 않는 Riot ID입니다. (이름/태그 확인)" }, { status: 400 });
      }
      throw e;
    }

    let soloTier: string | null = null;
    let soloRank: string | null = null;
    let soloLp = 0;
    try {
      const entries = await getLeagueEntries(puuid);
      const solo = entries.find((e: any) => e.queueType === "RANKED_SOLO_5x5");
      if (solo) { soloTier = solo.tier; soloRank = solo.rank; soloLp = solo.leaguePoints; }
    } catch {}

    await ensureSchema();
    const pool = getPool();

    // 이미 등록된 계정인지 확인
    const [existing] = await pool.query(
      `SELECT a.id FROM accounts a WHERE a.puuid = ?`, [puuid]
    ) as [any[], any];
    if (existing.length > 0) {
      return NextResponse.json({ error: "이미 등록된 계정입니다." }, { status: 409 });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [mRes] = await conn.query(
        `INSERT INTO members (nickname, position) VALUES (?, '일반')`, [name]
      ) as any;
      const memberId = mRes.insertId;
      await conn.query(
        `INSERT INTO accounts (member_id, game_name, tag_line, puuid, is_main, solo_tier, solo_rank, solo_lp, last_synced_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, NOW())`,
        [memberId, name, tag, puuid, soloTier, soloRank, soloLp]
      );
      await conn.commit();
      return NextResponse.json({ id: memberId });
    } catch (e: any) {
      await conn.rollback();
      if (e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: "이미 등록된 닉네임입니다." }, { status: 409 });
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (err instanceof RiotApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "등록 실패" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, birthYear, birthDate, gender, mainLine, subLine, position, status, statusNote } = await req.json();
    if (!id) return NextResponse.json({ error: "대상이 없습니다." }, { status: 400 });
    console.log('[member PUT]', { id, birthYear, birthDate });

    await ensureSchema();
    const pool = getPool();
    await pool.query(
      `UPDATE members SET birth_year=?, birth_date=?, gender=?, main_line=?, sub_line=?,
       position=?, status=?, status_note=? WHERE id=?`,
      [birthYear || null, birthDate || null, gender || null, mainLine || null, subLine || null,
       position || "일반", status || "active", statusNote || null, Number(id)]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
