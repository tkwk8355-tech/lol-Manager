// =============================================================
// 솔랭 티어 자동 동기화 스케줄러
// 매일 한국시간 새벽 6시(기본값)에 클랜원 본계정 솔랭 티어를 갱신한다.
// instrumentation.ts 에서 서버 시작 시 한 번 호출된다.
//
// 환경변수 (.env.local, 모두 선택)
//   SOLO_TIER_SYNC=off          자동 동기화 끄기 (개발 PC 등)
//   SOLO_TIER_SYNC_HOUR=6       실행 시각(한국시간, 0~23)
//   SOLO_TIER_SYNC_DELAY_MS=1300 계정 사이 대기 시간
// =============================================================

import { syncMainSoloTiers } from "@/lib/soloTierSync";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버 PC의 시간대와 관계없이 "다음 한국시간 HH:00"까지 남은 ms
function msUntilNextKst(hour: number): number {
  const now = Date.now();
  const kstNow = new Date(now + KST_OFFSET_MS); // UTC 메서드로 읽으면 한국시간
  const target = new Date(kstNow);
  target.setUTCHours(hour, 0, 0, 0);
  if (target.getTime() <= kstNow.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - kstNow.getTime();
}

const g = globalThis as unknown as { _soloTierTimer?: NodeJS.Timeout; _soloTierRunning?: boolean };

export async function runSoloTierSyncNow(): Promise<void> {
  if (g._soloTierRunning) {
    console.log("[솔랭 자동동기화] 이미 실행 중이라 건너뜀");
    return;
  }
  g._soloTierRunning = true;
  const started = Date.now();
  try {
    console.log("[솔랭 자동동기화] 시작");
    const delayMs = Number(process.env.SOLO_TIER_SYNC_DELAY_MS ?? 1300);
    const r = await syncMainSoloTiers({ activeOnly: true, delayMs, logAs: "auto" });
    const sec = Math.round((Date.now() - started) / 1000);
    console.log(
      `[솔랭 자동동기화] 완료: ${r.processed}/${r.total}개 갱신, 실패 ${r.errors.length}건, ${sec}초` +
        (r.rateLimited ? " (요청 한도 초과로 중단)" : "")
    );
    if (r.errors.length) console.log("[솔랭 자동동기화] 실패 목록:\n  " + r.errors.join("\n  "));
  } catch (e) {
    console.error("[솔랭 자동동기화] 오류", e);
  } finally {
    g._soloTierRunning = false;
  }
}

function scheduleHour(): number {
  const hourEnv = Number(process.env.SOLO_TIER_SYNC_HOUR ?? 6);
  return Number.isInteger(hourEnv) && hourEnv >= 0 && hourEnv <= 23 ? hourEnv : 6;
}

// 화면 표시용: 자동 동기화 설정과 다음 실행 시각("YYYY-MM-DD HH:MM", 한국시간)
export function getSoloTierSchedule(): { enabled: boolean; hour: number; nextRunAt: string | null; running: boolean } {
  const enabled = (process.env.SOLO_TIER_SYNC || "").toLowerCase() !== "off";
  const hour = scheduleHour();
  const nextRunAt = enabled
    ? new Date(Date.now() + msUntilNextKst(hour) + KST_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16)
    : null;
  return { enabled, hour, nextRunAt, running: !!g._soloTierRunning };
}

export function startSoloTierScheduler(): void {
  if ((process.env.SOLO_TIER_SYNC || "").toLowerCase() === "off") {
    console.log("[솔랭 자동동기화] 꺼짐 (SOLO_TIER_SYNC=off)");
    return;
  }
  if (g._soloTierTimer) return; // 중복 등록 방지

  const hour = scheduleHour();

  const scheduleNext = () => {
    const wait = msUntilNextKst(hour);
    const at = new Date(Date.now() + wait + KST_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16);
    console.log(`[솔랭 자동동기화] 다음 실행: ${at} (한국시간)`);
    g._soloTierTimer = setTimeout(async () => {
      await runSoloTierSyncNow();
      scheduleNext();
    }, wait);
  };
  scheduleNext();
}
