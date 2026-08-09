"use client";

// =============================================================
// 전역 로그인/회원가입 모달.
// AuthProvider의 authModalOpen 상태에 따라 화면 어디서든 뜬다.
// 로그인이 필요한 동작을 할 때 페이지 이동 대신 이 모달을 그 자리에서 띄운다.
// =============================================================

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { LINES, lineIconUrl } from "@/lib/lines";

interface AvailableMember {
  id: number;
  nickname: string;
}

// 라인 아이콘 버튼으로 하나만 고르는 선택기 (주라인/부라인 각각 별도로 사용).
function SingleLinePicker({
  value, onChange, excludeKey,
}: {
  value: string; onChange: (key: string) => void; excludeKey?: string;
}) {
  return (
    <div className="line-picker">
      {LINES.map((l) => {
        const disabled = !!excludeKey && excludeKey === l.key;
        return (
          <button
            key={l.key}
            type="button"
            className={`line-picker-btn ${value === l.key ? "on" : ""}`}
            disabled={disabled}
            title={l.label}
            onClick={() => onChange(value === l.key ? "" : l.key)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lineIconUrl(l.icon)} alt={l.label} width={20} height={20} />
          </button>
        );
      })}
    </div>
  );
}

export default function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, login } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(authModalMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [memberId, setMemberId] = useState("");
  const [mainLine, setMainLine] = useState("");
  const [subLine, setSubLine] = useState("");
  const [members, setMembers] = useState<AvailableMember[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 모달이 열릴 때마다 요청된 모드(로그인/가입)로 맞추고 입력값을 비운다.
  useEffect(() => {
    if (!authModalOpen) return;
    setMode(authModalMode);
    setUsername(""); setPassword(""); setMemberId(""); setMainLine(""); setSubLine("");
    setError(""); setInfo("");
  }, [authModalOpen, authModalMode]);

  useEffect(() => {
    if (mode !== "signup") return;
    fetch("/api/auth/available-members")
      .then((res) => res.json())
      .then((json) => setMembers(json.members ?? []))
      .catch(() => setMembers([]));
  }, [mode]);

  if (!authModalOpen) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError("아이디와 비밀번호를 입력하세요."); return; }
    setSubmitting(true);
    setError("");
    const res = await login(username.trim(), password);
    setSubmitting(false);
    if (!res.ok) { setError(res.error || "로그인 실패"); return; }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || !memberId) {
      setError("아이디, 비밀번호를 입력하고 클랜원 목록에서 본인을 선택하세요.");
      return;
    }
    if (mainLine && subLine && mainLine === subLine) {
      setError("주라인과 부라인은 다르게 선택하세요.");
      return;
    }
    setSubmitting(true);
    setError(""); setInfo("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(), password, memberId: Number(memberId),
          mainLine: mainLine || null, subLine: subLine || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "가입 실패"); setSubmitting(false); return; }
      // 가입 후 바로 로그인까지 진행.
      const loginRes = await login(username.trim(), password);
      setSubmitting(false);
      if (!loginRes.ok) {
        setInfo("가입 완료. 로그인해주세요.");
        setMode("login");
        return;
      }
    } catch {
      setError("네트워크 오류");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={closeAuthModal}>
      <form
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={mode === "login" ? handleLogin : handleSignup}
      >
        <div className="auth-modal-head">
          <span className="login-popover-title">{mode === "login" ? "로그인" : "회원가입"}</span>
          <button type="button" className="modal-close" onClick={closeAuthModal}>×</button>
        </div>
        {mode === "signup" && (
          <>
            <select
              className="login-input"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">클랜원 목록에서 본인 선택</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname}</option>
              ))}
            </select>
            <div className="signup-line-field">
              <span className="link-label">주라인 (선택)</span>
              <SingleLinePicker
                value={mainLine}
                onChange={(v) => { setMainLine(v); if (v && v === subLine) setSubLine(""); }}
                excludeKey={subLine}
              />
            </div>
            <div className="signup-line-field">
              <span className="link-label">부라인 (선택)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SingleLinePicker
                  value={subLine}
                  onChange={(v) => { setSubLine(v); if (v && v === mainLine) setMainLine(""); }}
                  excludeKey={mainLine}
                />
                {subLine && (
                  <button type="button" className="modal-close" style={{ fontSize: 18 }} onClick={() => setSubLine("")}>×</button>
                )}
              </div>
            </div>
          </>
        )}
        <input
          className="login-input"
          placeholder="아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="login-input"
          placeholder="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}
        <button className="login-submit-btn" type="submit" disabled={submitting}>
          {submitting ? "처리 중..." : mode === "login" ? "로그인" : "가입하기"}
        </button>
        <button
          type="button"
          className="login-switch-btn"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}
        >
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
}
