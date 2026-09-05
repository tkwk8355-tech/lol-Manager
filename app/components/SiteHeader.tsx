"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function SiteHeader() {
  const { user, loading, logout, openAuthModal } = useAuth();
  const [showPwModal, setShowPwModal] = useState(false);

  function guardedNav(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!user) {
      e.preventDefault();
      openAuthModal("login");
    }
  }

  const pathname = usePathname();
  const allNav = [
    { href: "/",        icon: "🏠", label: "홈",       scrimOnly: false },
    { href: "/party",   icon: "🛡️", label: "파티모집",  scrimOnly: false },
    { href: "/scrim",   icon: "⚔️", label: "내전 관리", scrimOnly: true  },
    { href: "/points",  icon: "💰", label: "포인트",    scrimOnly: false },
    { href: "/auction", icon: "📢", label: "경매",      scrimOnly: false  },
    { href: "/friends", icon: "🤝", label: "지인 관리",  scrimOnly: false },
    { href: "/userInfo",icon: "👥", label: user?.role === "admin" || user?.role === "subadmin" ? "클랜원 관리" : "클랜원", scrimOnly: false },
    // { href: "/search",  icon: "🔍", label: "전적 검색", scrimOnly: false },
  ];
  const nav = !user ? [] : user.scrimOnly ? allNav.filter((i) => i.scrimOnly) : user.role==="captain" ? allNav.filter(i=>i.href==="/auction") : allNav;

  return (
    <header className="site-header">
      <nav className="site-nav">
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`site-nav-item${pathname === item.href ? " active" : ""}`}
          >
            <span className="sni-icon">{item.icon}</span>
            <span className="sni-label">{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="site-auth">
        {loading ? null : user ? (
          <div className="auth-user">
            <span className={`auth-role-badge ${user.role}`}>{user.role === "admin" ? "운영진" : user.role === "subadmin" ? "부운영진" : user.role === "captain" ? "팀장" : "클랜원"}</span>
            <button className="auth-nickname-btn" onClick={() => setShowPwModal(true)}>{user.nickname}</button>
            <button className="auth-logout-btn" onClick={logout}>로그아웃</button>
          </div>
        ) : (
          <button className="auth-login-btn" onClick={() => openAuthModal("login")}>로그인</button>
        )}
      </div>
      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </header>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) { setError("현재/새 비밀번호를 모두 입력하세요."); return; }
    setSubmitting(true); setError(""); setInfo("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "변경 실패"); return; }
      setInfo("비밀번호가 변경되었습니다.");
      setCurrentPassword(""); setNewPassword("");
    } catch {
      setError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-modal-backdrop">
      <form className="auth-modal" onSubmit={handleSubmit}>
        <div className="auth-modal-head">
          <span className="login-popover-title">비밀번호 변경</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <input
          className="login-input"
          type="password"
          placeholder="현재 비밀번호"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoFocus
        />
        <input
          className="login-input"
          type="password"
          placeholder="새 비밀번호"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}
        <button className="login-submit-btn" type="submit" disabled={submitting}>
          {submitting ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
