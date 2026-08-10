import { getPool } from "@/lib/db";

export interface PartyIdentity {
  displayName: string;
}

// userId(로그인 계정)의 닉네임을 파티 표시명으로 사용한다.
export async function resolvePartyIdentity(userId: number): Promise<PartyIdentity | null> {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT nickname FROM users WHERE id = ? LIMIT 1`,
    [userId]
  ) as [any[], any];
  const row = rows[0];
  if (!row) return null;
  return { displayName: row.nickname };
}
