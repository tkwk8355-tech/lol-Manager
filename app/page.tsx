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
  { href: "/party", icon: "🛡️", title: "파티 모집", desc: "협곡 · 칼바람 파티원 모집", color: "c-orange" },
  { href: "/scrim", icon: "⚔️", title: "내전", desc: "팀 자동 구성 · 경기 기록 · 통계", color: "c-purple" },
  { href: "/userInfo", icon: "👥", title: "클랜원", desc: "명단 · 티어 · 라인 보기", color: "c-green" },
  { href: "/points", icon: "🏅", title: "포인트", desc: "활동 포인트 현황 · 상점", color: "c-yellow" },
  { href: "/event", icon: "🎉", title: "이벤트", desc: "경매내전 · 솔랭내기", color: "c-pink" },
  { href: "/friends", icon: "🤝", title: "지인 관리", desc: "클랜원 지인 관계 조회", color: "c-blue" },
  { href: "/search", icon: "🔍", title: "전적 검색", desc: "소환사 랭크 · 매치 기록 조회", color: "c-blue" },
] as const;

// ------------------------------ 메인 ------------------------------
export default function Home() {
  const { user, openAuthModal } = useAuth();
  const [memberCount, setMemberCount] = useState(0);
  const [openPartyCount, setOpenPartyCount] = useState(0);
  const [recentParties, setRecentParties] = useState<RecentParty[]>([]);
  const [lineDist, setLineDist] = useState<Record<string, number>>({});
  const [birthdays, setBirthdays] = useState<{ nickname: string; birthYear: number | null }[]>([]);
  const [tomorrowBirthdays, setTomorrowBirthdays] = useState<{ nickname: string; birthYear: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((json) => {
        setMemberCount(json.memberCount ?? 0);
        setOpenPartyCount(json.openPartyCount ?? 0);
        setRecentParties(json.recentParties ?? []);
        setLineDist(json.lineDist ?? {});
        setBirthdays(json.birthdays ?? []);
        setTomorrowBirthdays(json.tomorrowBirthdays ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const guard = (e: React.MouseEvent) => { if (!user) { e.preventDefault(); openAuthModal("login"); } };
  const lineTotal = Object.values(lineDist).reduce((a, b) => a + b, 0);

  return (
    <div className="hm">
      {/* ── 히어로 ── */}
      <section className="hm-hero">
        <div className="hm-hero-text">
          <p className="hm-eyebrow">함께하는 롤 클랜</p>
          <h1>또간집 클랜 관리</h1>
          <p className="hm-desc">파티 모집부터 내전 팀 구성, 포인트와 이벤트까지 한곳에서.</p>
        </div>
        <div className="hm-stats">
          <div className="hm-stat">
            <span className="l">클랜원</span>
            <span className="v">{loading ? "-" : memberCount}<small>명</small></span>
          </div>
          <div className="hm-stat">
            <span className="l">모집 중인 파티</span>
            <span className="v">{loading ? "-" : openPartyCount}<small>개</small></span>
          </div>
          <div className="hm-stat wide">
            <span className="l">🎂 오늘 생일</span>
            <span className="v sm">
              {loading ? "-" : birthdays.length > 0 ? birthdays.map((b) => b.nickname).join(", ") : <span className="none">없음</span>}
            </span>
            {!loading && tomorrowBirthdays.length > 0 && (
              <span className="next">내일: {tomorrowBirthdays.map((b) => b.nickname).join(", ")}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── 바로가기 ── */}
      <section className="hm-features">
        {FEATURES.map((f) => (
          <Link href={f.href} className={`hm-feature ${f.color}`} key={f.title} onClick={f.href === "/search" ? undefined : guard}>
            <span className="ic">{f.icon}</span>
            <span className="tx">
              <b>{f.title}</b>
              <span>{f.desc}</span>
            </span>
            <span className="ar">→</span>
          </Link>
        ))}
      </section>

      {/* ── 파티 현황 + 라인 분포 ── */}
      <section className="hm-panels">
        <div className="ui-card hm-panel">
          <div className="hm-panel-head">
            <h3>모집 중인 파티</h3>
            <Link href="/party" className="hm-link" onClick={guard}>전체보기 →</Link>
          </div>
          {loading ? (
            <p className="ui-empty">불러오는 중...</p>
          ) : recentParties.length === 0 ? (
            <p className="ui-empty">모집 중인 파티가 없습니다.</p>
          ) : (
            <ul className="hm-parties">
              {recentParties.map((p) => (
                <li key={p.id}>
                  <span className={`party-mode-badge mode-${p.mode}`}>{MODE_SHORT[p.mode] ?? p.mode}</span>
                  <span className="host">{p.hostNickname}</span>
                  <span className="note">{p.note ?? ""}</span>
                  <span className="time">{fmtStart(p.startAt)}</span>
                  <span className={`cnt ${p.participantCount >= p.maxSize ? "full" : ""}`}>{p.participantCount}/{p.maxSize}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ui-card hm-panel">
          <div className="hm-panel-head">
            <h3>라인별 클랜원</h3>
            <Link href="/userInfo" className="hm-link" onClick={guard}>클랜원 보기 →</Link>
          </div>
          {loading ? (
            <p className="ui-empty">불러오는 중...</p>
          ) : lineTotal === 0 ? (
            <p className="ui-empty">라인 정보가 없습니다.</p>
          ) : (
            <ul className="hm-lines">
              {LINE_KEYS.map((lk) => {
                const count = lineDist[lk] ?? 0;
                const pct = Math.round((count / lineTotal) * 100);
                return (
                  <li key={lk}>
                    <span className="ln">{LINE_KO[lk]}</span>
                    <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                    <span className="cnt">{count}명 <small>{pct}%</small></span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
