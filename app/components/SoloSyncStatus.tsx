"use client";

// 클랜원 관리 상단: 솔랭 티어 자동 동기화 상태 (마지막 실행 / 결과 / 다음 실행)
// 운영진만 보인다. 데이터: GET /api/userinfo/sync

import { useCallback, useEffect, useState } from "react";

interface SyncStatus {
  lastRun: {
    trigger: "auto" | "manual";
    startedAt: string;
    finishedAt: string | null;
    total: number;
    processed: number;
    errorCount: number;
    errors: string[];
    rateLimited: boolean;
  } | null;
  schedule: { enabled: boolean; hour: number; nextRunAt: string | null; running: boolean };
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-11-04 06:03:12" → "11.04 (수) 06:03"
function fmt(s: string | null): string {
  if (!s) return "-";
  const [d, t = ""] = s.replace("T", " ").split(" ");
  const [y, m, dd] = d.split("-").map(Number);
  return `${String(m).padStart(2, "0")}.${String(dd).padStart(2, "0")} (${DOW[new Date(y, m - 1, dd).getDay()]}) ${t.slice(0, 5)}`;
}

// DB 시각(서버=한국시간 가정)으로부터 지난 시간(시간 단위)
function hoursSince(s: string): number {
  const t = new Date(s.replace(" ", "T") + "+09:00").getTime();
  return (Date.now() - t) / 3_600_000;
}

export default function SoloSyncStatus({ refreshKey = 0 }: { refreshKey?: number }) {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/userinfo/sync");
      if (!res.ok) { setErr(true); return; }
      setSt(await res.json()); setErr(false);
    } catch { setErr(true); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // 진행 중이면 10초마다 갱신
  const running = !!st && (st.schedule.running || (!!st.lastRun && !st.lastRun.finishedAt && hoursSince(st.lastRun.startedAt) < 1));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [running, load]);

  if (err || !st) return null;

  const r = st.lastRun;
  const last = r ? (r.finishedAt ?? r.startedAt) : null;
  // 자동 동기화가 켜져 있는데 마지막 완료가 하루(26시간) 넘게 지났거나 도중에 멈췄으면 경고색
  const stale = !running && st.schedule.enabled && (!r || !r.finishedAt || hoursSince(r.finishedAt) > 26);
  const failTitle = r && r.errors.length ? r.errors.join("\n") : undefined;

  // 한 줄 요약: "솔랭 동기화 11.04 (수) 06:03 ✓" / "… · 실패 2" (마우스를 올리면 실패 계정 목록)
  return (
    <span className={`solo-sync-status ${stale ? "warn" : ""}`}
      title={stale ? "마지막 동기화가 오래됐어요" : undefined}>
      솔랭 동기화{" "}
      {running ? <b>진행 중…</b>
        : last ? <b>{fmt(last)}</b>
        : <b>기록 없음</b>}
      {!running && r && r.finishedAt && r.errorCount === 0 && <span className="ok"> ✓</span>}
      {!running && r && r.errorCount > 0 && <span className="bad" title={failTitle}> · 실패 {r.errorCount}</span>}
      {!running && r && !r.finishedAt && <span className="bad"> · 중간에 멈춤</span>}
    </span>
  );
}
