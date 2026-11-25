"use client";

// =============================================================
// 로그인 / 회원가입 팝업
// 회원가입 순서: 아이디 중복 확인 → 비밀번호 → 롤 계정으로 클랜원 확인 → 가입 신청(승인 대기)
// 운영진이 클랜원 관리 > 계정 탭에서 승인하면 로그인할 수 있다.
// =============================================================

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { MIN_PASSWORD, USERNAME_HINT, USERNAME_RULE, parseRiotId } from "@/lib/signupShared";
import styles from "./AuthModal.module.css";

type Check = { state: "idle" | "checking" | "ok" | "bad"; msg: string };
const IDLE: Check = { state: "idle", msg: "" };

export default function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, login } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "done">(authModalMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [riotId, setRiotId] = useState("");
  const [nickname, setNickname] = useState("");
  const [idCheck, setIdCheck] = useState<Check>(IDLE);
  const [memberCheck, setMemberCheck] = useState<Check & { nickname?: string }>(IDLE);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authModalOpen) return;
    setMode(authModalMode);
    setUsername(""); setPassword(""); setPassword2(""); setRiotId(""); setNickname("");
    setIdCheck(IDLE); setMemberCheck(IDLE);
    setError(""); setInfo("");
  }, [authModalOpen, authModalMode]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") closeAuthModal(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAuthModal]);

  if (!authModalOpen) return null;

  const switchMode = (m: "login" | "signup") => { setMode(m); setError(""); setInfo(""); };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError("아이디와 비밀번호를 입력하세요."); return; }
    setSubmitting(true); setError("");
    const res = await login(username.trim(), password);
    setSubmitting(false);
    if (!res.ok) setError(res.error || "로그인 실패");
  }

  // ---------- 회원가입 ----------
  async function checkUsername() {
    const u = username.trim();
    if (!USERNAME_RULE.test(u)) { setIdCheck({ state: "bad", msg: `아이디는 ${USERNAME_HINT}로 정해 주세요.` }); return; }
    setIdCheck({ state: "checking", msg: "확인 중…" });
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(u)}`);
      const j = await res.json();
      setIdCheck(j.available ? { state: "ok", msg: "사용할 수 있는 아이디예요." } : { state: "bad", msg: j.error || "사용할 수 없는 아이디예요." });
    } catch { setIdCheck({ state: "bad", msg: "네트워크 오류" }); }
  }

  async function checkMember() {
    if (!parseRiotId(riotId)) { setMemberCheck({ state: "bad", msg: "'닉네임#태그' 형식으로 입력해 주세요. (예: 또간집#KR1)" }); return; }
    setMemberCheck({ state: "checking", msg: "확인 중…" });
    try {
      const res = await fetch("/api/auth/verify-member", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ riotId }),
      });
      const j = await res.json();
      setMemberCheck(j.ok ? { state: "ok", msg: `클랜원 '${j.nickname}'님으로 확인됐어요.`, nickname: j.nickname } : { state: "bad", msg: j.error || "확인하지 못했어요." });
    } catch { setMemberCheck({ state: "bad", msg: "네트워크 오류" }); }
  }

  const pwShort = password.length > 0 && password.length < MIN_PASSWORD;
  const pwMismatch = password2.length > 0 && password !== password2;
  const canSubmit = idCheck.state === "ok" && memberCheck.state === "ok" && password.length >= MIN_PASSWORD && password === password2;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (idCheck.state !== "ok") { setError("아이디 중복 확인을 해 주세요."); return; }
    if (password.length < MIN_PASSWORD) { setError(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`); return; }
    if (password !== password2) { setError("비밀번호가 서로 달라요."); return; }
    if (memberCheck.state !== "ok") { setError("클랜원 확인을 해 주세요."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, riotId, nickname: nickname.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "가입 실패"); return; }
      setMode("done");
    } catch {
      setError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  }

  const status = (c: Check) =>
    c.state === "idle" ? null : (
      <div className={`${styles.status} ${c.state === "ok" ? styles.ok : c.state === "bad" ? styles.bad : ""}`}>
        {c.state === "ok" ? "✓ " : c.state === "bad" ? "✕ " : ""}{c.msg}
      </div>
    );

  if (mode === "done") {
    return (
      <div className="auth-modal-backdrop">
        <div className={`auth-modal ${styles.wide}`}>
          <div className="auth-modal-head">
            <span className="login-popover-title">가입 신청 완료</span>
            <button type="button" className="modal-close" onClick={closeAuthModal}>×</button>
          </div>
          <div className={styles.done}>
            <div className={styles.doneIcon}>🎉</div>
            <p><b>{memberCheck.nickname}</b>님, 가입 신청이 접수됐어요.</p>
            <p className={styles.muted}>운영진이 클랜원 확인 후 승인하면 로그인할 수 있어요.<br />승인이 늦어지면 운영진에게 말해 주세요.</p>
          </div>
          <button className="login-submit-btn" type="button" onClick={() => { setPassword(""); switchMode("login"); }}>로그인 화면으로</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-modal-backdrop">
      <form className={`auth-modal${mode === "signup" ? ` ${styles.wide}` : ""}`} onSubmit={mode === "login" ? handleLogin : handleSignup}>
        <div className="auth-modal-head">
          <span className="login-popover-title">{mode === "login" ? "로그인" : "회원가입"}</span>
          <button type="button" className="modal-close" onClick={closeAuthModal}>×</button>
        </div>

        {mode === "login" ? (
          <>
            <input className="login-input" placeholder="아이디" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <input className="login-input" placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <>
            <p className={styles.lead}>클랜원만 가입할 수 있어요. 가입 신청 후 운영진이 승인하면 로그인돼요.</p>

            <label className={styles.label}>아이디</label>
            <div className={styles.row}>
              <input className="login-input" placeholder={USERNAME_HINT} value={username} autoFocus autoComplete="username"
                     onChange={(e) => { setUsername(e.target.value); setIdCheck(IDLE); }} />
              <button type="button" className={styles.checkBtn} onClick={checkUsername} disabled={idCheck.state === "checking" || !username.trim()}>중복 확인</button>
            </div>
            {status(idCheck)}

            <label className={styles.label}>비밀번호</label>
            <input className="login-input" type="password" placeholder={`${MIN_PASSWORD}자 이상`} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
            <input className="login-input" type="password" placeholder="비밀번호 확인" value={password2} autoComplete="new-password" onChange={(e) => setPassword2(e.target.value)} />
            {(pwShort || pwMismatch) && <div className={`${styles.status} ${styles.bad}`}>✕ {pwShort ? `${MIN_PASSWORD}자 이상 입력해 주세요.` : "비밀번호가 서로 달라요."}</div>}

            <label className={styles.label}>클랜원 인증 <small>클랜에 등록된 내 롤 계정</small></label>
            <div className={styles.row}>
              <input className="login-input" placeholder="닉네임#태그 (예: 또간집#KR1)" value={riotId}
                     onChange={(e) => { setRiotId(e.target.value); setMemberCheck(IDLE); }} />
              <button type="button" className={styles.checkBtn} onClick={checkMember} disabled={memberCheck.state === "checking" || !riotId.trim()}>클랜원 확인</button>
            </div>
            {status(memberCheck)}

            <label className={styles.label}>사이트 닉네임 <small>선택</small></label>
            <input className="login-input" maxLength={30} placeholder={memberCheck.nickname ? `비워 두면 '${memberCheck.nickname}'` : "비워 두면 클랜원 이름으로"} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </>
        )}

        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}
        <button className="login-submit-btn" type="submit" disabled={submitting || (mode === "signup" && !canSubmit)}>
          {submitting ? "처리 중..." : mode === "login" ? "로그인" : "가입 신청"}
        </button>
        <button type="button" className="login-switch-btn" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
}
