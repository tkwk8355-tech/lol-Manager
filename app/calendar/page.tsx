// =============================================================
// 클랜 공유 캘린더 (/calendar)
// - 월간 보기. 일정은 DB에 저장되어 클랜원 모두에게 같은 화면으로 보인다.
// - 자동 표시: 경고 해제일(경고일 + 3개월), 클랜원 생일
// - 운영진: 날짜를 클릭(또는 드래그로 여러 날 선택)하면 바로 일정 추가,
//           본인이 등록한 일정만 수정/삭제 가능
// - 색상: 내가 등록한 일정은 항상 파랑, 다른 사람 일정은 등록자마다 정해진 색
// =============================================================

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";

// ------------------------------ 타입 ------------------------------
interface CalEvent {
  id: number; title: string; startDate: string; endDate: string;
  startTime: string | null; endTime: string | null; allDay: boolean;
  color: string; memo: string | null; createdBy: string; createdById: number | null;
}
interface WarnRelease { id: number; name: string; type: string; warnedAt: string; releaseDate: string }
interface Birthday { memberId: number; name: string; date: string }

// 화면에 그리는 한 칸짜리 항목 (일정/경고해제/생일 공통)
interface Item {
  key: string;
  kind: "event" | "warn" | "birth";
  start: string; end: string;   // YYYY-MM-DD
  label: string;
  time?: string | null;
  color: string;
  event?: CalEvent; warn?: WarnRelease; birth?: Birthday;
}

// ------------------------------ 날짜 헬퍼 ------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s: string, n: number) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return toYmd(d); };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function fmtDay(s: string) { const d = fromYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`; }
function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}${m ? `:${pad(m)}` : "시"}`;
}

// 다른 사람 일정 색 (파랑은 '나' 전용이라 제외). 등록자 ID로 고정 배정 → 누가 봐도 같은 사람은 같은 색
const OTHER_COLORS = ["green", "purple", "red", "orange", "teal", "brown", "gray"];
function ownerColor(createdById: number | null, myId: number | undefined) {
  if (createdById != null && createdById === myId) return "blue";
  if (createdById == null) return "gray";
  return OTHER_COLORS[createdById % OTHER_COLORS.length];
}
const MAX_LANES = 3; // 칸 하나에 보여줄 최대 줄 수 (넘으면 +N개)

// ------------------------------ 메인 ------------------------------
export default function CalendarPage() {
  const { isAdmin, user } = useAuth();
  const myId = user?.userId;
  const isMine = (e?: CalEvent) => !!e && e.createdById != null && e.createdById === myId;
  const today = toYmd(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [warns, setWarns] = useState<WarnRelease[]>([]);
  const [births, setBirths] = useState<Birthday[]>([]);
  const [warnMonths, setWarnMonths] = useState(3);
  const [show, setShow] = useState({ event: true, warn: true, birth: true });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [editor, setEditor] = useState<{ mode: "add" | "edit"; draft: Draft } | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [dayList, setDayList] = useState<string | null>(null);

  // 드래그로 여러 날 선택 (운영진)
  const [drag, setDrag] = useState<{ a: string; b: string } | null>(null);
  const dragging = useRef(false);

  // ── 이번 화면(6주)의 날짜 ──
  const gridStart = useMemo(() => { const d = new Date(cursor); d.setDate(1 - d.getDay()); return toYmd(d); }, [cursor]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const gridEnd = days[41];
  const monthKey = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/calendar?from=${gridStart}&to=${gridEnd}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "불러오지 못했습니다."); return; }
      setEvents(json.events ?? []); setWarns(json.warnings ?? []); setBirths(json.birthdays ?? []);
      if (json.warningMonths) setWarnMonths(json.warningMonths);
    } catch {
      setError("네트워크 오류입니다.");
    } finally {
      setLoading(false);
    }
  }, [gridStart, gridEnd]);
  useEffect(() => { load(); }, [load]);

  // ── 모든 항목을 하나의 목록으로 ──
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (show.event) for (const e of events) out.push({
      key: `e${e.id}`, kind: "event", start: e.startDate, end: e.endDate, label: e.title,
      time: e.allDay ? null : e.startTime, color: ownerColor(e.createdById, myId), event: e,
    });
    if (show.warn) for (const w of warns) out.push({
      key: `w${w.id}`, kind: "warn", start: w.releaseDate, end: w.releaseDate,
      label: `${w.name} 경고 해제`, color: "warn", warn: w,
    });
    if (show.birth) for (const b of births) out.push({
      key: `b${b.memberId}-${b.date}`, kind: "birth", start: b.date, end: b.date,
      label: `${b.name} 생일`, color: "birth", birth: b,
    });
    // 여러 날 일정 → 종일 → 시간 순 (구글 캘린더와 비슷한 순서)
    const span = (x: Item) => fromYmd(x.end).getTime() - fromYmd(x.start).getTime();
    return out.sort((x, y) =>
      x.start.localeCompare(y.start) || span(y) - span(x) ||
      (x.time ? 1 : 0) - (y.time ? 1 : 0) || (x.time ?? "").localeCompare(y.time ?? "") ||
      x.label.localeCompare(y.label));
  }, [events, warns, births, show, myId]);

  // 등록자 범례 (나 → 파랑, 그 외 등록자별 색)
  const owners = useMemo(() => {
    const m = new Map<string, { name: string; color: string; mine: boolean }>();
    for (const e of events) {
      const k = String(e.createdById ?? "none");
      if (!m.has(k)) m.set(k, { name: e.createdBy || "알 수 없음", color: ownerColor(e.createdById, myId), mine: e.createdById != null && e.createdById === myId });
    }
    return [...m.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
  }, [events, myId]);

  // ── 주(週)마다 줄(lane)을 배정해서 여러 날 일정이 가로로 이어지게 ──
  // laneMap[날짜][줄번호] = 항목
  const { laneMap, countMap } = useMemo(() => {
    const laneMap: Record<string, (Item | undefined)[]> = {};
    const countMap: Record<string, number> = {};
    for (let w = 0; w < 6; w++) {
      const ws = days[w * 7], we = days[w * 7 + 6];
      const lanes: string[][] = []; // lanes[줄] = 이미 찬 날짜들
      for (const it of items) {
        if (it.end < ws || it.start > we) continue;
        const s = it.start < ws ? ws : it.start;
        const e = it.end > we ? we : it.end;
        const span: string[] = [];
        for (let d = s; d <= e; d = addDays(d, 1)) span.push(d);
        for (const d of span) countMap[d] = (countMap[d] ?? 0) + 1;
        let lane = 0;
        while (lanes[lane] && span.some((d) => lanes[lane].includes(d))) lane++;
        (lanes[lane] ||= []).push(...span);
        for (const d of span) (laneMap[d] ||= [])[lane] = it;
      }
    }
    return { laneMap, countMap };
  }, [items, days]);

  // ── 이동 ──
  const move = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); };

  // ── 일정 추가 열기 ──
  function openAdd(start: string, end = start) {
    if (!isAdmin) { setDayList(start); return; }
    setEditor({ mode: "add", draft: { ...emptyDraft(), startDate: start, endDate: end } });
  }

  // 드래그 선택
  function onCellDown(d: string, e: React.MouseEvent) {
    if (!isAdmin || e.button !== 0) return;
    dragging.current = true;
    setDrag({ a: d, b: d });
  }
  function onCellEnter(d: string) { if (dragging.current) setDrag((p) => (p ? { ...p, b: d } : p)); }
  useEffect(() => {
    function up() {
      if (!dragging.current) return;
      dragging.current = false;
      setDrag((p) => {
        if (p) { const [s, e] = p.a <= p.b ? [p.a, p.b] : [p.b, p.a]; openAdd(s, e); }
        return null;
      });
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  const inDrag = (d: string) => !!drag && d >= (drag.a <= drag.b ? drag.a : drag.b) && d <= (drag.a <= drag.b ? drag.b : drag.a);

  // ── 저장/삭제 ──
  async function save(mode: "add" | "edit", dr: Draft): Promise<string | null> {
    const res = await fetch("/api/calendar", {
      method: mode === "add" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dr),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error || "저장하지 못했습니다.";
    setEditor(null);
    await load();
    return null;
  }
  async function remove(id: number) {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    const res = await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || "삭제하지 못했습니다."); return; }
    setDetail(null);
    await load();
  }

  // 이번 달 요약 (사이드)
  const monthItems = items.filter((it) => it.start.startsWith(monthKey) || (it.start < `${monthKey}-01` && it.end >= `${monthKey}-01`));

  return (
    <div className="cal">
      {/* ── 상단 바 ── */}
      <div className="cal-top">
        <div className="cal-nav">
          <button type="button" className="cal-today" onClick={goToday}>오늘</button>
          <button type="button" className="cal-arrow" onClick={() => move(-1)} aria-label="이전 달">‹</button>
          <button type="button" className="cal-arrow" onClick={() => move(1)} aria-label="다음 달">›</button>
          <h2>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</h2>
          {loading && <span className="cal-loading">불러오는 중…</span>}
        </div>
        <div className="cal-filters">
          {([["event", "일정", "blue"], ["warn", "경고 해제", "warn"], ["birth", "생일", "birth"]] as const).map(([k, label, c]) => (
            <label key={k} className={`cal-chip c-${c} ${show[k] ? "on" : ""}`}>
              <input type="checkbox" checked={show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))} />
              <i />{label}
            </label>
          ))}
          {isAdmin && (
            <button type="button" className="cal-add" onClick={() => openAdd(today)}>＋ 일정 추가</button>
          )}
        </div>
      </div>
      {error && <div className="cal-error">{error}</div>}

      <div className="cal-body">
        {/* ── 월간 그리드 ── */}
        <div className="cal-grid" onMouseLeave={() => { /* 드래그 중 밖으로 나가도 유지 */ }}>
          {WEEK.map((w, i) => <div key={w} className={`cal-wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</div>)}
          {days.map((d, i) => {
            const dt = fromYmd(d);
            const out = d.slice(0, 7) !== monthKey;
            const lanes = laneMap[d] ?? [];
            const total = countMap[d] ?? 0;
            const shown = lanes.slice(0, MAX_LANES).filter(Boolean).length;
            const hidden = total - shown;
            const dow = i % 7;
            return (
              <div
                key={d}
                className={`cal-cell ${out ? "out" : ""} ${d === today ? "today" : ""} ${inDrag(d) ? "sel" : ""} ${isAdmin ? "can-add" : ""}`}
                onMouseDown={(e) => onCellDown(d, e)}
                onMouseEnter={() => onCellEnter(d)}
                onClick={() => { if (!isAdmin) setDayList(d); }}
                title={isAdmin ? "클릭해서 일정 추가 (드래그로 여러 날)" : undefined}
              >
                <button
                  type="button"
                  className={`cal-date ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setDayList(d); }}
                >
                  {dt.getDate() === 1 ? `${dt.getMonth() + 1}월 ${dt.getDate()}일` : dt.getDate()}
                </button>
                <div className="cal-lanes">
                  {Array.from({ length: MAX_LANES }, (_, lane) => {
                    const it = lanes[lane];
                    if (!it) return <div key={lane} className="cal-slot" />;
                    const multi = it.start !== it.end;
                    const segStart = d === it.start || dow === 0;
                    const segEnd = d === it.end || dow === 6;
                    return (
                      <button
                        key={lane}
                        type="button"
                        className={`cal-item k-${it.kind} c-${it.color} ${multi || it.kind !== "event" || !it.time ? "bar" : "dot"} ${segStart ? "s" : ""} ${segEnd ? "e" : ""}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setDetail(it); }}
                        title={it.label}
                      >
                        {segStart ? (
                          <>
                            {it.kind === "warn" && <span className="ic">🔓</span>}
                            {it.kind === "birth" && <span className="ic">🎂</span>}
                            {it.time && !multi && <span className="tm">{fmtTime(it.time)}</span>}
                            <span className="tx">{it.label}</span>
                          </>
                        ) : <span className="tx">&nbsp;</span>}
                      </button>
                    );
                  })}
                  {hidden > 0 && (
                    <button type="button" className="cal-more" onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setDayList(d); }}>
                      +{hidden}개
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 이번 달 목록 ── */}
        <aside className="cal-side">
          <h3>{cursor.getMonth() + 1}월 한눈에 보기</h3>
          {monthItems.length === 0 ? <p className="cal-empty">이번 달 일정이 없어요.</p> : (
            <ul className="cal-agenda">
              {monthItems.map((it) => (
                <li key={it.key}>
                  <button type="button" onClick={() => setDetail(it)}>
                    <span className="d">{fmtDay(it.start).replace(/^\d+월 /, "")}</span>
                    <i className={`dotc c-${it.color}`} />
                    <span className="t">{it.kind === "warn" ? "🔓 " : it.kind === "birth" ? "🎂 " : ""}{it.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {owners.length > 0 && (
            <div className="cal-owners">
              <h4>등록자</h4>
              <ul>
                {owners.map((o) => (
                  <li key={o.name + o.color}><i className={`dotc c-${o.color}`} />{o.name}{o.mine && <small> (나)</small>}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="cal-hint">
            🔓 경고 해제일은 경고일로부터 {warnMonths}개월 뒤로 자동 표시돼요.<br />
            🎂 생일은 클랜원 정보의 생년월일로 표시돼요.
            {isAdmin && <><br />날짜를 클릭하거나 드래그해서 일정을 추가하세요.</>}
          </p>
        </aside>
      </div>

      {/* ── 하루 목록 ── */}
      {dayList && (
        <Modal onClose={() => setDayList(null)} title={fmtDay(dayList)}>
          {items.filter((it) => it.start <= dayList && it.end >= dayList).length === 0
            ? <p className="cal-empty">일정이 없어요.</p>
            : (
              <ul className="cal-daylist">
                {items.filter((it) => it.start <= dayList && it.end >= dayList).map((it) => (
                  <li key={it.key}>
                    <button type="button" onClick={() => { setDayList(null); setDetail(it); }}>
                      <i className={`dotc c-${it.color}`} />
                      <span className="tm">{it.kind === "event" && it.time ? fmtTime(it.time) : "종일"}</span>
                      <span className="t">{it.kind === "warn" ? "🔓 " : it.kind === "birth" ? "🎂 " : ""}{it.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {isAdmin && (
            <button type="button" className="cal-btn primary full" onClick={() => { const d = dayList; setDayList(null); openAdd(d); }}>
              ＋ 이 날 일정 추가
            </button>
          )}
        </Modal>
      )}

      {/* ── 항목 상세 ── */}
      {detail && (
        <Modal onClose={() => setDetail(null)} title={
          <span className="cal-dtitle"><i className={`dotc c-${detail.color}`} />{detail.label}</span>
        }>
          <DetailBody it={detail} warnMonths={warnMonths} />
          {isAdmin && detail.event && !isMine(detail.event) && (
            <p className="cal-owner-note">{detail.event.createdBy || "다른 운영진"}님이 등록한 일정이라 수정·삭제할 수 없어요.</p>
          )}
          {isAdmin && isMine(detail.event) && (
            <div className="cal-actions">
              <button type="button" className="cal-btn danger" onClick={() => remove(detail.event!.id)}>삭제</button>
              <button type="button" className="cal-btn primary" onClick={() => {
                const e = detail.event!;
                setDetail(null);
                setEditor({ mode: "edit", draft: {
                  id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate, allDay: e.allDay,
                  startTime: e.startTime ?? "19:00", endTime: e.endTime ?? "", color: e.color, memo: e.memo ?? "",
                } });
              }}>수정</button>
            </div>
          )}
        </Modal>
      )}

      {/* ── 추가/수정 ── */}
      {editor && (
        <EventEditor
          mode={editor.mode}
          initial={editor.draft}
          onClose={() => setEditor(null)}
          onSave={(dr) => save(editor.mode, dr)}
        />
      )}
    </div>
  );
}

// ------------------------------ 상세 내용 ------------------------------
function DetailBody({ it, warnMonths }: { it: Item; warnMonths: number }) {
  if (it.kind === "warn" && it.warn) {
    return (
      <dl className="cal-dl">
        <dt>해제일</dt><dd>{fmtDay(it.warn.releaseDate)}</dd>
        <dt>경고일</dt><dd>{fmtDay(it.warn.warnedAt)} <small>(+{warnMonths}개월)</small></dd>
        <dt>경고 유형</dt><dd>{it.warn.type}</dd>
      </dl>
    );
  }
  if (it.kind === "birth" && it.birth) {
    return <dl className="cal-dl"><dt>날짜</dt><dd>{fmtDay(it.birth.date)}</dd></dl>;
  }
  const e = it.event!;
  const when = e.startDate === e.endDate ? fmtDay(e.startDate) : `${fmtDay(e.startDate)} ~ ${fmtDay(e.endDate)}`;
  const time = e.allDay ? "종일" : `${fmtTime(e.startTime)}${e.endTime ? ` ~ ${fmtTime(e.endTime)}` : ""}`;
  return (
    <dl className="cal-dl">
      <dt>날짜</dt><dd>{when}</dd>
      <dt>시간</dt><dd>{time}</dd>
      {e.memo && (<><dt>메모</dt><dd className="memo">{e.memo}</dd></>)}
      {e.createdBy && (<><dt>작성</dt><dd>{e.createdBy}</dd></>)}
    </dl>
  );
}

// ------------------------------ 추가/수정 창 ------------------------------
interface Draft {
  id?: number; title: string; startDate: string; endDate: string; allDay: boolean;
  startTime: string; endTime: string; color: string; memo: string;
}
const emptyDraft = (): Draft => ({ title: "", startDate: "", endDate: "", allDay: true, startTime: "19:00", endTime: "", color: "blue", memo: "" });

function EventEditor({ mode, initial, onClose, onSave }: {
  mode: "add" | "edit"; initial: Draft; onClose: () => void; onSave: (d: Draft) => Promise<string | null>;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) { setErr("제목을 입력하세요."); return; }
    setBusy(true); setErr("");
    const msg = await onSave({ ...d, endDate: d.endDate < d.startDate ? d.startDate : d.endDate });
    setBusy(false);
    if (msg) setErr(msg);
  }

  return (
    <Modal onClose={onClose} title={mode === "add" ? "일정 추가" : "일정 수정"}>
      <form className="cal-form" onSubmit={submit}>
        <input className="cal-title-in" autoFocus placeholder="제목 추가" value={d.title} maxLength={100}
          onChange={(e) => set("title", e.target.value)} />
        <div className="cal-row">
          <input type="date" value={d.startDate} onChange={(e) => {
            const v = e.target.value; setD((p) => ({ ...p, startDate: v, endDate: p.endDate < v ? v : p.endDate }));
          }} />
          <span>~</span>
          <input type="date" value={d.endDate} min={d.startDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
        <div className="cal-row">
          <label className="cal-check"><input type="checkbox" checked={d.allDay} onChange={(e) => set("allDay", e.target.checked)} /> 종일</label>
          {!d.allDay && (
            <>
              <input type="time" value={d.startTime} onChange={(e) => set("startTime", e.target.value)} />
              <span>~</span>
              <input type="time" value={d.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </>
          )}
        </div>
        <textarea placeholder="메모 (선택)" rows={3} maxLength={500} value={d.memo} onChange={(e) => set("memo", e.target.value)} />
        {err && <div className="cal-error">{err}</div>}
        <div className="cal-actions">
          <button type="button" className="cal-btn" onClick={onClose}>취소</button>
          <button type="submit" className="cal-btn primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------ 공통 모달 ------------------------------
function Modal({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="cal-backdrop" onMouseDown={onClose}>
      <div className="cal-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cal-mhead">
          <h3>{title}</h3>
          <button type="button" className="cal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
