import type mysql from "mysql2/promise";

// refTable: ref_id가 어느 테이블을 가리키는지 ('party' | 'scrim_match' | null).
export async function givePoints(
  pool: mysql.Pool,
  memberId: number,
  points: number,
  type: string,
  games: number,
  comment: string | null,
  givenBy: number | null,
  refId: number | null,
  partyCount: number = 0,
  createdAt?: string | null,
  refTable: "party" | "scrim_match" | null = null,
  withMembers: string | null = null
) {
  if (createdAt) {
    await pool.query(
      `INSERT INTO point_logs (member_id, points, type, games, comment, given_by, ref_id, party_count, created_at, ref_table, with_members)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, points, type, games, comment, givenBy, refId, partyCount, createdAt, refTable, withMembers]
    );
  } else {
    await pool.query(
      `INSERT INTO point_logs (member_id, points, type, games, comment, given_by, ref_id, party_count, ref_table, with_members)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, points, type, games, comment, givenBy, refId, partyCount, refTable, withMembers]
    );
  }
  await pool.query(
    `UPDATE members SET total_points = total_points + ? WHERE id = ?`,
    [points, memberId]
  );
}

// 달성일(last_achieved_at) 업데이트
// last_achieved_at 이후 판수가 달성 조건 충족 시 오늘 날짜로 갱신
// 칼바람 2판 = 협곡 1판 환산, 합산 3판 이상
export async function updateLastAchieved(pool: mysql.Pool, memberId: number) {
  const [memberRows] = await pool.query(
    `SELECT DATE_FORMAT(last_achieved_at, '%Y-%m-%d') as last_achieved_at FROM members WHERE id = ?`,
    [memberId]
  ) as [any[], any];
  const m = memberRows[0];
  const base = m?.last_achieved_at ?? null;

  const [logs] = await pool.query(
    `SELECT DATE_FORMAT(COALESCE(p.start_at, pl.created_at), '%Y-%m-%d') as d, pl.type, pl.games
     FROM point_logs pl
     LEFT JOIN parties p ON p.id=pl.ref_id AND pl.ref_table='party'
     WHERE pl.member_id=? AND pl.type IN ('aram','normal','flex','solo')
     ${base ? `AND DATE(COALESCE(p.start_at,pl.created_at)) > '${base}'` : ''}
     ORDER BY d`,
    [memberId]
  ) as [any[], any];

  const [scrims] = await pool.query(
    `SELECT DATE_FORMAT(sm.played_at, '%Y-%m-%d') as d
     FROM scrim_participants sp
     JOIN scrim_matches sm ON sm.id=sp.match_id AND sm.status='done'
     WHERE sp.member_id=? ${base ? `AND DATE(sm.played_at) > '${base}'` : ''}
     ORDER BY d`,
    [memberId]
  ) as [any[], any];


  const dayMap = new Map<string, { aram: number; normal: number }>();
  for (const l of logs) {
    if (!dayMap.has(l.d)) dayMap.set(l.d, { aram: 0, normal: 0 });
    if (l.type === 'aram') dayMap.get(l.d)!.aram += Number(l.games);
    else dayMap.get(l.d)!.normal += Number(l.games);
  }
  for (const s of scrims) {
    if (!dayMap.has(s.d)) dayMap.set(s.d, { aram: 0, normal: 0 });
    dayMap.get(s.d)!.normal += 1;
  }

  const days = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cumAram = 0, cumNormal = 0, achievedDay: string | null = null;
  for (const [day, g] of days) {
    cumAram += g.aram;
    cumNormal += g.normal;
    if (Math.floor(cumAram / 2) + cumNormal >= 3) {
      achievedDay = day;
      break;
    }
  }

  if (achievedDay) {
    await pool.query(
      `UPDATE members SET last_achieved_at = ? WHERE id = ?`,
      [achievedDay, memberId]
    );
  }
}
