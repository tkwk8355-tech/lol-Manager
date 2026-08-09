"use client";

// =============================================================
// 로그인 상태를 앱 전역에서 공유하기 위한 간단한 컨텍스트.
// 서버에는 세션 쿠키가 있고, 클라이언트는 /api/auth/me로 현재 로그인 사용자를 받아온다.
// =============================================================

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Role = "admin" | "member";
export interface AuthUser {
  userId: number;
  username: string;
  nickname: string;
  role: Role;
  linkedRiotId: string | null; // 연동된 클랜원의 등록된 롤 ID (없으면 파티 생성/참가 불가)
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  // 전역 로그인/회원가입 팝업. 어디서든 호출하면 페이지 이동 없이 그 자리에서 모달이 뜬다.
  authModalOpen: boolean;
  authModalMode: "login" | "signup";
  openAuthModal: (mode?: "login" | "signup") => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAdmin: false,
  login: async () => ({ ok: false }),
  logout: async () => {},
  refresh: async () => {},
  authModalOpen: false,
  authModalMode: "login",
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup">("login");

  const openAuthModal = useCallback((mode: "login" | "signup" = "login") => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function login(username: string, password: string) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error || "로그인 실패" };
      setUser(json.user);
      setAuthModalOpen(false);
      return { ok: true };
    } catch {
      return { ok: false, error: "네트워크 오류" };
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading, isAdmin: user?.role === "admin", login, logout, refresh,
        authModalOpen, authModalMode, openAuthModal, closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
