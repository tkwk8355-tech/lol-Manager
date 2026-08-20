import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { givePoints } from "@/lib/points";

interface ParticipantInput { memberId: number; team: number; line?: string; }
interface ResultInput { memberId: number; champion?: string; kills: number; deaths: number; assists: number; damage: number; }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode");
    if (mode !== "aram" && mode !== "rift") {
      return NextResponse.json({ error: "mode가 필요합니다." }, { status: 400 });
    }
    await ensureSchema();
    const pool = getPool();

    const [matches] = await pool.query(
      `SELECT id, mode, status, winner_team, note, played_at, riot_match_id
       FROM scrim_matches WHERE mode = ?
       ORDER BY played_at DESC, id DESC LIMIT 100`,
      [mode]
    ) as [any[], any];

    if (matches.length === 0) return NextResponse.json({ matches: [] });

    const ids = matches.map((m: any) => m.id);
    const ph = ids.map(() => "?").join(",");
    const [parts] = await pool.query(
      `SELECT p.match_id, p.member_id, mem.nickname, p.team,
              p.line, p.champion, p.kills, p.deaths, p.assists, p.damage,
              p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6
       FROM scrim_participants p
       JOIN members mem ON mem.id = p.member_id
       WHERE p.match_id IN (${ph})`,
      ids
    ) as [any[], any];

    const byMatch = new Map<number, any[]>();
    for (const p of parts) {
      if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, []);
      byMatch.get(p.match_id)!.push(p);
    }

    const toPlayer = (p: any) => ({
      memberId: p.member_id, nickname: p.nickname, line: p.line ?? null,
      champion: p.champion ?? null, kills: p.kills, deaths: p.deaths, assists: p.assists,
      damage: p.damage,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].filter((n: number) => n > 0),
    });

    const result = matches.map((m: any) => {
      const ps = byMatch.get(m.id) ?? [];
      return {
        id: m.id, mode: m.mode, status: m.status, winnerTeam: m.winner_team,
        note: m.note, playedAt: m.played_at, riotMatchId: m.riot_match_id ?? null,
        team1: ps.filter((p) => p.team === 1).map(toPlayer),
        team2: ps.filter((p) => p.team === 2).map(toPlayer),
      };
    });

    return NextResponse.json({ matches: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "경기 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode;
    const note: string | null = body.note ? String(body.note).trim() : null;
    const participants: ParticipantInput[] = Array.isArray(body.participants) ? body.participants : [];
    // 모집 명단에서 팀 생성기로 불러와 경기를 시작한 경우, 그 모집을 완료 처리하기 위한 id(선택).
    const recruitId: number | null = body.recruitId ? Number(body.recruitId) : null;

    if (mode !== "aram" && mode !== "rift") {
      return NextResponse.json({ error: "모드를 선택하세요." }, { status: 400 });
    }

    const clean = participants
      .map((p) => ({ memberId: Number(p.memberId), team: Number(p.team) as 1 | 2, line: p.line || null }))
      .filter((p) => p.memberId && (p.team === 1 || p.team === 2));

    const t1 = clean.filter((p) => p.team === 1);
    const t2 = clean.filter((p) => p.team === 2);
    if (t1.length === 0 || t2.length === 0) {
      return NextResponse.json({ error: "양 팀에 최소 한 명씩 선수를 넣어야 합니다." }, { status: 400 });
    }
    const seen = new Set<number>();
    for (const p of clean) {
      if (seen.has(p.memberId)) return NextResponse.json({ error: "같은 선수가 중복입니다." }, { status: 400 });
      seen.add(p.memberId);
    }

    await ensureSchema();
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.query(
        "INSERT INTO scrim_matches (mode, status, winner_team, note) VALUES (?, 'pending', 0, ?)",
        [mode, note]
      ) as any;
      const matchId = res.insertId;
      for (const p of clean) {
        await conn.query(
          `INSERT INTO scrim_participants (match_id, member_id, team, line, champion, kills, deaths, assists)
           VALUES (?, ?, ?, ?, NULL, 0, 0, 0)`,
          [matchId, p.memberId, p.team, p.line]
        );
      }
      if (recruitId) {
        await conn.query(
          "UPDATE scrim_recruits SET status = 'started', match_id = ? WHERE id = ?",
          [matchId, recruitId]
        );
      }
      await conn.commit();
      return NextResponse.json({ id: matchId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "경기 저장 실패" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    const winnerTeam = Number(body.winnerTeam);
    const participants: ResultInput[] = Array.isArray(body.participants) ? body.participants : [];

    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    if (winnerTeam !== 1 && winnerTeam !== 2) {
      return NextResponse.json({ error: "승리팀을 선택하세요." }, { status: 400 });
    }

    await ensureSchema();
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE scrim_matches SET status = 'done', winner_team = ? WHERE id = ?", [winnerTeam, id]);
      for (const p of participants) {
        await conn.query(
          `UPDATE scrim_participants SET champion = ?, kills = ?, deaths = ?, assists = ?, damage = ?
           WHERE match_id = ? AND member_id = ?`,
          [
            p.champion || null,
            Math.max(0, Number(p.kills) || 0),
            Math.max(0, Number(p.deaths) || 0),
            Math.max(0, Number(p.assists) || 0),
            Math.max(0, Number(p.damage) || 0),
            id, Number(p.memberId),
          ]
        );
      }
      await conn.commit();

      // 내전 결과 등록 시 참가자 전원 30점 지급 (하루 한도).
      // created_at은 넘기지 않아 실제 지급 시각(지금)이 자동으로 찍히도록 하고,
      // 하루 1회 판단은 scrim_matches.played_at(경기 날짜)을 조인해서 확인한다.
      // comment에는 경기 시각 + 메모를 남겨서 어떤 경기 때문인지 알 수 있게 한다.
      const [matchRows] = await pool.query(
        "SELECT played_at, note FROM scrim_matches WHERE id = ?", [id]
      ) as [any[], any];
      const playedAt: string = matchRows[0]?.played_at
        ? String(matchRows[0].played_at)
        : new Date().toISOString().slice(0, 19).replace("T", " ");
      const matchTimeLabel = playedAt.slice(5, 16);
      const matchNote = matchRows[0]?.note ? ` ${matchRows[0].note}` : "";
      const [partRows] = await pool.query(
        "SELECT member_id FROM scrim_participants WHERE match_id = ?", [id]
      ) as [any[], any];
      for (const p of partRows) {
        const playedDate = playedAt.slice(0, 10);
        const [alreadyRows] = await pool.query(
          `SELECT pl.id FROM point_logs pl
           JOIN scrim_matches sm ON sm.id = pl.ref_id AND pl.ref_table = 'scrim_match'
           WHERE pl.member_id = ? AND pl.type = 'scrim'
           AND DATE(sm.played_at) = ?`,
          [p.member_id, playedDate]
        ) as [any[], any];
        if (alreadyRows.length > 0) continue;
        await givePoints(pool, p.member_id, 30, "scrim", 1, `내전 참여 (${matchTimeLabel})${matchNote}`, auth.session.userId, id, 0, null, "scrim_match");
      }

      return NextResponse.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "결과 등록 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    await ensureSchema();
    const pool = getPool();
    await pool.query("DELETE FROM scrim_matches WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
