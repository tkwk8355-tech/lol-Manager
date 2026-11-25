"use client";

// 파티 모집 페이지 오른쪽에 붙는 "파티 내역" 패널 (운영진 전용)
// 최근 30일 동안 종료(펑)된 파티를 시작 시각 최신순으로 20개씩 보여준다. 닉네임·메모로 검색할 수 있다.
// 내역을 보면서 빠진 파티를 왼쪽 생성 폼으로 바로 만들 수 있도록 패널은 모달이 아니라 옆에 붙는다.

import { useCallback, useEffect, useState } from "react";

type Mode = "aram" | "arena" | "normal" | "flex" | "solo";

interface HistoryParty {
  id: number;
  mode: Mode;
  note: string | null;
  startAt: string | null;
  endedAt: string | null;
  endedBy: string | null;
  participants: string[];
  pastParticipants: string[];
  /** 칼바람/증바람: 참가자별 입력 판수 (기록이 없으면 null) */
  games: Record<string, number> | null;
}

const MODE_KO: Record<string, string> = { aram: "칼바람", arena: "증바람", normal: "일반협곡", flex: "자유랭크", solo: "솔로랭크" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const PAGE_SIZE = 20;

// "2026-11-03 21:00:00" → { day: "11.03 (화)", time: "21:00" }
function splitDate(s: string | null): { key: string; day: string; time: string } {
  if (!s) return { key: "", day: "시간 미정", time: "" };
  const [d, t = ""] = s.replace("T", " ").split(" ");
  const [y, m, dd] = d.split("-").map(Number);
  const dow = DOW[new Date(y, m - 1, dd).getDay()];
  return { key: d, day: `${String(m).padStart(2, "0")}.${String(dd).padStart(2, "0")} (${dow})`, time: t.slice(0, 5) };
}

export default function PartyHistoryPanel({ mode, refreshKey, onClose, onFill }: {
  /** 파티 모집 페이지에서 선택한 탭 ("all" 이면 전체) */
  mode: string;
  /** 값이 바뀌면 다시 불러온다 (파티 생성/펑 직후) */
  refreshKey: number;
  onClose: () => void;
  /** "채우기" — 생성 폼에 모드/날짜/시간/참가자를 채운다 */
  onFill: (mode: Mode, participants: string[], startAt: string | null) => void;
}) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; parties: HistoryParty[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");

  // 입력이 멈추고 300ms 뒤에 검색
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 탭이나 검색어가 바뀌면 첫 페이지로
  useEffect(() => { setPage(0); }, [mode, q]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (mode !== "all") qs.set("mode", mode);
      if (q) qs.set("q", q);
      const res = await fetch(`/api/party/history?${qs}`);
      const json = await res.json();
      if (!res.ok) setErr(json.error || "불러오기 실패");
      else setData({ total: json.total ?? 0, parties: json.parties ?? [] });
    } catch { setErr("네트워크 오류"); }
    finally { setLoading(false); }
  }, [mode, page, q]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  // 같은 날짜끼리 묶어서 날짜 머리글을 한 번만 보여준다
  let prevDay = "";

  return (
    <aside className="pt-history" aria-label="파티 내역">
      <div className="pt-history-head">
        <b>파티 내역</b>
        <span className="pt-history-sub">
          {MODE_KO[mode] ?? "전체"} · 최근 30일 · {data ? `${data.total}건` : "…"}
        </span>
        <button type="button" className="pt-icon" title="새로고침" onClick={load} disabled={loading}>↻</button>
        <button type="button" className="pt-icon" title="닫기" onClick={onClose}>✕</button>
      </div>

      <div className="pt-history-search">
        <input
          type="search"
          className="ui-input"
          placeholder="닉네임 또는 메모 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="파티 내역 검색"
        />
      </div>

      <div className="pt-history-body">
        {err && <div className="error" style={{ margin: 0 }}>{err}</div>}
        {!err && loading && !data && <p className="ui-empty">불러오는 중...</p>}
        {!err && data && data.parties.length === 0 && (
          <p className="ui-empty">{q ? `'${q}' 검색 결과가 없습니다.` : "최근 30일 동안 종료된 파티가 없습니다."}</p>
        )}

        {data?.parties.map((p) => {
          const { key, day, time } = splitDate(p.startAt);
          const showDay = key !== prevDay;
          prevDay = key;
          return (
            <div key={p.id}>
              {showDay && <div className="pt-history-day">{day}</div>}
              <div className="pt-history-item">
                <div className="pt-history-row">
                  <span className="pt-history-time">{time || "--:--"}</span>
                  <span className={`party-mode-badge mode-${p.mode}`}>{MODE_KO[p.mode] ?? p.mode}</span>
                  <span className="pt-history-cnt">{p.participants.length}명</span>
                  {p.endedBy && <span className="pt-history-by" title="펑 처리한 운영진">{p.endedBy}</span>}
                  {p.participants.length > 0 && (
                    <button type="button" className="pt-history-fill" title="이 파티의 모드·날짜·시간·참가자로 왼쪽 생성 폼 채우기"
                      onClick={() => onFill(p.mode, p.participants, p.startAt)}>↙ 채우기</button>
                  )}
                </div>
                {p.note && <div className="pt-history-note">{p.note}</div>}
                <div className="pt-history-chips">
                  {p.participants.map((n) => (
                    <span key={n} className="pt-chip">
                      {n}{p.games?.[n] != null && <em className="pt-chip-games">{p.games[n]}판</em>}
                    </span>
                  ))}
                  {p.participants.length === 0 && <span className="pt-chip empty">참가자 없음</span>}
                  {p.pastParticipants.map((n) => (
                    <span key={`x-${n}`} className="pt-chip past" title="중간에 빠진 참가자">
                      {n}{p.games?.[n] != null && <em className="pt-chip-games">{p.games[n]}판</em>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="pt-history-pager">
          <button type="button" className="sc-tool-btn" disabled={page === 0 || loading} onClick={() => setPage((x) => x - 1)}>← 최근</button>
          <span>{page + 1} / {totalPages}</span>
          <button type="button" className="sc-tool-btn" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((x) => x + 1)}>이전 →</button>
        </div>
      )}
    </aside>
  );
}
