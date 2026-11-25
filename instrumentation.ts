// Next.js 서버가 시작될 때 한 번 실행된다. (next.config.js 의 experimental.instrumentationHook 필요)
// 백그라운드 작업(스케줄러)을 여기서 등록한다.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSoloTierScheduler } = await import("./lib/soloTierScheduler");
    startSoloTierScheduler();
  }
}
