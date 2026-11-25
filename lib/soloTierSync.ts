// =============================================================
// 클랜원 본계정 솔로랭크 티어 동기화 (서버 전용)
// - /api/userinfo/sync (관리자 버튼)
// - lib/soloTierScheduler.ts (매일 새벽 자동 실행)
// 두 곳에서 같은 로직을 쓰도록 분리했다.
// =============================================================

import { getPool, ensureSchema } from "@/lib/db";
import { getAccountByRiotId, getLeagueEntries, RiotApiError } from "@/lib/riot";

export interface SoloTierSyncOptions {
  /** 지정하면 해당 클랜원의 본계정만 갱신 */
  memberId?: number | null;
  /** true면 탈퇴(withdraw)·블랙(black) 클랜원은 건너뜀 */
  activeOnly?: boolean;
  /** 계정 사이 대기 시간(ms). Riot API 요청 한도 보호용 */
  delayMs?: number;
  /** 지정하면 solo_sync_runs 에 실행 기록을 남김 (전체 동기화일 때만) */
  logAs?: "auto" | "manual";
}

export interface SoloTierSyncResult {
  total: number;
  processed: number;
  errors: string[];
  /** 요청 한도 초과로 중간에 멈췄는지 */
  rateLimited: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 실행 기록 시각은 DB/서버 시간대와 관계없이 한국시간 문자열로 저장한다 ("YYYY-MM-DD HH:MM:SS")
const kstNow = () => new Date(Date.now() + 9 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);

export async function syncMainSoloTiers(opts: SoloTierSyncOptions = {}): Promise<SoloTierSyncResult> {
  const { memberId = null, activeOnly = false, delayMs = 0, logAs } = opts;

  await ensureSchema();
  const pool = getPool();

  let sql = `SELECT a.id, a.game_name, a.tag_line, a.puuid
             FROM accounts a JOIN members m ON m.id = a.member_id
             WHERE a.is_main = 1`;
  const params: any[] = [];
  if (memberId) {
    sql += ` AND a.member_id = ?`;
    params.push(memberId);
  }
  if (activeOnly) {
    sql += ` AND m.status NOT IN ('withdraw', 'black')`;
  }

  const [accounts] = (await pool.query(sql, params)) as [any[], any];

  // 실행 기록 시작 (단일 클랜원 동기화는 기록하지 않음)
  let runId: number | null = null;
  if (logAs && !memberId) {
    const [ins] = (await pool.query(
      `INSERT INTO solo_sync_runs (trigger_type, started_at, total) VALUES (?, ?, ?)`,
      [logAs, kstNow(), accounts.length]
    )) as [any, any];
    runId = ins.insertId;
  }

  const errors: string[] = [];
  let processed = 0;
  let rateLimited = false;

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    try {
      let puuid = acc.puuid;
      if (!puuid) {
        const a = await getAccountByRiotId(acc.game_name, acc.tag_line);
        puuid = a.puuid;
        await pool.query("UPDATE accounts SET puuid = ? WHERE id = ?", [puuid, acc.id]);
      }

      const entries = await getLeagueEntries(puuid);
      const solo = entries.find((e: any) => e.queueType === "RANKED_SOLO_5x5");
      await pool.query(
        `UPDATE accounts SET solo_tier = ?, solo_rank = ?, solo_lp = ?, last_synced_at = NOW() WHERE id = ?`,
        [solo?.tier ?? null, solo?.rank ?? null, solo?.leaguePoints ?? 0, acc.id]
      );
      processed++;
    } catch (e) {
      if (e instanceof RiotApiError && e.status === 429) {
        errors.push(`${acc.game_name}#${acc.tag_line}: 요청 한도 초과`);
        rateLimited = true;
        break;
      }
      errors.push(`${acc.game_name}#${acc.tag_line}: 갱신 실패`);
    }
  }

  if (runId) {
    await pool.query(
      `UPDATE solo_sync_runs SET finished_at = ?, processed = ?, error_count = ?, errors = ?, rate_limited = ? WHERE id = ?`,
      [kstNow(), processed, errors.length, errors.length ? errors.join("\n").slice(0, 60000) : null, rateLimited ? 1 : 0, runId]
    ).catch((e) => console.error("[솔랭 동기화] 실행 기록 저장 실패", e));
  }

  return { total: accounts.length, processed, errors, rateLimited };
}
