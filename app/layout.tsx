// =============================================================
// 루트 레이아웃: 모든 페이지를 감싸는 공통 틀.
// 상단 헤더(로고)와 본문 컨테이너를 정의하고, 전역 CSS를 불러온다.
// =============================================================

import type { Metadata } from "next";
import "./globals.css"; // 전역 스타일(다크 테마 등)
import { AuthProvider } from "./components/AuthProvider";
import SiteHeader from "./components/SiteHeader";
import AuthModal from "./components/AuthModal";

// 브라우저 탭 제목/설명 등 메타데이터.
export const metadata: Metadata = {
  title: "SummonerLog",
  description: "A League of Legends match history & stats website.",
};

// children에는 각 페이지(app/page.tsx 등)의 내용이 들어온다.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          {/* 상단 헤더: 좌측 메뉴 + 우측 로그인/사용자 정보 */}
          <SiteHeader />
          {/* 본문: 가운데 정렬된 컨테이너 안에 페이지 내용 렌더 */}
          <main className="container">{children}</main>
          {/* 전역 로그인/회원가입 모달. 어디서든 openAuthModal()로 띄울 수 있다. */}
          <AuthModal />
        </AuthProvider>
      </body>
    </html>
  );
}
