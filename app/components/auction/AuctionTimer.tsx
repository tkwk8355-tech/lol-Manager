"use client";

import { useEffect, useRef, useState } from "react";

export const AUCTION_SECONDS = 10;

/**
 * 서버 기준 시작 시각(startedAt)에서 남은 초를 계산하는 카운트다운.
 * clockOffset 은 최초 serverNow 수신 시 1회만 계산하고 이후 변경은 무시한다.
 */
function useCountdown(seconds: number, onEnd: () => void, startedAt: number | null, serverNow: number | null) {
  const [rem, setRem] = useState(seconds);
  const rafRef = useRef<number | null>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const firedRef = useRef(false);
  const clockOffsetRef = useRef<number>(0);
  const serverNowInitRef = useRef(false);
  if (!serverNowInitRef.current && serverNow != null) { clockOffsetRef.current = Date.now() - serverNow; serverNowInitRef.current = true; }
  function reset() { setRem(seconds); firedRef.current = false; if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } }
  useEffect(() => {
    if (!startedAt) { reset(); return; }
    firedRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const startedAtMs = startedAt;
    const offset = clockOffsetRef.current;
    function tick() {
      const elapsed = (Date.now() - offset - startedAtMs) / 1000;
      const r = Math.max(0, seconds - elapsed);
      setRem(r);
      if (r <= 0) {
        if (!firedRef.current) { firedRef.current = true; onEndRef.current(); }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);
  return { rem, reset };
}

/** 경매 타이머: 원형 링 + 남은 초. 시작 전에는 대기 표시. */
export default function AuctionTimer({ onEnd, resetRef, startedAt, serverNow }: {
  onEnd: () => void;
  resetRef: React.MutableRefObject<(() => void) | null>;
  startedAt: number | null;
  serverNow: number | null;
}) {
  const { rem, reset } = useCountdown(AUCTION_SECONDS, onEnd, startedAt, serverNow);
  resetRef.current = reset;
  const R = 54, C = 2 * Math.PI * R;
  const idle = !startedAt;
  const ratio = idle ? 1 : rem / AUCTION_SECONDS;
  const level = idle ? "idle" : rem <= 3 ? "danger" : rem <= 6 ? "warn" : "ok";
  return (
    <div className={"auc-ring " + level}>
      <svg viewBox="0 0 128 128" aria-hidden>
        <circle className="track" cx="64" cy="64" r={R} />
        <circle className="prog" cx="64" cy="64" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} />
      </svg>
      <div className="auc-ring-inner">
        {idle
          ? <><span className="auc-ring-idle">대기</span><small>경매 대기 중…</small></>
          : <><span className="auc-ring-num">{String(Math.ceil(rem)).padStart(2, "0")}</span><small>SEC</small></>}
      </div>
    </div>
  );
}
