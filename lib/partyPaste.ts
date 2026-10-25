// =============================================================
// 파티 모집글(카톡 공지) 붙여넣기 파서
//
// 예)
//   🍸자랭🌈
//   3판시 10p
//   시간:1900
//   -----------------------------
//   1.쇼미럽 에디
//   2.
//   ⏰️대기
//
// - 제목 줄(칼바람/자랭/솔랭/일반)로 모드를 정하고, 글 여러 개를 한 번에 붙여넣으면 글마다 나눈다.
// - "시간:" 줄에서 시작 시간을 읽는다 (1900, 19:00, 7시반, 오후7시 …). 못 읽으면 비워 둔다.
// - "-----" 아래 번호 줄을 참가자로 읽고, "대기" 아래는 무시한다.
// - 이름 뒤 라인/티어/코멘트("에디", "jg", "자랭차면 ㅌ")는 버리고,
//   괄호 안 Riot ID("히치(피융피융#111)")가 있으면 그걸로 본계정을 바로 찾는다.
// =============================================================

import { nameSimilarity, normName, NAME_MATCH_MIN } from "@/lib/nameMatch";

export type PartyMode = "aram" | "normal" | "flex" | "solo";

export interface PastedEntry {
  raw: string;            // 원문 줄
  candidates: string[];   // 이름 후보 (첫 단어, 첫 두 단어, 첫 세 단어)
  riotName: string | null; // 괄호 안 Riot ID의 게임 이름
}

export interface PastedParty {
  mode: PartyMode | null;
  title: string;
  startTime: string | null; // "HH:MM"
  timeRaw: string | null;   // "시간:" 줄 원문 (못 읽었을 때 안내용)
  entries: PastedEntry[];
}

export interface PartyCandidate { gameName: string; nickname: string; }

export interface MatchedEntry {
  raw: string;
  written: string;                    // 화면에 보여줄 적힌 이름
  matched: PartyCandidate | null;
  exact: boolean;                     // 이름이 정확히 같은지 (아니면 "비슷한 이름" 안내)
}

const NUM_PREFIX = /^\s*\d+\s*[.)\]:\-]?\s*/;

function detectMode(line: string): PartyMode | null {
  const s = line.replace(/\s+/g, "");
  if (/칼바람|증칼|칼/.test(s)) return "aram";
  if (/자랭|자유랭|자유랭크|플렉스|flex/i.test(s)) return "flex";
  if (/솔랭|솔로랭|솔로|듀오/.test(s)) return "solo";
  if (/일반/.test(s)) return "normal";
  return null;
}

// 제목 줄: 번호/콜론이 없고 짧으며 모드 키워드가 들어간 줄 ("🍸칼바람🌈")
function headerMode(line: string): PartyMode | null {
  if (NUM_PREFIX.test(line) || /[:：]/.test(line)) return null;
  const cleaned = line.replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, "").trim();
  if (!cleaned || cleaned.length > 15) return null;
  return detectMode(cleaned);
}

// "1900" / "19:00" / "7시반" / "오후 7시 30분" → "HH:MM". 못 읽으면 null
export function parseStartTime(raw: string): string | null {
  const s = raw.replace(/\s+/g, "");
  const pm = /오후|저녁|밤|pm/i.test(s);
  let h: number | null = null, m = 0;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/(\d{1,2})[:：.](\d{2})/))) { h = +mt[1]; m = +mt[2]; }
  else if ((mt = s.match(/(\d{1,2})시(반|(\d{1,2})분?)?/))) { h = +mt[1]; m = mt[2] === "반" ? 30 : mt[3] ? +mt[3] : 0; }
  else if ((mt = s.match(/(?:^|\D)(\d{3,4})(?!\d)/))) {
    const d = mt[1];
    h = d.length === 3 ? +d.slice(0, 1) : +d.slice(0, 2);
    m = +d.slice(-2);
  }
  if (h === null) return null;
  if (pm && h < 12) h += 12;
  if (h > 23 || m > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}`;
}

function parseEntry(rawLine: string): PastedEntry | null {
  const raw = rawLine.trim();
  const body = raw.replace(NUM_PREFIX, "").trim();
  if (!body) return null;
  // 괄호 안이든 밖이든 "이름#태그"가 있으면 Riot ID로 본다
  const riot = body.match(/([^\s()（）\[\]#]+)\s*#\s*[0-9A-Za-z가-힣]{2,5}/);
  const riotName = riot ? riot[1].trim() : null;
  const s = body.replace(/[(\[（][^)\]）]*[)\]）]/g, " ");      // 괄호 내용 제거
  const tokens = s.split(/[\s,/·|+]+/).map((t) => t.replace(/[.~!]+$/, "")).filter(Boolean);
  if (tokens.length === 0 && !riotName) return null;
  const candidates: string[] = [];
  for (let k = 1; k <= Math.min(3, tokens.length); k++) candidates.push(tokens.slice(0, k).join(" "));
  return { raw, candidates, riotName };
}

export function parsePartyPosts(text: string): PastedParty[] {
  const lines = text.split(/\r?\n/);
  const parties: PastedParty[] = [];
  let cur: (PastedParty & { section: "head" | "list" | "wait"; headNumbered: PastedEntry[] }) | null = null;

  const flush = () => {
    if (!cur) return;
    const entries = cur.entries.length > 0 ? cur.entries : cur.headNumbered;
    parties.push({ mode: cur.mode, title: cur.title, startTime: cur.startTime, timeRaw: cur.timeRaw, entries });
    cur = null;
  };
  const start = (mode: PartyMode | null, title: string) => {
    flush();
    cur = { mode, title, startTime: null, timeRaw: null, entries: [], section: "head", headNumbered: [] };
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const hm = headerMode(line);
    if (hm) { start(hm, line.replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, "").trim()); continue; }
    if (!cur) start(null, "");
    const c = cur!;

    const tm = line.match(/^시간\s*[:：]?\s*(.*)$/);
    if (tm) { c.timeRaw = tm[1].trim(); c.startTime = parseStartTime(tm[1]); continue; }
    if (/^[-=_─━]{3,}/.test(line)) { c.section = "list"; continue; }
    if (!NUM_PREFIX.test(line) && /대기/.test(line)) { c.section = "wait"; continue; }
    if (c.section === "wait") continue;
    if (!NUM_PREFIX.test(line)) continue;            // 번호 없는 줄(3판시 5p, 티어:… 등)은 무시

    const e = parseEntry(line);
    if (!e) continue;
    if (c.section === "list") c.entries.push(e);
    else c.headNumbered.push(e);
  }
  flush();
  // 참가자도 시간도 모드도 없는 빈 덩어리는 버린다
  return parties.filter((p) => p.mode || p.startTime || p.entries.length > 0);
}

// 적힌 이름들을 클랜원(본계정)에 한 번에 매칭한다.
// 유사도가 높은 쌍부터 배정해서 한 사람이 엉뚱한 줄에 먼저 뺏기지 않게 한다.
export function matchPartyEntries(entries: PastedEntry[], members: PartyCandidate[]): MatchedEntry[] {
  const best = (e: PastedEntry, m: PartyCandidate): number => {
    if (e.riotName && normName(e.riotName) === normName(m.gameName)) return 1.01; // Riot ID 정확히 일치 → 최우선
    let s = 0;
    for (const c of e.candidates) {
      s = Math.max(s, nameSimilarity(c, m.nickname), nameSimilarity(c, m.gameName));
    }
    if (e.riotName) s = Math.max(s, nameSimilarity(e.riotName, m.gameName));
    return s;
  };

  const pairs: { i: number; j: number; sim: number }[] = [];
  entries.forEach((e, i) => {
    members.forEach((m, j) => {
      const sim = best(e, m);
      if (sim >= NAME_MATCH_MIN) pairs.push({ i, j, sim });
    });
  });
  pairs.sort((a, b) => b.sim - a.sim);

  const result: { m: PartyCandidate | null; sim: number }[] = entries.map(() => ({ m: null, sim: 0 }));
  const used = new Set<number>();
  for (const p of pairs) {
    if (result[p.i].m || used.has(p.j)) continue;
    result[p.i] = { m: members[p.j], sim: p.sim };
    used.add(p.j);
  }

  return entries.map((e, i) => ({
    raw: e.raw,
    written: e.candidates[0] ?? e.riotName ?? e.raw,
    matched: result[i].m,
    exact: result[i].sim >= 1,
  }));
}
