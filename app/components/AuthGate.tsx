"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, openAuthModal } = useAuth();
  const pathname = usePathname();

  if (loading) return null;

  if (!user) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "60vh", gap: 20,
      }}>
        <div style={{ fontSize: 48 }}>⚔️</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>또간집 클랜 관리 프로그램</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          로그인 후 이용할 수 있습니다.
        </p>
        <button
          className="auth-login-btn"
          style={{ padding: "12px 32px", fontSize: 15, borderRadius: 10 }}
          onClick={() => openAuthModal("login")}
        >
          로그인
        </button>
      </div>
    );
  }

  if (user.scrimOnly && !pathname.startsWith("/scrim")) {
    window.location.replace("/scrim");
    return null;
  }

  return <>{children}</>;
}
