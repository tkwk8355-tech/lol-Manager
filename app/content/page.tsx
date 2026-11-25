"use client";

// =============================================================
// 콘텐츠: 클랜원끼리 즐길 수 있는 미니게임 목록.
// 새 게임을 만들면 app/content/<이름>/page.tsx를 추가하고 GAMES에 한 줄 넣으면 된다.
// =============================================================

import Link from "next/link";
import { useIsDesktop } from "../components/minigame/DesktopOnly";
import notice from "../components/minigame/DesktopOnly.module.css";

const GAMES = [
  { href: "/content/bomb", icon: "💣", title: "폭탄돌리기", desc: "부딪혀서 폭탄 넘기기 · 마지막 1명 우승", color: "c-orange" },
  { href: "/content/aim", icon: "🎯", title: "에임 연습", desc: "30초 과녁 맞히기 · 클랜 랭킹", color: "c-blue" },
  { href: "/content/tetris", icon: "🧱", title: "테트리스 40줄", desc: "40줄 빨리 지우기 · 클랜 랭킹", color: "c-purple" },
  { href: "/content/apple", icon: "🍎", title: "사과게임", desc: "합이 10이 되게 사과 묶기 · 2분 · 클랜 랭킹", color: "c-green" },
  { href: "/content/room", icon: "🛋️", title: "방꾸미기", desc: "포인트로 가구 · 프로필 아이콘 · 테두리 사서 내 방 꾸미기", color: "c-pink" },
] as const;

export default function ContentPage() {
  const desktop = useIsDesktop();
  return (
    <div>
      <div className="ui-page-head">
        <div>
          <h2>콘텐츠</h2>
          <p>클랜원끼리 함께 즐기는 미니게임이에요. (방꾸미기 말고는 PC 전용)</p>
        </div>
      </div>
      {desktop === false && (
        <div className={notice.banner}>🖥️ 미니게임은 키보드·마우스가 필요해서 PC에서만 참여할 수 있어요.</div>
      )}
      <section className="hm-features">
        {GAMES.map((g) => (
          <Link href={g.href} className={`hm-feature ${g.color}`} key={g.href}>
            <span className="ic">{g.icon}</span>
            <span className="tx">
              <b>{g.title}</b>
              <span>{g.desc}</span>
            </span>
            <span className="ar">→</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
