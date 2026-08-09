// =============================================================
// 파티 기능에서 "참가자 표시 이름"을 결정하는 헬퍼.
// 로그인 계정의 닉네임이 아니라, 그 계정과 연동된 클랜원의
// 등록된 본계정 롤 ID(소환사명#태그)를 사용한다.
// (관리자가 /userInfo에서 로그인 계정 ↔ 클랜원을 미리 연동해둬야 한다.)
// =============================================================

import { getPool } from "@/lib/db";

export interface PartyIdentity {
  memberId: number;
  displayName: string; // "소환사명#태그"
}

// userId(로그인 계정)로 연동된 클랜원의 본계정 롤 ID를 찾는다.
// 연동이 안 되어 있거나 본계정이 등록되지 않았으면 null을 반환한다.
export async function resolvePartyIdentity(userId: number): Promise<PartyIdentity | null> {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT m.id AS member_id, a.game_name, a.tag_line
     FROM users u
     JOIN members m ON m.id = u.member_id
     LEFT JOIN accounts a ON a.member_id = m.id AND a.is_main = 1
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  ) as [any[], any];
  const row = rows[0];
  if (!row || !row.game_name) return null;
  return { memberId: row.member_id, displayName: `${row.game_name}#${row.tag_line}` };
}
