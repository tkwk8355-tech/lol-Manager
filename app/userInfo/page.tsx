"use client"; // 클랜원 목록 페이지(브라우저에서 동작).

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../components/AuthProvider";

interface Account {
  id: number;
  gameName: string;
  tagLine: string;
  isMain: boolean;
  hasPuuid: boolean;
  gamesTotal: number; // 추적 시작 후 누적 집계 판수
  games2w: number; // 최근 2주 판수
  lastSyncedAt: string | null;
}
interface TierInfo {
  tier: string;
  rank: string;
  lp: number;
}
interface Member {
  id: number;
  nickname: string;
  memo: string | null;
  birthYear: number | null;
  mainLine: string | null;
  subLine: string | null;
  accounts: Account[];
  gamesTotal: number;
  games2w: number; // 계정 합산 최근 2주 판수
  tier: TierInfo | null; // 대표 티어(본계정 우선)
}

// 티어 한국어 라벨. 마스터+ 는 단계 없음, 마스터는 LP 표시.
const TIER_KO: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};
const NO_DIVISION = ["MASTER", "GRANDMASTER", "CHALLENGER"];
function tierLabel(t: TierInfo): string {
  const ko = TIER_KO[t.tier] ?? t.tier;
  if (NO_DIVISION.includes(t.tier)) {
    return t.tier === "MASTER" ? `${ko} ${t.lp}LP` : ko;
  }
  const div = { I: "1", II: "2", III: "3", IV: "4" }[t.rank] ?? t.rank;
  return `${ko} ${div}`;
}
// 기존 전적 검색 페이지에서 쓰는 것과 같은 티어 엠블럼 이미지(public/tiers)를 재사용한다.
function tierEmblemUrl(tier: string) { return `/tiers/emblem-${tier.toLowerCase()}.png`; }

// 동기화 시각을 "MM.DD HH:MM"으로(날짜 포함). 없으면 "미동기화".
function syncedTime(iso: string | null) {
  if (!iso) return "미동기화";
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}.${da} ${hh}:${mm}`;
}

const PAGE_SIZES = [10, 20]; // 페이지당 클랜원 수 선택지
const LINE_KEYS = ["TOP", "JG", "MID", "ADC", "SUP"] as const; // ALL은 클랜원 라인 개념에 없어 제외

interface LinkedUser {
  id: number;
  username: string;
  nickname: string;
  role: string;
  memberId: number | null;
  memberNickname: string | null;
  createdAt?: string;
}

export default function UserInfoPage() {
  const { user, isAdmin, loading: authLoading, openAuthModal } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [cooldown, setCooldown] = useState(0); // 동기화 후 남은 쿨타임(초)
  const [syncingMember, setSyncingMember] = useState<number | null>(null); // 개별 동기화 중인 멤버 ID

  // 로그인 계정 ↔ 클랜원 연동 (운영진만 사용)
  const [users, setUsers] = useState<LinkedUser[]>([]);
  const [linkMsg, setLinkMsg] = useState("");

  async function loadUsers() {
    try {
      const res = await fetch("/api/userinfo/link");
      const json = await res.json();
      if (res.ok) setUsers(json.users);
    } catch { /* 무시 */ }
  }

  // 비밀번호를 잊어버린 클랜원을 위해, 운영진이 해당 로그인 계정 비밀번호를 1234로 초기화한다.
  async function resetPassword(userId: number, username: string) {
    if (!confirm(`"${username}" 계정의 비밀번호를 1234로 초기화할까요?`)) return;
    setLinkMsg("");
    try {
      const res = await fetch("/api/userinfo/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) { setLinkMsg(json.error || "초기화 실패"); return; }
      alert(`"${username}" 계정의 비밀번호가 1234로 초기화되었습니다.`);
    } catch { setLinkMsg("네트워크 오류"); }
  }

  // memberId에 연동할 로그인 계정을 바꾼다. userId가 null이면 연동 해제.
  async function setLinkedUser(memberId: number, userId: number | null) {
    setLinkMsg("");
    try {
      // 기존에 이 클랜원에 연동된 계정이 있고, 이번에 다른 계정으로 바꾸는 거라면 먼저 해제.
      const prevUser = users.find((u) => u.memberId === memberId);
      if (prevUser && prevUser.id !== userId) {
        await fetch("/api/userinfo/link", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: prevUser.id, memberId: null }),
        });
      }
      if (userId) {
        const res = await fetch("/api/userinfo/link", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, memberId }),
        });
        const json = await res.json();
        if (!res.ok) { setLinkMsg(json.error || "연동 실패"); return; }
      }
      loadUsers();
    } catch { setLinkMsg("네트워크 오류"); }
  }

  // 로그인 계정 삭제 (운영진만). 클랜원 자체는 삭제하지 않고 로그인 계정만 없어진다.
  async function deleteUser(userId: number, username: string) {
    if (!confirm(`"${username}" 계정을 삭제할까요? 이 계정으로는 더 이상 로그인할 수 없습니다.`)) return;
    setLinkMsg("");
    try {
      const res = await fetch(`/api/userinfo/link?id=${userId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setLinkMsg(json.error || "삭제 실패"); return; }
      loadUsers();
    } catch { setLinkMsg("네트워크 오류"); }
  }

  // 검색
  const [searchQuery, setSearchQuery] = useState("");

  // 주라인 필터 (일반 클랜원 조회 화면에서만 사용). ALL은 클랜원에게 없는 라인이라 제외.
  const [lineFilter, setLineFilter] = useState("");

  // 할당량 미달 필터
  const [showInactive, setShowInactive] = useState(false);

  // 페이징
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0); // 0-기준

  // 새 클랜원 입력
  const [newName, setNewName] = useState("");
  const [newBirthYear, setNewBirthYear] = useState("");
  const [newMainLine, setNewMainLine] = useState("");
  const [newSubLine, setNewSubLine] = useState("");
  
  // 엑셀 업로드
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  // 계정 추가 입력(멤버별). { [memberId]: { name, tag, main } }
  const [accForm, setAccForm] = useState<
    Record<number, { name: string; tag: string; main: boolean }>
  >({});

  // 클랜원 수정 상태.
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ 
    name: string; 
    birthYear: string;
    mainLine: string;
    subLine: string;
  }>({
    name: "",
    birthYear: "",
    mainLine: "",
    subLine: "",
  });

  // 쿨타임 1초씩 감소
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 페이지 범위 계산
  // 검색 필터링 먼저 적용
  const filteredMembers = members.filter((m) => {
    // 할당량 미달 필터 (한 달 동안 0판)
    if (showInactive && m.games2w > 0) return false;
    // 주라인 필터 (일반 클랜원 조회 화면)
    if (lineFilter && m.mainLine !== lineFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    // 클랜원 이름 또는 계정 닉네임 또는 연생에서 검색
    if (m.nickname.toLowerCase().includes(q)) return true;
    if (m.birthYear && String(m.birthYear).includes(q)) return true;
    return m.accounts.some(
      (a) =>
        a.gameName.toLowerCase().includes(q) ||
        a.tagLine.toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedMembers = filteredMembers.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  function startEdit(m: Member) {
    setEditing(m.id);
    setEditForm({ 
      name: m.nickname,
      birthYear: m.birthYear ? String(m.birthYear) : "",
      mainLine: m.mainLine || "",
      subLine: m.subLine || "",
    });
  }

  async function saveEdit(memberId: number) {
    if (!editForm.name.trim()) {
      alert("이름을 입력하세요.");
      return;
    }
    try {
      const res = await fetch("/api/userinfo/member", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: memberId,
          nickname: editForm.name,
          birthYear: editForm.birthYear ? Number(editForm.birthYear) : null,
          mainLine: editForm.mainLine || null,
          subLine: editForm.subLine || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "수정 실패");
        return;
      }
      setEditing(null);
      loadMembers();
    } catch {
      alert("네트워크 오류");
    }
  }

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/userinfo");
      const json = await res.json();
      if (!res.ok) setError(json.error || "불러오기 실패");
      else {
        // 닉네임 가나다순 정렬
        const sorted = json.members.sort((a: Member, b: Member) => 
          a.nickname.localeCompare(b.nickname, 'ko')
        );
        setMembers(sorted);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  // 클랜원 명단은 클랜 내부 정보라 로그인해야 볼 수 있다. 로그인 전에는 조회하지 않는다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); setMembers([]); return; }
    loadMembers();
  }, [user, authLoading]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/userinfo/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          nickname: newName,
          birthYear: newBirthYear ? Number(newBirthYear) : null,
          mainLine: newMainLine || null,
          subLine: newSubLine || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "등록 실패");
        return;
      }
      setNewName("");
      setNewBirthYear("");
      setNewMainLine("");
      setNewSubLine("");
      loadMembers();
    } catch {
      alert("네트워크 오류");
    }
  }

  async function addAccount(memberId: number) {
    const f = accForm[memberId];
    if (!f || !f.name.trim() || !f.tag.trim()) {
      alert("소환사명과 태그를 입력하세요.");
      return;
    }
    try {
      const res = await fetch("/api/userinfo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          gameName: f.name,
          tagLine: f.tag,
          isMain: f.main,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "계정 추가 실패");
        return;
      }
      setAccForm((p) => ({ ...p, [memberId]: { name: "", tag: "", main: false } }));
      loadMembers();
    } catch {
      alert("네트워크 오류");
    }
  }

  async function remove(kind: "member" | "account", id: number) {
    if (!confirm("삭제할까요?")) return;
    console.log("[remove] 삭제 요청 시작:", { kind, id });
    try {
      const res = await fetch("/api/userinfo/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      console.log("[remove] 응답 상태:", res.status);
      if (!res.ok) {
        const json = await res.json();
        console.error("[remove] 삭제 실패:", json);
        alert(json.error || "삭제 실패");
        return;
      }
      console.log("[remove] 삭제 성공, 목록 새로고침");
      loadMembers();
    } catch (err) {
      console.error("[remove] 네트워크 오류:", err);
      alert("네트워크 오류");
    }
  }

  // 동기화: 현재 페이지에 보이는 계정들만 갱신한다.
  async function sync() {
    const accountIds = pagedMembers.flatMap((m) =>
      m.accounts.map((a) => a.id)
    );
    if (accountIds.length === 0) {
      setSyncMsg("이 페이지에 등록된 계정이 없습니다.");
      return;
    }
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/userinfo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncMsg(json.error || "동기화 실패");
      } else {
        // 실패한 계정 목록(있으면 "이름#태그: 사유" 형태). 없으면 0건.
        const fails: string[] = json.errors ?? [];
        let msg = `동기화 완료 · 실패 ${fails.length}건`;
        if (fails.length) msg += ` (${fails.join(", ")})`; // 실패 시 어떤 계정이 실패했는지 표시
        setSyncMsg(msg);
        loadMembers();
        setCooldown(120); // 2분 쿨타임 동안 버튼 비활성화
      }
    } catch {
      setSyncMsg("네트워크 오류");
    } finally {
      setSyncing(false);
    }
  }

  function setF(
    memberId: number,
    patch: Partial<{ name: string; tag: string; main: boolean }>
  ) {
    setAccForm((p) => {
      const base = p[memberId] ?? { name: "", tag: "", main: false };
      return { ...p, [memberId]: { ...base, ...patch } };
    });
  }

  const [tab, setTab] = useState<"members" | "accounts" | "party-history">("accounts");

  // 파티 내역 (운영진)
  const [historyMonth, setHistoryMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;
  });
  const [historyData, setHistoryData] = useState<{
    parties: { id:number; mode:string; note:string|null; status:string; createdAt:string; endedAt:string|null; hostNickname:string; participantCount:number }[];
    memberStats: { nickname:string; partyCount:number }[];
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory(month: string) {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/party/history?month=${month}`);
      const json = await res.json();
      if (res.ok) setHistoryData(json);
    } catch {}
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    if (isAdmin && tab === "party-history") loadHistory(historyMonth);
  }, [isAdmin, tab, historyMonth]);

  const MODE_KO: Record<string,string> = { aram:"칼바람", normal:"협곡", flex:"자유", solo:"솔랭" };
  const syncDisabled = syncing || cooldown > 0;
  const syncLabel = syncing
    ? "동기화 중..."
    : cooldown > 0
    ? `대기 ${cooldown}초`
    : "클랜원 판수 동기화";

  // 개별 클랜원 동기화
  async function syncOne(memberId: number) {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const accountIds = member.accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      alert("등록된 계정이 없습니다.");
      return;
    }

    setSyncingMember(memberId);
    try {
      const res = await fetch("/api/userinfo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "동기화 실패");
      } else {
        const fails: string[] = json.errors ?? [];
        if (fails.length > 0) {
          alert(`동기화 완료 \n실패: ${fails.join(", ")}`);
        }
        loadMembers();
      }
    } catch {
      alert("네트워크 오류");
    } finally {
      setSyncingMember(null);
    }
  }

  // 엑셀 양식 다운로드
  function downloadTemplate() {
    const template = [
      ["이름", "연생", "주라인", "부라인", "계정1_이름", "계정1_태그", "계정1_본계정", "계정2_이름", "계정2_태그", "계정2_본계정"],
      ["홍길동", "1995", "TOP", "JG", "HongGD", "KR1", "O", "HongSub", "KR2", ""],
      ["김철수", "1998", "SUP", "ADC", "KimCS", "1234", "O", "", "", ""],
      ["박영희", "2000", "MID", "", "ParkYH", "ABCD", "O", "ParkAlt", "5678", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "클랜원");
    XLSX.writeFile(wb, "클랜원_업로드_양식.xlsx");
  }

  // 엑셀 파일 업로드 핸들러
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMsg("");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // 첫 행은 헤더로 스킵, 데이터 파싱
      const members: Array<{
        nickname: string;
        birthYear?: number;
        mainLine?: string;
        subLine?: string;
        accounts: Array<{ gameName: string; tagLine: string; isMain: boolean }>;
      }> = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const nickname = String(row[0] || "").trim();
        if (!nickname) continue;

        const birthYear = row[1] ? Number(row[1]) : undefined;
        const mainLine = String(row[2] || "").trim().toUpperCase() || undefined;
        const subLine = String(row[3] || "").trim().toUpperCase() || undefined;
        const accounts: Array<{ gameName: string; tagLine: string; isMain: boolean }> = [];

        // E열부터 3개씩 묶어서 계정 정보로 파싱 (E=이름, F=태그, G=본계정)
        for (let j = 4; j < row.length; j += 3) {
          const gameName = String(row[j] || "").trim();
          const tagLine = String(row[j + 1] || "").trim();
          const isMainStr = String(row[j + 2] || "").trim().toUpperCase();
          
          if (gameName && tagLine) {
            accounts.push({
              gameName,
              tagLine,
              isMain: isMainStr === "O" || isMainStr === "본계정" || isMainStr === "TRUE",
            });
          }
        }

        members.push({ nickname, birthYear, mainLine, subLine, accounts });
      }

      if (members.length === 0) {
        setUploadMsg("파일에 유효한 데이터가 없습니다.");
        return;
      }

      // 서버로 전송
      const res = await fetch("/api/userinfo/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members }),
      });

      const json = await res.json();
      if (!res.ok) {
        setUploadMsg(json.error || "업로드 실패");
      } else {
        let msg = `완료: 클랜원 ${json.addedMembers}명, 계정 ${json.addedAccounts}개 추가`;
        if (json.errors && json.errors.length > 0) {
          msg += ` · 오류 ${json.errors.length}건: ${json.errors.slice(0, 3).join(", ")}`;
        }
        setUploadMsg(msg);
        loadMembers();
      }
    } catch (err: any) {
      setUploadMsg(`오류: ${err.message}`);
    } finally {
      setUploading(false);
      // input 초기화 (같은 파일 재선택 가능하게)
      e.target.value = "";
    }
  }

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="userinfo">
        <div className="party-login-notice">
          클랜원 명단을 보려면 로그인이 필요합니다.
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
        </div>
      </div>
    );
  }

  return (
    <div className="userinfo">
      <div className="ui-head">
        <h2>{isAdmin ? "클랜원 관리" : "클랜원 조회"}</h2>
        {isAdmin && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div className="scrim-tabs" style={{ margin: 0, borderBottom: "none" }}>
              <button className={tab === "accounts" ? "on" : ""} onClick={() => setTab("accounts")}>로그인 계정</button>
              <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>클랜원</button>
              <button className={tab === "party-history" ? "on" : ""} onClick={() => setTab("party-history")}>파티 내역</button>
            </div>
            {tab === "members" && (
              <>
                <button className={`filter-btn ${showInactive ? "on" : ""}`} onClick={() => { setShowInactive(!showInactive); setPage(0); }}>
                  {showInactive ? "최근 한 달 내 게임 없음" : "전체 보기"}
                </button>
                <button className="sync-btn" onClick={sync} disabled={syncDisabled}>{syncLabel}</button>
              </>
            )}
          </div>
        )}
      </div>
      {syncMsg && <div className="sync-msg">{syncMsg}</div>}
      {linkMsg && <div className="error">{linkMsg}</div>}
      {error && <div className="error">{error}</div>}

      {/* 검색 (클랜원/파티 내역 탭에서만 의미 있으므로 로그인 계정 탭에서는 숨긴다) */}
      {tab !== "accounts" && (
      <div className="search-box">
        <input
          type="text"
          placeholder="클랜원 이름 또는 계정 닉네임 검색..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0); // 검색 시 첫 페이지로
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // 엔터 시 검색 (이미 onChange에서 실시간 필터링되므로 포커스 해제만)
              e.currentTarget.blur();
            }
          }}
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => setSearchQuery("")}>
            ✕
          </button>
        )}
        <button className="search-btn" onClick={() => {}}>
          🔍
        </button>
        {isAdmin && (
          <div className="search-actions">
            <button className="excel-btn-small" onClick={downloadTemplate}>
              ⬇ 양식
            </button>
            <label htmlFor="excel-file" className="excel-btn-small">
              📄 업로드
            </label>
            <input
              type="file"
              id="excel-file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
          </div>
        )}
      </div>
      )}
      {tab !== "accounts" && uploading && <div className="sync-msg">엑셀 업로드 중...</div>}
      {tab !== "accounts" && uploadMsg && <div className="sync-msg">{uploadMsg}</div>}

      {/* 로그인 계정 탭 (운영진) — 실제로 만들어진 로그인 계정, 연동된 클랜원, 역할을 확인/삭제할 수 있다 */}
      {isAdmin && tab === "accounts" && (
        <div className="home-panel">
          <div className="home-panel-head"><h3>로그인 계정 ({users.length}개)</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>아이디</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>이름</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>역할</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>연동된 클랜원</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px", fontWeight: 700 }}>{u.username}</td>
                  <td style={{ padding: "8px" }}>{u.nickname}</td>
                  <td style={{ padding: "8px" }}>
                    <span className={`auth-role-badge ${u.role}`}>{u.role === "admin" ? "운영진" : "클랜원"}</span>
                  </td>
                  <td style={{ padding: "8px" }}>
                    {u.memberNickname ?? <span style={{ color: "var(--muted)" }}>연동 안 됨</span>}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="reset-pw-btn" onClick={() => resetPassword(u.id, u.username)}>
                      비밀번호 초기화
                    </button>
                    {" "}
                    <button className="del-btn small" onClick={() => deleteUser(u.id, u.username)}>
                      계정 삭제
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "12px 8px", color: "var(--muted)" }}>생성된 로그인 계정이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 파티 내역 탭 (운영진) */}
      {isAdmin && tab === "party-history" && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <input
              type="month"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--text)", fontSize:14 }}
            />
          </div>
          {historyLoading && <p className="party-empty">불러오는 중...</p>}
          {!historyLoading && historyData && (
            <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:16 }}>
              {/* 클랜원별 참여 횟수 */}
              <div className="home-panel">
                <div className="home-panel-head"><h3>클랜원별 파티 참여횟수</h3></div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ color:"var(--muted)", borderBottom:"1px solid var(--border)" }}>
                      <th style={{ textAlign:"left", padding:"6px 8px" }}>닉네임</th>
                      <th style={{ textAlign:"right", padding:"6px 8px" }}>참여횟수</th>
                      <th style={{ textAlign:"right", padding:"6px 8px" }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.memberStats.map((s) => (
                      <tr key={s.nickname} style={{ borderBottom:"1px solid var(--border)" }}>
                        <td style={{ padding:"7px 8px", fontWeight:700 }}>{s.nickname}</td>
                        <td style={{ padding:"7px 8px", textAlign:"right", color: s.partyCount >= 3 ? "var(--win-text)" : "var(--loss-text)", fontWeight:800 }}>{s.partyCount}판</td>
                        <td style={{ padding:"7px 8px", textAlign:"right" }}>
                          {s.partyCount >= 3
                            ? <span style={{ color:"var(--win-text)", fontSize:11 }}>정상</span>
                            : <span style={{ background:"var(--loss-bg)", color:"var(--loss-text)", fontSize:11, fontWeight:800, padding:"2px 7px", borderRadius:5 }}>추방대상</span>}
                        </td>
                      </tr>
                    ))}
                    {historyData.memberStats.length === 0 && (
                      <tr><td colSpan={3} style={{ padding:"12px 8px", color:"var(--muted)" }}>파티 참여 내역이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* 파티 목록 */}
              <div className="home-panel">
                <div className="home-panel-head"><h3>파티 목록 ({historyData.parties.length}건)</h3></div>
                <ul className="recent-party-list">
                  {historyData.parties.map((p) => (
                    <li className="recent-party-row" key={p.id}>
                      <span className={`party-mode-badge mode-${p.mode}`}>{MODE_KO[p.mode] ?? p.mode}</span>
                      {p.note && <span className="rp-host" style={{ flex:1, maxWidth:"none" }}>{p.note}</span>}
                      <span className="rp-count" style={{ marginLeft:"auto" }}>{p.participantCount}명</span>
                      {p.status === "ended"
                        ? <span className="rp-full">종료</span>
                        : <span style={{ fontSize:11, color:"var(--win-text)", fontWeight:800 }}>진행중</span>}
                    </li>
                  ))}
                  {historyData.parties.length === 0 && <p className="empty">이달 파티가 없습니다.</p>}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 클랜원 목록 탭 */}
      {(!isAdmin || tab === "members") && (<>
      {isAdmin && !loading && members.length > 0 && (
        <div className="line-filter-bar" style={{ marginBottom: 18 }}>
          <button
            className={`line-filter-btn ${lineFilter === "" ? "on" : ""}`}
            onClick={() => { setLineFilter(""); setPage(0); }}
          >
            전체 <em>{members.length}</em>
          </button>
          {LINE_KEYS.map((lk) => (
            <button
              key={lk}
              className={`line-filter-btn ${lineFilter === lk ? "on" : ""}`}
              onClick={() => { setLineFilter(lk); setPage(0); }}
            >
              {lk} <em>{members.filter((m) => m.mainLine === lk).length}</em>
            </button>
          ))}
        </div>
      )}

      {/* 클랜원 추가 (운영진만) */}
      {isAdmin && (
        <form className="add-member" onSubmit={addMember}>
          <input
            placeholder="클랜원 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit">클랜원 추가</button>
        </form>
      )}

      {/* 페이징 컨트롤 */}
      {members.length > 0 && (
        <div className="pager">
          <div className="page-size">
            페이지당
            {PAGE_SIZES.map((s) => (
              <button
                key={s}
                className={pageSize === s ? "on" : ""}
                onClick={() => {
                  setPageSize(s);
                  setPage(0);
                }}
              >
                {s}명
              </button>
            ))}
          </div>
          <div className="page-nav">
            <button
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              이전
            </button>
            <span>
              {safePage + 1} / {totalPages}{showInactive ? ` (한 달 내 게임 없음 ${filteredMembers.length}명 / 전체 ${members.length}명)` : lineFilter ? ` (${lineFilter} ${filteredMembers.length}명 / 전체 ${members.length}명)` : searchQuery ? ` (검색 ${filteredMembers.length}명 / 전체 ${members.length}명)` : ` (전체 ${members.length}명)`}
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              다음
            </button>
          </div>
        </div>
      )}

      {loading && <p>불러오는 중...</p>}
      {!loading && filteredMembers.length === 0 && (showInactive || searchQuery) && (
        <p>{showInactive ? '최근 한 달 내 게임이 없는 클랜원이 없습니다.' : '검색 결과가 없습니다.'}</p>
      )}
      {!loading && members.length === 0 && !searchQuery && !showInactive && (
        <p>등록된 클랜원이 없습니다.</p>
      )}

      {!isAdmin ? (
        // 일반 클랜원 화면: 티어 이미지 · 이름 · 본계정 정보 · 주라인만 간단히 보여준다.
        <>
          {/* 주라인 필터 + 현황(각 라인별 인원수). ALL(라인 무관)은 클랜원에게는 없는 개념이라 제외한다. */}
          <div className="line-filter-bar">
            <button
              className={`line-filter-btn ${lineFilter === "" ? "on" : ""}`}
              onClick={() => { setLineFilter(""); setPage(0); }}
            >
              전체 <em>{members.length}</em>
            </button>
            {LINE_KEYS.map((lk) => (
              <button
                key={lk}
                className={`line-filter-btn ${lineFilter === lk ? "on" : ""}`}
                onClick={() => { setLineFilter(lk); setPage(0); }}
              >
                {lk} <em>{members.filter((m) => m.mainLine === lk).length}</em>
              </button>
            ))}
          </div>

          <div className="member-list-simple">
            {pagedMembers.map((m) => {
              const mainAcc = m.accounts.find((a) => a.isMain) ?? m.accounts[0] ?? null;
              return (
                <div className="member-card-simple" key={m.id}>
                  {m.tier && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="member-tier-emblem" src={tierEmblemUrl(m.tier.tier)} alt={m.tier.tier} width={28} height={28} />
                  )}
                  <span className="member-name">{m.nickname}</span>
                  {mainAcc && (
                    <span className="member-main-acc">
                      {mainAcc.gameName}<span className="acc-tagline">#{mainAcc.tagLine}</span>
                    </span>
                  )}
                  {m.tier && (
                    <span className={`tier-badge tier-${m.tier.tier.toLowerCase()}`}>
                      {tierLabel(m.tier)}
                    </span>
                  )}
                  {m.mainLine && <span className="member-line">{m.mainLine}</span>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
      <div className="member-list">
        {pagedMembers.map((m) => {
          const f = accForm[m.id] || { name: "", tag: "", main: false };
          return (
            <div className="member-card" key={m.id}>
              <div className="member-top">
                {editing === m.id ? (
                  <div className="member-edit">
                    <input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, name: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(m.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      placeholder="클랜원 이름"
                      autoFocus
                    />
                    <input
                      value={editForm.birthYear}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, birthYear: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(m.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      placeholder="연생"
                      className="birth-year-input"
                    />
                    <select
                      value={editForm.mainLine}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, mainLine: e.target.value }))
                      }
                      className="line-select"
                    >
                      <option value="">주라인</option>
                      <option value="TOP">TOP</option>
                      <option value="JG">JG</option>
                      <option value="MID">MID</option>
                      <option value="ADC">ADC</option>
                      <option value="SUP">SUP</option>
                    </select>
                    <select
                      value={editForm.subLine}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, subLine: e.target.value }))
                      }
                      className="line-select"
                    >
                      <option value="">부라인</option>
                      <option value="TOP">TOP</option>
                      <option value="JG">JG</option>
                      <option value="MID">MID</option>
                      <option value="ADC">ADC</option>
                      <option value="SUP">SUP</option>
                    </select>
                    <button className="save-btn" onClick={() => saveEdit(m.id)}>
                      저장
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={() => setEditing(null)}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      {m.tier && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="member-tier-emblem" src={tierEmblemUrl(m.tier.tier)} alt={m.tier.tier} width={24} height={24} />
                      )}
                      <span className="member-name">{m.nickname}</span>
                      {m.birthYear && (
                        <span className="member-birth">({m.birthYear}년생)</span>
                      )}
                      {m.mainLine && (
                        <span className="member-line">
                          {m.mainLine}{m.subLine && ` / ${m.subLine}`}
                        </span>
                      )}
                      {m.tier && (
                        <span
                          className={`tier-badge tier-${m.tier.tier.toLowerCase()}`}
                        >
                          {tierLabel(m.tier)}
                        </span>
                      )}
                    </div>
                    <div className="member-right">
                      {isAdmin && (
                        <button
                          className="sync-one-btn"
                          onClick={() => syncOne(m.id)}
                          disabled={syncingMember === m.id}
                          title="이 클랜원만 동기화"
                        >
                          {syncingMember === m.id ? "⏳" : "🔄"}
                        </button>
                      )}
                      <span className="member-2w">최근 한 달 {m.games2w}판</span>
                      {isAdmin && (
                        <>
                          <button className="edit-btn" onClick={() => startEdit(m)}>
                            수정
                          </button>
                          <button
                            className="del-btn"
                            onClick={() => remove("member", m.id)}
                          >
                            클랜원 삭제
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 계정 목록. 운영진에게는 본계정/부계정 구분과 동기화 상세를 보여주고,
                  일반 클랜원에게는 그냥 이름만 나열한다. */}
              {isAdmin ? (
                <div className="acc-list">
                  {m.accounts.length === 0 && (
                    <div className="acc-empty">등록된 계정이 없습니다.</div>
                  )}
                  {m.accounts.map((a) => (
                    <div className="acc-row" key={a.id}>
                      <span className={`acc-tag ${a.isMain ? "main" : "sub"}`}>
                        {a.isMain ? "본계정" : "부계정"}
                      </span>
                      <span className="acc-id">
                        {a.gameName}
                        <span className="acc-tagline">#{a.tagLine}</span>
                      </span>
                      <span className="acc-2w">최근 한 달 {a.games2w}판</span>
                      <span className="acc-synced">
                        동기화 {syncedTime(a.lastSyncedAt)}
                      </span>
                      <button
                        className="del-btn small"
                        onClick={() => remove("account", a.id)}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                m.accounts.length > 0 && (
                  <div className="acc-list-simple">
                    {m.accounts.map((a) => (
                      <span className="acc-name-chip" key={a.id}>{a.gameName}</span>
                    ))}
                  </div>
                )
              )}

              {/* 로그인 계정 연동 (운영진만) — 파티 생성 시 표시될 롤 ID를 결정한다 */}
              {isAdmin && (
                <div className="link-account-row">
                  <span className="link-label">로그인 계정 연동</span>
                  <select
                    className="link-select"
                    value={users.find((u) => u.memberId === m.id)?.id ?? ""}
                    onChange={(e) => setLinkedUser(m.id, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">연동 안 함</option>
                    {users
                      .filter((u) => u.memberId === null || u.memberId === m.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.username} ({u.nickname})</option>
                      ))}
                  </select>
                  {/* 이 클랜원에 연동된 계정이 있으면, 비밀번호를 잊었을 때 1234로 초기화할 수 있다. */}
                  {users.find((u) => u.memberId === m.id) && (
                    <button
                      type="button"
                      className="reset-pw-btn"
                      onClick={() => resetPassword(users.find((u) => u.memberId === m.id)!.id, users.find((u) => u.memberId === m.id)!.username)}
                    >
                      비밀번호 초기화
                    </button>
                  )}
                </div>
              )}

              {/* 계정 추가 (운영진만) */}
              {isAdmin && (
                <div className="add-account">
                  <input
                    placeholder="소환사명 (또는 이름#태그 붙여넣기)"
                    value={f.name}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addAccount(m.id);
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      // "이름#태그" 형태면 #로 잘라서 두 칸에 나눠 넣는다.
                      if (v.includes("#")) {
                        const [n, t] = v.split("#");
                        setF(m.id, { name: n, tag: t ?? "" });
                      } else {
                        setF(m.id, { name: v });
                      }
                    }}
                  />
                  <span className="hash">#</span>
                  <input
                    className="tag"
                    placeholder="태그"
                    value={f.tag}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addAccount(m.id);
                    }}
                    onChange={(e) => setF(m.id, { tag: e.target.value })}
                  />
                  <label className="main-check">
                    <input
                      type="checkbox"
                      checked={f.main}
                      onChange={(e) => setF(m.id, { main: e.target.checked })}
                    />
                    본계정
                  </label>
                  <button onClick={() => addAccount(m.id)}>계정 추가</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
      </>)}
    </div>
  );
}
