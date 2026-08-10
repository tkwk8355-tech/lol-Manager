import type mysql from "mysql2/promise";

export async function givePoints(
  pool: mysql.Pool,
  memberId: number,
  points: number,
  type: string,
  games: number,
  comment: string | null,
  givenBy: number | null,
  refId: number | null
) {
  await pool.query(
    `INSERT INTO point_logs (member_id, points, type, games, comment, given_by, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [memberId, points, type, games, comment, givenBy, refId]
  );
  await pool.query(
    `UPDATE members SET total_points = total_points + ? WHERE id = ?`,
    [points, memberId]
  );
}
