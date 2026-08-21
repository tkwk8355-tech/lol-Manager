import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import SiteHeader from "./components/SiteHeader";
import AuthModal from "./components/AuthModal";
import AuthGate from "./components/AuthGate";

export const metadata: Metadata = {
  title: "또간집 클랜 관리 프로그램",
  description: "A League of Legends match history & stats website.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
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
