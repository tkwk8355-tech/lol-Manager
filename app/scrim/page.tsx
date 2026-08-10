"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { lineIconUrl, LINE_MAP } from "@/lib/lines";

const TIER_KO: Record<string,string> = {
  IRON:"아이언", BRONZE:"브론즈", SILVER:"실버", GOLD:"골드",
  PLATINUM:"플래티넘", EMERALD:"에메랄드", DIAMOND:"다이아",
  MASTER:"마스터", GRANDMASTER:"그랜드마스터", CHALLENGER:"챌린저",
};
const NO_DIV = ["MASTER","GRANDMASTER","CHALLENGER"];

function tierLabel(tier: string|null, rank: string|null, lp: number) {
  if (!tier) return "언랭";
  const ko = TIER_KO[tier] ?? tier;
  if (NO_DIV.includes(tier)) return tier === "MASTER" ? `${ko} ${lp}LP` : ko;
  const d = {I:"1",II:"2",III:"3",IV:"4"}[rank ?? ""] ?? rank;
  return `${ko} ${d}`;
}

const LINES = ["TOP","JG","MID","ADC","SUP"] as const;

interface LineStat { games: number; kills: number; deaths: number; assists: number; }

interface Player {
  memberId: number; nickname: string;
  tier: string|null; rank: string|null; lp: number;
  lineCounts: Record<string,number>;
  lineStats: Record<string,LineStat>;
  kills: number; deaths: number; assists: number; games: number; kda: string|null;
}

export default function ScrimPage() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detail, setDetail] = useState<Player | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/scrim");
      const json = await res.json();
      if (!res.ok) setError(json.error || "불러오기 실패");
      else setPlayers(json.players);
    } catch { setError("네트워크 오류"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [user, authLoading, load]);

  if (authLoading) return null;
  if (!user) return (
    <div className="scrim">
      <div className="party-login-notice">
        내전 통계를 보려면 로그인이 필요합니다.
        <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
      </div>
    </div>
  );

  return (
    <div className="scrim">
      <h2 className="scrim-title">내전 통계</h2>
      {/* 상세 모달 */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <span>📊 {detail.nickname} 내전 상세</span>
              <button className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>
            <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
              총 {detail.games}판 · 통합 KDA {detail.kda ?? "-"}
              {" · "}{detail.kills}/{detail.deaths}/{detail.assists}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "5px 8px" }}>라인</th>
                  <th style={{ textAlign: "center", padding: "5px 8px" }}>판수</th>
                  <th style={{ textAlign: "center", padding: "5px 8px" }}>K/D/A</th>
                  <th style={{ textAlign: "center", padding: "5px 8px" }}>KDA</th>
                </tr>
              </thead>
              <tbody>
                {LINES.filter((l) => detail.lineStats[l].games > 0).map((l) => {
                  const s = detail.lineStats[l];
                  const kda = ((s.kills + s.assists) / Math.max(s.deaths, 1)).toFixed(2);
                  return (
                    <tr key={l} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        {LINE_MAP[l] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lineIconUrl(LINE_MAP[l].icon)} alt={l} width={16} height={16} />
                        )}
                        {l}
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>{s.games}판</td>
                      <td style={{ padding: "7px 8px", textAlign: "center", color: "var(--muted)" }}>
                        {s.kills}/{s.deaths}/{s.assists}
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "center", fontWeight: 700,
                        color: Number(kda) >= 3 ? "var(--win-text)" : "var(--text)" }}>
                        {kda}
                      </td>
                    </tr>
                  );
                })}
                {LINES.every((l) => detail.lineStats[l].games === 0) && (
                  <tr><td colSpan={4} style={{ padding: "12px 8px", color: "var(--muted)", textAlign: "center" }}>내전 기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {loading ? <p>불러오는 중...</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px" }}>클랜원</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>솔랭 티어</th>
                {LINES.map((l) => (
                  <th key={l} style={{ textAlign: "center", padding: "6px 8px" }}>
                    {LINE_MAP[l] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lineIconUrl(LINE_MAP[l].icon)} alt={l} width={18} height={18} style={{ verticalAlign: "middle" }} />
                    ) : l}
                  </th>
                ))}
                <th style={{ textAlign: "center", padding: "6px 10px" }}>총판수</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>KDA</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.memberId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, cursor: "pointer", color: "var(--accent)" }}
                    onClick={() => setDetail(p)}>{p.nickname}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span className={`tier-badge tier-${(p.tier ?? "unranked").toLowerCase()}`}>
                      {tierLabel(p.tier, p.rank, p.lp)}
                    </span>
                  </td>
                  {LINES.map((l) => (
                    <td key={l} style={{ padding: "8px 8px", textAlign: "center", color: p.lineCounts[l] > 0 ? "var(--text)" : "var(--muted)" }}>
                      {p.lineCounts[l] > 0 ? p.lineCounts[l] : "-"}
                    </td>
                  ))}
                  <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--muted)" }}>
                    {p.games > 0 ? `${p.games}판` : "-"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700,
                    color: p.kda ? (Number(p.kda) >= 3 ? "var(--win-text)" : "var(--text)") : "var(--muted)" }}>
                    {p.kda ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
