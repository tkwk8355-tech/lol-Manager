import type mysql from "mysql2/promise";

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
  createdAt?: string | null
) {
  if (createdAt) {
    await pool.query(
      `INSERT INTO point_logs (member_id, points, type, games, comment, given_by, ref_id, party_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, points, type, games, comment, givenBy, refId, partyCount, createdAt]
    );
  } else {
    await pool.query(
      `INSERT INTO point_logs (member_id, points, type, games, comment, given_by, ref_id, party_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, points, type, games, comment, givenBy, refId, partyCount]
    );
  }
  await pool.query(
    `UPDATE members SET total_points = total_points + ? WHERE id = ?`,
    [points, memberId]
  );
}
