// =============================================================
// 클랜 홈 화면. 소환사 검색 기능은 /search로 이동했고,
// 여기서는 클랜 소개 + 바로가기 카드 + 최근 내전 결과 + 랭킹을 보여준다.
// 실시간 피드나 미니게임 같은 기능은 포함하지 않는다.
// =============================================================

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./components/AuthProvider";

// ------------------------------ 타입 ------------------------------
interface RecentParty {
  id: number;
  mode: string;
  status: string;
  hostNickname: string;
  note: string | null;
  startAt: string | null;
  maxSize: number;
  participantCount: number;
}

// ------------------------------ 헬퍼 ------------------------------
const MODE_KO: Record<string, string> = { aram: "칼바람", normal: "일반 협곡", flex: "자유랙크", solo: "솔랭" };
const MODE_SHORT: Record<string, string> = { aram: "칼바람", normal: "협곡", flex: "자유", solo: "솔랭" };
const MODE_ICON: Record<string, string> = { aram: "🌊", normal: "⚔️", flex: "🏆", solo: "👤" };
const LINE_KEYS = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
const LINE_KO: Record<string, string> = { TOP: "탑", JG: "정글", MID: "미드", ADC: "원딜", SUP: "서폿" };

function fmtStart(startAt: string | null) {
  if (!startAt) return "모바시";
  const d = new Date(startAt.replace(" ", "T"));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 홈에서 보여줄 바로가기 카드 목록. 실시간/미니게임 관련 항목은 제외.
// 카드마다 배경색을 다르게 줘서 구분되도록 color 클래스를 지정한다.
// - 파티 생성(/party): 협곡/칼바람 파티원 모집 (계정 기준 방장/참가)
// - 내전 매칭(/scrim): 기존 내전 점수 · 경기 기록 · 팀 밸런스 생성
// - 클랜원 목록은 조회 전용 페이지라 가장 마지막에 둔다.
const FEATURES = [
  { href: "/party", icon: "🛡️", title: "파티 생성", desc: "협곡 · 칼바람 파티원 모집", color: "c-orange" },
  { href: "/scrim", icon: "⚔️", title: "내전 매칭", desc: "균형 잡힌 팀 자동 구성 · 경기 기록", color: "c-purple" },
  { href: "/search", icon: "🔍", title: "전적 검색", desc: "소환사명으로 랭크 · 매치 기록 조회", color: "c-blue" },
  { href: "/userInfo", icon: "👥", title: "클랜원 관리", desc: "클랜원 명단 · 티어 · 라인 보기", color: "c-green" },
  { href: "/points", icon: "🏅", title: "포인트 관리", desc: "활동 포인트 현황 · 상점", color: "c-yellow" },
  { href: "/friends", icon: "🤝", title: "지인 관리", desc: "클랜원 지인 관계 조회", color: "c-pink" },
] as const;

// ------------------------------ 메인 ------------------------------
export default function Home() {
  const { user, openAuthModal } = useAuth();
  const [memberCount, setMemberCount] = useState(0);
  const [openPartyCount, setOpenPartyCount] = useState(0);
  const [recentParties, setRecentParties] = useState<RecentParty[]>([]);
  const [lineDist, setLineDist] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((json) => {
        setMemberCount(json.memberCount ?? 0);
        setOpenPartyCount(json.openPartyCount ?? 0);
        setRecentParties(json.recentParties ?? []);
        setLineDist(json.lineDist ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="home">
      {/* ── 히어로 ── */}
      <section className="hero">
        <p className="hero-eyebrow">함께하는 롤 또간집</p>
        <h1 className="hero-title">클랜 매니저</h1>
        <p className="hero-sub">또 간다, 또 이긴다. 우리 클랜의 모든 것을 한 곳에서.</p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-num">{loading ? "-" : memberCount}</span>
            <span className="hero-stat-label">클랜원</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-num">{loading ? "-" : openPartyCount}</span>
            <span className="hero-stat-label">파티 구인 현황</span>
          </div>
        </div>
        <div className="hero-actions">
          <Link href="/party" className="hero-btn c-orange" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>🛡️ 파티 생성</Link>
          <Link href="/scrim" className="hero-btn c-purple" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>⚔️ 내전 매칭</Link>
          <Link href="/search" className="hero-btn c-blue">🔍 전적 검색</Link>
          <Link href="/userInfo" className="hero-btn c-green" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>👥 클랜원 관리</Link>
          <Link href="/points" className="hero-btn c-yellow" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>🏅 포인트 관리</Link>
          <Link href="/friends" className="hero-btn c-pink" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>🤝 지인 관리</Link>
        </div>
      </section>

      {/* ── 기능 카드 ── */}
      <section className="feature-grid">
        {FEATURES.map((f) => (
          <Link
            href={f.href}
            className={`feature-card ${f.color}`}
            key={f.title}
            onClick={(e) => { if (f.href !== "/search" && !user) { e.preventDefault(); openAuthModal("login"); } }}
          >
            <span className="feature-icon">{f.icon}</span>
            <span className="feature-title">{f.title}</span>
            <span className="feature-desc">{f.desc}</span>
          </Link>
        ))}
      </section>

      {/* ── 히어로 하단: 파티현황 + 클랜원분포 ── */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="home-panel">
          <div className="home-panel-head">
            <h3>파티 현황</h3>
            <Link href="/party" className="home-panel-link" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>전체보기</Link>
          </div>
          {loading ? (
            <p className="empty">불러오는 중...</p>
          ) : recentParties.length === 0 ? (
            <p className="empty">모집 중인 파티가 없습니다.</p>
          ) : (
            <ul className="recent-party-list">
              {recentParties.map((p) => (
                <li className="recent-party-row" key={p.id}>
                  <span className={`party-mode-badge mode-${p.mode}`}>{MODE_ICON[p.mode]} {MODE_SHORT[p.mode] ?? p.mode}</span>
                  <span className="rp-host">{p.hostNickname}</span>
                  <span className="rp-note">{p.note ?? ""}</span>
                  <div className="rp-right">
                    <span className="party-start">{fmtStart(p.startAt)}</span>
                    <span className="rp-count">{p.participantCount}/{p.maxSize}명</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="home-panel">
          <div className="home-panel-head">
            <h3>라인별 분포</h3>
            <Link href="/userInfo" className="home-panel-link" onClick={(e) => { if (!user) { e.preventDefault(); openAuthModal("login"); } }}>클랜원 보기</Link>
          </div>
          {loading ? (
            <p className="empty">불러오는 중...</p>
          ) : (
            <ul className="line-dist-list">
              {LINE_KEYS.map((lk) => {
                const count = lineDist[lk] ?? 0;
                const total = Object.values(lineDist).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <li className="line-dist-row" key={lk}>
                    <span className="ld-line">{LINE_KO[lk]}</span>
                    <div className="ld-bar-wrap">
                      <div className="ld-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="ld-count">{count}명</span>
                  </li>
                );
              })}
              {Object.values(lineDist).reduce((a, b) => a + b, 0) === 0 && (
                <p className="empty">라인 정보가 없습니다.</p>
              )}
            </ul>
          )}
        </div>
      </section>


    </div>
  );
}