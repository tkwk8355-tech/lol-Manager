"use client";

// =============================================================
// 경매내전 공통 타입 · 상수 · 작은 UI 조각
// (이벤트 페이지 경매 탭과 솔랭내기에서 같이 사용)
// =============================================================

import { useEffect, useRef, useState } from "react";

export interface AuctionPlayer {
  id: number; member_id: number; nickname: string; is_captain: number; points: number;
  team_id: number | null; sort_order: number; main_line: string | null; sub_line: string | null; user_id: number | null;
  champ1: string | null; champ2: string | null; champ3: string | null;
  roster_line: string | null; solo_tier: string | null; solo_rank: string | null;
}
export interface AuctionBid {
  id: number; session_id: number; player_id: number; captain_id: number; points: number; captain_name: string;
}
export interface AuctionSession {
  id: number; status: string; current_idx: number; timer_started: number; timer_started_at: number | null;
}
export interface SessionListItem {
  id: number; name: string | null; status: string; current_idx: number; created_at: string; player_count: number;
}
export interface Member { id: number; nickname: string; }
export interface RosterEntry {
  member_id: number; nickname: string; main_line: string | null; sub_line: string | null;
  solo_tier: string | null; solo_rank: string | null; line: string | null;
  champ1: string | null; champ2: string | null; champ3: string | null;
}

export const LINES = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
export const LINE_LABEL: Record<string, string> = { TOP: "탑", JG: "정글", MID: "미드", ADC: "원딜", SUP: "서폿" };
const LINE_ICON_BASE = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-";
export const LINE_ICON: Record<string, string> = {
  TOP: LINE_ICON_BASE + "top.png",
  JG: LINE_ICON_BASE + "jungle.png",
  MID: LINE_ICON_BASE + "middle.png",
  ADC: LINE_ICON_BASE + "bottom.png",
  SUP: LINE_ICON_BASE + "utility.png",
};
export const STATUS_LABEL: Record<string, string> = { waiting: "대기중", running: "진행중", done: "완료" };
export const STATUS_BADGE: Record<string, string> = { waiting: "", running: "blue", done: "green" };

/** 팀(팀장)별 색상. 라이트/다크 모두에서 읽히는 중간 채도 색. */
export const TEAM_COLORS = ["#5b8def", "#e8577a", "#4fb87a", "#d99a3a", "#9b7be8", "#2bb3cc"];

// ------------------------------ 이름 검색 ------------------------------
function getChosung(str: string): string {
  const C = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  return str.split("").map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return (c < 0 || c > 11171) ? ch : C[Math.floor(c / 588)]; }).join("");
}
/** 이름 일치 점수 (완전일치 3 > 앞부분 2 > 포함 1, 초성 검색 지원). 0이면 불일치. */
export function matchScore(name: string, q: string): number {
  const n = name.toLowerCase(), query = q.toLowerCase();
  if (n === query) return 3; if (n.startsWith(query)) return 2; if (n.includes(query)) return 1;
  const cs = getChosung(name); if (cs.startsWith(q)) return 2; if (cs.includes(q)) return 1; return 0;
}
export function searchMembers<T extends { nickname: string }>(list: T[], q: string, limit = 8): T[] {
  if (!q) return list.slice(0, limit);
  return list.filter(m => matchScore(m.nickname, q) > 0)
    .sort((a, b) => matchScore(b.nickname, q) - matchScore(a.nickname, q))
    .slice(0, limit);
}

// ------------------------------ 작은 UI 조각 ------------------------------
export function ChampImg({ name, size = 32, hidden = false }: { name: string | null; size?: number; hidden?: boolean }) {
  if (!name) return <span className="auc-champ empty" style={{ width: size, height: size }} />;
  const src = hidden ? "/champions/security.png" : `/champions/${name}.png`;
  return <img className="auc-champ" src={src} alt={hidden ? "?" : name} width={size} height={size} />;
}

/** 라인 아이콘. 원본이 흰색 PNG라 테마에 맞춰 CSS에서 색을 바꾼다. */
export function LineIcon({ line, size = 18, dim = false }: { line: string | null | undefined; size?: number; dim?: boolean }) {
  if (!line || !LINE_ICON[line]) return null;
  return <img className={"auc-line-ico" + (dim ? " dim" : "")} src={LINE_ICON[line]} alt={LINE_LABEL[line] ?? line} width={size} height={size} />;
}

export function TierText({ tier, rank }: { tier: string | null; rank: string | null }) {
  if (!tier) return null;
  return <span className="auc-tier">{tier} {rank}</span>;
}

/** 클랜원 검색 입력 (키보드 ↑↓/Enter/Esc 지원). */
export function MemberSearchInput({ members, usedIds, onSelect, placeholder }: {
  members: Member[]; usedIds: number[]; onSelect: (m: Member) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filtered = searchMembers(members.filter(m => !usedIds.includes(m.id)), q);
  useEffect(() => {
    function h(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setActiveIdx(-1); } }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  function select(m: Member) { onSelect(m); setQ(""); setOpen(false); setActiveIdx(-1); }
  return (
    <div ref={wrapRef} className="auc-search">
      <input
        className="ui-input"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); setActiveIdx(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
          else if (e.key === "Enter") { e.preventDefault(); const picked = activeIdx >= 0 ? filtered[activeIdx] : filtered[0] ?? null; if (picked) select(picked); else setOpen(false); }
          else if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
        }}
        placeholder={placeholder ?? "클랜원 검색"}
      />
      {open && filtered.length > 0 && (
        <div className="slot-candidates auc-search-list">
          {filtered.map((m, i) => (<button key={m.id} className={i === activeIdx ? "active" : ""} onMouseDown={() => select(m)}>{m.nickname}</button>))}
        </div>
      )}
    </div>
  );
}
