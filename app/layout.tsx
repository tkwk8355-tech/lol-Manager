import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import SiteHeader from "./components/SiteHeader";
import AuthModal from "./components/AuthModal";
import AuthGate from "./components/AuthGate";

export const metadata: Metadata = {
  title: "또간집 클랜 관리 프로그램",
  description: "또간집 롤 클랜의 파티 모집, 내전 팀 구성, 전적, 포인트와 이벤트를 한곳에서 관리해요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <SiteHeader />
          <main className="container">
            <AuthGate>{children}</AuthGate>
          </main>
          <AuthModal />
        </AuthProvider>
      </body>
    </html>
  );
}
