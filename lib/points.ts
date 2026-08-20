import type mysql from "mysql2/promise";

// refTable: ref_id가 어느 테이블을 가리키는지 ('party' | 'scrim_match' | null).
// parties와 scrim_matches의 id가 우연히 같은 값일 수 있어서, 조회 시 이 컬럼으로
// 명확히 구분해야 서로 다른 레코드가 섞이지 않는다.
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
