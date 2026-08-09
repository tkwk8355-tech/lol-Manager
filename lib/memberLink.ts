// =============================================================
// 로그인 계정(users)과 연동된 클랜원(members)의 기본 정보를 찾는 헬퍼.
// 파티 기능(lib/party.ts)은 등록된 롤 ID를 쓰지만, 내전 모집은 기존
// scrim_matches/scrim_participants가 클랜원 닉네임을 쓰는 것과 맞추기 위해
// members.nickname을 그대로 사용한다.
// =============================================================

import { getPool } from "@/lib/db";

export interface MemberLink {
  memberId: number;
  nickname: string;
}

// userId(로그인 계정)로 연동된 클랜원을 찾는다. 연동이 안 되어 있으면 null.
export async function resolveMemberLink(userId: number): Promise<MemberLink | null> {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT m.id AS member_id, m.nickname
     FROM users u
     JOIN members m ON m.id = u.member_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  ) as [any[], any];
  const row = rows[0];
  if (!row) return null;
  return { memberId: row.member_id, nickname: row.nickname };
}
