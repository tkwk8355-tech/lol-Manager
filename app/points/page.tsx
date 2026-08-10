"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";

interface MemberPoint {
  id: number;
  nickname: string;
  totalPoints: number;
}

const ACTIVITY_TIERS = [
  { min: 3300, label: "C", color: "#d9a441" },
  { min: 2800, label: "M", color: "#9d4dc3" },
  { min: 2300, label: "D", color: "#4f7bd0" },
  { min: 1800, label: "E", color: "#2f9e6b" },
  { min: 1300, label: "P", color: "#3aa6a0" },
  { min: 800,  label: "G", color: "#cf9b41" },
  { min: 300,  label: "S", color: "#7e93a3" },
  { min: 0,    label: "B", color: "#8c5230" },
] as const;

function activityTier(points: number) {
  return ACTIVITY_TIERS.find((t) => points >= t.min) ?? null;
}

export default function PointsPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [members, setMembers] = useState<MemberPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    fetch("/api/userinfo")
      .then((r) => r.json())
      .then((json) => {
        const sorted: MemberPoint[] = (json.members ?? [])
          .map((m: any) => ({ id: m.id, nickname: m.nickname, totalPoints: m.totalPoints ?? 0 }))
          .sort((a: MemberPoint, b: MemberPoint) => b.totalPoints - a.totalPoints);
        setMembers(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="userinfo">
        <div className="party-login-notice">
          포인트 현황을 보려면 로그인이 필요합니다.
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px" }}>
      <h2 style={{ marginBottom: 4 }}>활동 포인트 현황</h2>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
        포인트 순으로 정렬됩니다.
      </p>
      {loading ? <p>불러오는 중...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {members.map((m, i) => {
            const at = activityTier(m.totalPoints);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8,
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)", width: 24, flexShrink: 0, textAlign: "center" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.nickname}
                </span>
                {at && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
                    background: `${at.color}22`, color: at.color, border: `1px solid ${at.color}55` }}>
                    {at.label}
                  </span>
                )}
                <span style={{ fontWeight: 800, fontSize: 13, flexShrink: 0,
                  color: m.totalPoints > 0 ? "var(--win-text)" : "var(--muted)" }}>
                  {m.totalPoints}P
                </span>
              </div>
            );
          })}
          {members.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 16, color: "var(--muted)", textAlign: "center" }}>데이터가 없습니다.</div>
          )}
        </div>
      )}
    </div>
  );
}
