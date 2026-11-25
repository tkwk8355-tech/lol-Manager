import type mysql from "mysql2/promise";
import { parseRiotId } from "@/lib/signupShared";

// =============================================================
// 회원가입 클랜원 인증: 롤 계정(닉네임#태그)으로 클랜원 명단에서 본인을 찾는다.
// - 클랜원 관리에 등록된 롤 계정(본계정 · 부계정 모두)과 맞으면 그 클랜원으로 본다
// - 이미 다른 로그인 계정과 연동된 클랜원이면 중복 가입이라 막는다
// =============================================================

export type MemberMatch =
  | { ok: true; memberId: number; nickname: string; riotId: string }
  | { ok: false; error: string };

export async function findMemberByRiotId(pool: mysql.Pool | mysql.PoolConnection, raw: string): Promise<MemberMatch> {
  const riot = parseRiotId(raw);
  if (!riot) return { ok: false, error: "롤 계정을 '닉네임#태그' 형식으로 입력해 주세요. (예: 또간집#KR1)" };

  // 띄어쓰기 · 대소문자는 무시하고 비교
  const [rows] = await pool.query(
    `SELECT m.id, m.nickname, m.status, a.game_name, a.tag_line, u.id AS user_id, u.status AS user_status
     FROM accounts a
     JOIN members m ON m.id = a.member_id
     LEFT JOIN users u ON u.member_id = m.id
     WHERE REPLACE(LOWER(a.game_name), ' ', '') = REPLACE(LOWER(?), ' ', '')
       AND LOWER(a.tag_line) = LOWER(?)
     LIMIT 1`,
    [riot.gameName, riot.tagLine]
  ) as [any[], unknown];
  const r = rows[0];
  if (!r) return { ok: false, error: "클랜원 명단에 없는 롤 계정이에요. 철자와 태그를 확인하거나 운영진에게 문의해 주세요." };
  if (r.status === "withdraw" || r.status === "black") return { ok: false, error: "가입할 수 없는 클랜원이에요. 운영진에게 문의해 주세요." };
  if (r.user_id) {
    return {
      ok: false,
      error: r.user_status === "pending"
        ? "이 클랜원으로 이미 가입 신청이 들어가 있어요. 운영진 승인을 기다려 주세요."
        : "이 클랜원은 이미 가입된 계정이 있어요. 아이디가 기억나지 않으면 운영진에게 문의해 주세요.",
    };
  }
  return { ok: true, memberId: r.id, nickname: r.nickname, riotId: `${r.game_name}#${r.tag_line}` };
}
