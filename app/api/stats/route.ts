import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { givePoints } from "@/lib/points";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const pool = getPool();
    const [[memberRow], [partyRow], [recentParties], [lineDist], [birthdays], [tomorrowBirthdays]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM members") as Promise<[any[], any]>,
      pool.query("SELECT COUNT(*) AS c FROM parties WHERE status = 'open'") as Promise<[any[], any]>,
      pool.query(
        `SELECT p.id, p.mode, p.status, p.host_nickname, p.note, p.start_at, p.max_size,
                COUNT(pp.id) AS participant_count
         FROM parties p
         LEFT JOIN party_participants pp ON pp.party_id = p.id AND pp.is_waiting = 0
         WHERE p.status = 'open'
         GROUP BY p.id
         ORDER BY p.created_at DESC LIMIT 2`
      ) as Promise<[any[], any]>,
      pool.query(
        `SELECT main_line, COUNT(*) AS c FROM members WHERE main_line IS NOT NULL GROUP BY main_line`
      ) as Promise<[any[], any]>,
      pool.query(
        `SELECT id, nickname, birth_date, birth_year FROM members
         WHERE DATE_FORMAT(birth_date, '%m-%d') = DATE_FORMAT(NOW(), '%m-%d')
         AND birth_date IS NOT NULL`
      ) as Promise<[any[], any]>,
      pool.query(
        `SELECT nickname, birth_year FROM members
         WHERE DATE_FORMAT(birth_date, '%m-%d') = DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 DAY), '%m-%d')
         AND birth_date IS NOT NULL`
      ) as Promise<[any[], any]>,
    ]);

    // 오늘 생일자 포인트 자동 지급 (하루 한 번, birthday 타입)
    const todayKST = new Date().toISOString().slice(0, 10);
    for (const b of birthdays) {
      const [already] = await pool.query(
        `SELECT id FROM point_logs WHERE member_id = ? AND type = 'birthday' AND DATE(created_at) = ?`,
        [b.id, todayKST]
      ) as [any[], any];
      if (already.length === 0) {
        await givePoints(pool, b.id, 20, "birthday", 0, "생일 보너스", null, null);
      }
    }

    return NextResponse.json({
      memberCount: memberRow[0].c,
      openPartyCount: partyRow[0].c,
      recentParties: recentParties.map((p: any) => ({
        id: p.id,
        mode: p.mode,
        status: p.status,
        hostNickname: p.host_nickname,
        note: p.note,
        startAt: p.start_at,
        maxSize: p.max_size,
        participantCount: Number(p.participant_count),
      })),
      lineDist: Object.fromEntries(lineDist.map((r: any) => [r.main_line, Number(r.c)])),
      birthdays: birthdays.map((r: any) => ({ nickname: r.nickname, birthYear: r.birth_year })),
      tomorrowBirthdays: tomorrowBirthdays.map((r: any) => ({ nickname: r.nickname, birthYear: r.birth_year })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ memberCount: 0, openPartyCount: 0, recentParties: [], lineDist: {}, birthdays: [], tomorrowBirthdays: [] });
  }
}
