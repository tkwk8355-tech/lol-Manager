"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
  }

  // 아이콘은 둘 다 렌더링하고 CSS(:root[data-theme])로 보여준다.
  // → 첫 로드 때 라이트 모드 사용자에게 아이콘이 깜빡이지 않고, 전환 시 크로스페이드된다.
  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggle}
      title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-label="테마 전환"
    >
      <span className="tt-icon tt-sun" aria-hidden>☀️</span>
      <span className="tt-icon tt-moon" aria-hidden>🌙</span>
    </button>
  );
}
