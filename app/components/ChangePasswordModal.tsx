"use client";

// 비밀번호 변경 팝업 (프로필 팝업에서 연다)

import { useEffect, useState } from "react";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
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
