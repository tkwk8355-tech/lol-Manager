"use client";

// =============================================================
// 미니게임은 키보드/마우스가 필요해서 PC에서만 참여할 수 있게 막는다.
// - 마우스 같은 정밀한 포인터가 있고, 휴대폰 브라우저가 아니면 PC로 본다.
// - 태블릿도 마우스를 연결하지 않았으면 막힌다.
// - 서버에서도 휴대폰 접속은 막는다 (lib/minigameDevice.ts).
// =============================================================

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./DesktopOnly.module.css";

const MOBILE_UA = /Android|iPhone|iPod|Mobi/i;

const detectDesktop = () => {
  if (typeof window === "undefined") return true;
  const hasMouse = window.matchMedia("(any-pointer: fine)").matches;
  return hasMouse && !MOBILE_UA.test(navigator.userAgent);
};

/** PC면 true, 휴대폰/태블릿이면 false, 확인 전이면 null */
export const useIsDesktop = () => {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(any-pointer: fine)");
    const update = () => setDesktop(detectDesktop());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
};

export default function DesktopOnly({ title, children }: { title: string; children: ReactNode }) {
  const desktop = useIsDesktop();
  if (desktop === null) return null; // 확인 전 깜빡임 방지
  if (desktop) return <>{children}</>;
  return (
    <div className={`ui-card ${styles.notice}`}>
      <div className={styles.icon}>🖥️</div>
      <h2>{title} · PC 전용</h2>
      <p>키보드와 마우스로 하는 게임이라 휴대폰·태블릿에서는 참여할 수 없어요.<br />PC로 접속해서 도전해 주세요!</p>
      <Link href="/content" className="btn-secondary">← 콘텐츠 목록</Link>
    </div>
  );
}
