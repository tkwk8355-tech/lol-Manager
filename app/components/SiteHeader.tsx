"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import ThemeToggle from "./ThemeToggle";
import ProfileAvatar from "./ProfileAvatar";
import ProfileModal from "./ProfileModal";
import styles from "./SiteHeader.module.css";

// =============================================================
// 상단 메뉴
// - '클랜'(클랜원 관리 · 지인 관리), '콘텐츠'(미니게임)만 드롭다운으로 묶는다.
// - 포인트 · 캘린더는 묶음 밖 단독 메뉴로 둔다.
// - 넓은 화면: 가로 메뉴 + 드롭다운 / 좁은 화면(960px 이하): 햄버거 → 펼침 메뉴
// - 새 미니게임은 '콘텐츠' children에 한 줄 추가하면 된다.
// - 오른쪽 위: 테마 전환 · 프로필(누르면 프로필 팝업: 방 구경 · 비밀번호 변경 · 로그아웃)
// =============================================================

type NavLink = { href: string; icon: string; label: string; scrimOnly?: boolean };
type NavGroup = { key: string; icon: string; label: string; match?: string; children: NavLink[] };
type NavEntry = NavLink | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const isActive = (pathname: string | null, href: string) =>
  !!pathname && (pathname === href || (href !== "/" && pathname.startsWith(href + "/")));

const groupActive = (pathname: string | null, g: NavGroup) =>
  g.children.some((c) => isActive(pathname, c.href)) || (!!g.match && isActive(pathname, g.match));

const Chevron = () => (
  <svg className={styles.chev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export default function SiteHeader() {
  const { user, loading, openAuthModal } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerGroups, setDrawerGroups] = useState<Set<string>>(new Set());
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  const isStaff = user?.role === "admin" || user?.role === "subadmin";
  const allNav: NavEntry[] = [
    { href: "/",       icon: "🏠", label: "홈" },
    { href: "/party",  icon: "🛡️", label: "파티모집" },
    { href: "/scrim",  icon: "⚔️", label: "내전 관리", scrimOnly: true },
    { href: "/search", icon: "🔍", label: "전적 검색" },
    { href: "/event",  icon: "🎉", label: "이벤트" },
    { href: "/points", icon: "💰", label: "포인트" },
    { href: "/calendar", icon: "📅", label: "캘린더" },
    {
      key: "clan", icon: "👥", label: "클랜",
      children: [
        { href: "/userInfo", icon: "👥", label: isStaff ? "클랜원 관리" : "클랜원" },
        { href: "/friends",  icon: "🤝", label: "지인 관리" },
      ],
    },
    {
      key: "content", icon: "🎮", label: "콘텐츠", match: "/content",
      children: [
        { href: "/content/bomb", icon: "💣", label: "폭탄돌리기" },
        { href: "/content/aim",  icon: "🎯", label: "에임 연습" },
        { href: "/content/tetris", icon: "🧱", label: "테트리스 40줄" },
        { href: "/content/apple",  icon: "🍎", label: "사과게임" },
        { href: "/content/room",   icon: "🛋️", label: "방꾸미기" },
      ],
    },
  ];

  // 권한별로 보이는 메뉴만 남긴다 (빈 그룹은 숨김)
  const allow = (l: NavLink) =>
    !user ? false
    : user.scrimOnly ? !!l.scrimOnly
    : user.role === "captain" ? l.href === "/event"
    : true;
  const nav: NavEntry[] = allNav
    .map((e) => (isGroup(e) ? { ...e, children: e.children.filter(allow) } : e))
    .filter((e) => (isGroup(e) ? e.children.length > 0 : allow(e)));

  // 프로필 테두리 · 아이콘 (방꾸미기에서 바꾸면 'profile-updated' 이벤트로 다시 불러온다)
  const userId = user?.userId;
  useEffect(() => {
    if (!userId) { setFrame(null); setIcon(null); return; }
    const load = () => fetch("/api/room").then(r => (r.ok ? r.json() : null))
      .then(j => { setFrame(j?.owner?.frame ?? null); setIcon(j?.owner?.icon ?? null); }).catch(() => {});
    load();
    window.addEventListener("profile-updated", load);
    return () => window.removeEventListener("profile-updated", load);
  }, [userId]);

  // 페이지가 바뀌면 메뉴를 닫는다
  useEffect(() => { setOpenGroup(null); setDrawerOpen(false); }, [pathname]);

  // 드롭다운: 바깥 클릭 / Esc로 닫기
  useEffect(() => {
    if (!openGroup && !drawerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenGroup(null); setDrawerOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openGroup, drawerOpen]);

  // 펼침 메뉴가 열려 있는 동안 뒤 페이지 스크롤 막기
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  // 펼침 메뉴를 열 때 지금 보고 있는 페이지의 그룹은 펼쳐 둔다
  const toggleDrawer = () => {
    if (!drawerOpen) {
      setDrawerGroups(new Set(nav.filter(isGroup).filter((g) => groupActive(pathname, g)).map((g) => g.key)));
    }
    setDrawerOpen((v) => !v);
  };
  const toggleDrawerGroup = (key: string) =>
    setDrawerGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <header className="site-header">
      <a href="/" className="site-brand"><span className="logo">또</span><span className="name">또간집</span></a>

      {/* ---------- 넓은 화면: 가로 메뉴 ---------- */}
      <nav className={styles.nav} ref={navRef}>
        {nav.map((item) =>
          isGroup(item) ? (
            <div
              key={item.key}
              className={`${styles.group} ${openGroup === item.key ? styles.open : ""}`}
              onMouseEnter={() => setOpenGroup(item.key)}
              onMouseLeave={() => setOpenGroup((g) => (g === item.key ? null : g))}
            >
              <button
                type="button"
                className={`site-nav-item ${styles.groupBtn}${groupActive(pathname, item) ? " active" : ""}`}
                aria-expanded={openGroup === item.key}
                aria-haspopup="menu"
                onClick={() => setOpenGroup((g) => (g === item.key ? null : item.key))}
              >
                <span className="sni-label">{item.label}</span>
                <Chevron />
              </button>
              {openGroup === item.key && (
                <div className={styles.menu} role="menu">
                  <div className={styles.menuInner}>
                    {item.children.map((c) => (
                      <a key={c.href} href={c.href} role="menuitem"
                         className={`${styles.menuItem}${isActive(pathname, c.href) ? ` ${styles.active}` : ""}`}>
                        <span className={styles.menuIcon}>{c.icon}</span>{c.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <a key={item.href} href={item.href}
               className={`site-nav-item${isActive(pathname, item.href) ? " active" : ""}`}>
              <span className="sni-label">{item.label}</span>
            </a>
          )
        )}
      </nav>

      <div className="site-auth">
        <ThemeToggle />
        {loading ? null : user ? (
          <button type="button" title="내 프로필" aria-label={`${user.nickname} · 내 프로필`} onClick={() => setShowProfile(true)}
                  className={`${styles.profile}${showProfile ? ` ${styles.profileOn}` : ""}`}>
            <ProfileAvatar userId={user.userId} nickname={user.nickname} frame={frame} icon={icon} />
            <span className={styles.profileName}>{user.nickname}</span>
          </button>
        ) : (
          <button className="auth-login-btn" onClick={() => openAuthModal("login")}>로그인</button>
        )}
      </div>

      {/* ---------- 좁은 화면: 햄버거 ---------- */}
      {nav.length > 0 && (
        <button type="button" className={styles.burger} onClick={toggleDrawer}
                aria-label={drawerOpen ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={drawerOpen}>
          {drawerOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      )}

      {drawerOpen && (
        <nav className={styles.drawer}>
          {nav.map((item) => {
            if (!isGroup(item)) {
              return (
                <a key={item.href} href={item.href}
                   className={`${styles.dItem}${isActive(pathname, item.href) ? ` ${styles.active}` : ""}`}>
                  <span className={styles.dIcon}>{item.icon}</span>{item.label}
                </a>
              );
            }
            const expanded = drawerGroups.has(item.key);
            return (
              <div key={item.key} className={expanded ? styles.open : ""}>
                <button type="button" aria-expanded={expanded} onClick={() => toggleDrawerGroup(item.key)}
                        className={`${styles.dItem}${groupActive(pathname, item) ? ` ${styles.groupOn}` : ""}`}>
                  <span className={styles.dIcon}>{item.icon}</span>{item.label}
                  <Chevron />
                </button>
                {expanded && (
                  <div className={styles.dSub}>
                    {item.children.map((c) => (
                      <a key={c.href} href={c.href}
                         className={`${styles.dItem}${isActive(pathname, c.href) ? ` ${styles.active}` : ""}`}>
                        <span className={styles.dIcon}>{c.icon}</span>{c.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </header>
  );
}
