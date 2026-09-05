"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

export default function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, login } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(authModalMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authModalOpen) return;
    setMode(authModalMode);
    setUsername(""); setPassword(""); setNickname("");
    setError(""); setInfo("");
  }, [authModalOpen, authModalMode]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") closeAuthModal(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAuthModal]);

  if (!authModalOpen) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError("아이디와 비밀번호를 입력하세요."); return; }
    setSubmitting(true); setError("");
    const res = await login(username.trim(), password);
    setSubmitting(false);
    if (!res.ok) setError(res.error || "로그인 실패");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || !nickname.trim()) {
      setError("아이디, 비밀번호, 닉네임을 모두 입력하세요."); return;
    }
    setSubmitting(true); setError(""); setInfo("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, nickname: nickname.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "가입 실패"); setSubmitting(false); return; }
      const loginRes = await login(username.trim(), password);
      setSubmitting(false);
      if (!loginRes.ok) { setInfo("가입 완료. 로그인해주세요."); setMode("login"); }
    } catch {
      setError("네트워크 오류"); setSubmitting(false);
    }
  }

  return (
    <div className="auth-modal-backdrop">
      <form className="auth-modal" onSubmit={mode === "login" ? handleLogin : handleSignup}>
        <div className="auth-modal-head">
          <span className="login-popover-title">{mode === "login" ? "로그인" : "회원가입"}</span>
          <button type="button" className="modal-close" onClick={closeAuthModal}>×</button>
        </div>
        <input className="login-input" placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input className="login-input" placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "signup" && (
          <input className="login-input" placeholder="닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        )}
        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}
        <button className="login-submit-btn" type="submit" disabled={submitting}>
          {submitting ? "처리 중..." : mode === "login" ? "로그인" : "가입하기"}
        </button>
        <button type="button" className="login-switch-btn"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}>
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
}
