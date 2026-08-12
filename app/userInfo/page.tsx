"use client"; // Ŭ���� ��� ������(���������� ����).

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../components/AuthProvider";

interface Account {
  id: number;
  gameName: string;
  tagLine: string;
  isMain: boolean;
  hasPuuid: boolean;
  gamesTotal: number; // ���� ���� �� ���� ���� �Ǽ�
  games2w: number; // �ֱ� 2�� �Ǽ�
  lastSyncedAt: string | null;
}
interface TierInfo {
  tier: string;
  rank: string;
  lp: number;
}
interface Member {
  id: number;
  nickname: string;    // ������ game_name
  displayName: string; // ������ game_name#tagLine
  memo: string | null;
  birthDate: string | null;
  birthYear: number | null;
  gender: string | null;
  mainLine: string | null;
  subLine: string | null;
  position: string;
  status: string;
  statusNote: string | null;
  accounts: Account[];
  gamesTotal: number;
  games2w: number;
  aramGames2w: number;
  normalGames2w: number;
  tier: TierInfo | null;
  totalPoints: number;
  warningCount: number;
}

// Ƽ�� �ѱ��� ��. ������+ �� �ܰ� ����, �����ʹ� LP ǥ��.
const TIER_KO: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티나",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "쳌린저",
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
// ���� ���� �˻� ���������� ���� �Ͱ� ���� Ƽ�� ������ �̹���(public/tiers)�� �����Ѵ�.
function tierEmblemUrl(tier: string) { return `/tiers/emblem-${tier.toLowerCase()}.png`; }

// Ȱ�� ����Ʈ ��� Ȱ�� Ƽ��
const ACTIVITY_TIERS = [
  { min: 3300, label: "C", color: "#d9a441" },   // Challenger
  { min: 2800, label: "M", color: "#9d4dc3" },   // Master
  { min: 2300, label: "D", color: "#4f7bd0" },   // Diamond
  { min: 1800, label: "E", color: "#2f9e6b" },   // Emerald
  { min: 1300, label: "P", color: "#3aa6a0" },   // Platinum
  { min: 800,  label: "G", color: "#cf9b41" },   // Gold
  { min: 300,  label: "S", color: "#7e93a3" },   // Silver
  { min: 0,    label: "B", color: "#8c5230" },   // Bronze
] as const;

function activityTier(points: number) {
  return ACTIVITY_TIERS.find((t) => points >= t.min) ?? null;
}

// 활동 시간 "MM.DD HH:MM"(날짜 포함). 오늘이면 "방금 활동".
function syncedTime(iso: string | null) {
  if (!iso) return "미동기화";
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}.${da} ${hh}:${mm}`;
}

const PAGE_SIZES = [10, 20]; // �������� Ŭ���� �� ������
const LINE_KEYS = ["TOP", "JG", "MID", "ADC", "SUP"] as const; // ALL�� Ŭ���� ���� ���信 ���� ����

interface LinkedUser {
  id: number;
  username: string;
  nickname: string;
  role: string;
  createdAt?: string;
}

export default function UserInfoPage() {
  const { user, isAdmin, loading: authLoading, openAuthModal } = useAuth();
  const editModalMouseDownInside = useRef(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // �α��� ���� �� Ŭ���� ���� (����� ���)
  const [users, setUsers] = useState<LinkedUser[]>([]);
  const [linkMsg, setLinkMsg] = useState("");

  async function loadUsers() {
    try {
      const res = await fetch("/api/userinfo/link");
      const json = await res.json();
      if (res.ok) setUsers(json.users);
    } catch { /* ���� */ }
  }

  // ��й�ȣ�� �ؾ���� Ŭ������ ����, ����� �ش� �α��� ���� ��й�ȣ�� 1234�� �ʱ�ȭ�Ѵ�.
  async function resetPassword(userId: number, username: string) {
    if (!confirm(`"${username}" 의 비밀번호를 1234로 초기화할까요?`)) return;
    setLinkMsg("");
    try {
      const res = await fetch("/api/userinfo/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) { setLinkMsg(json.error || "초기화 실패"); return; }
      alert(`"${username}" 의 비밀번호가 1234로 초기화되었습니다.`);
    } catch { setLinkMsg("네트워크 오류"); }
  }

  // memberId�� ������ �α��� ������ �ٲ۴�. userId�� null�̸� ���� ����.
  async function changeRole(userId: number, role: string) {
    const res = await fetch("/api/userinfo/link", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const json = await res.json();
    if (!res.ok) { setLinkMsg(json.error || "���� ���� ����"); return; }
    loadUsers();
  }
  async function deleteUser(userId: number, username: string) {
    if (!confirm(`"${username}" 계정을 삭제하시겠습니까? 연동된 클랜원 정보도 함께 삭제됩니다.`)) return;
    setLinkMsg("");
    try {
      const res = await fetch(`/api/userinfo/link?id=${userId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setLinkMsg(json.error || "���� ����"); return; }
      loadUsers();
    } catch { setLinkMsg("��Ʈ��ũ ����"); }
  }

  // �˻�
  const [searchQuery, setSearchQuery] = useState("");

  // �ֶ��� ���� (�Ϲ� Ŭ���� ��ȸ ȭ�鿡���� ���). ALL�� Ŭ�������� ���� �����̶� ����.
  const [lineFilter, setLineFilter] = useState("");

  // �Ҵ緮 �̴� ����
  const [showInactive, setShowInactive] = useState(false);

  // ����/���� ���� ��
  const [specialFilter, setSpecialFilter] = useState<"" | "rookie" | "leave">("")
  const [sortBy, setSortBy] = useState<"birth" | "activityTier">("birth");

  // 초기화
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0); // 0-����

  // �� Ŭ���� �Է�
  // Ŭ���� �߰� ���
  const [memberModal, setMemberModal] = useState(false);
  const [memberInput, setMemberInput] = useState("");
  const [memberModalErr, setMemberModalErr] = useState("");
  const [memberModalBusy, setMemberModalBusy] = useState(false);
  
  // ���� ���ε�
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncMsg, setSyncMsg] = useState("");

  // ���� �߰� ���
  const [accModal, setAccModal] = useState<{ memberId: number; nickname: string } | null>(null);
  const [accInput, setAccInput] = useState(""); // "닉네임#태그" 형식
  const [accIsMain, setAccIsMain] = useState(false);
  const [accModalErr, setAccModalErr] = useState("");
  const [accModalBusy, setAccModalBusy] = useState(false);

  // Ŭ���� ���� ���
  const [editModal, setEditModal] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState<{
    birthYear: string;
    birthMD: string;
    gender: string;
    mainLine: string;
    subLine: string;
    position: string;
    status: string;
    statusNote: string;
  }>({
    birthYear: "",
    birthMD: "",
    gender: "",
    mainLine: "",
    subLine: "",
    position: "�Ϲ�",
    status: "active",
    statusNote: "",
  });

  // ��� ��� ����
  const [warnModal, setWarnModal] = useState<{ memberId: number; nickname: string } | null>(null);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [warnForm, setWarnForm] = useState({ type: "운영 방침 위반", reason: "", warnedAt: new Date().toISOString().slice(0, 10) });
  const [warnLoading, setWarnLoading] = useState(false);

  async function openWarnModal(m: Member) {
    setWarnModal({ memberId: m.id, nickname: m.nickname });
    setWarnLoading(true);
    try {
      const res = await fetch(`/api/userinfo/warning?memberId=${m.id}`);
      const json = await res.json();
      if (res.ok) setWarnings(json.warnings);
    } catch {}
    finally { setWarnLoading(false); }
  }

  async function addWarning() {
    if (!warnModal) return;
    const res = await fetch("/api/userinfo/warning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: warnModal.memberId, ...warnForm }),
    });
    if (res.ok) {
      setWarnForm({ type: "운영 방침 위반", reason: "", warnedAt: new Date().toISOString().slice(0, 10) });
      const r2 = await fetch(`/api/userinfo/warning?memberId=${warnModal.memberId}`);
      const j2 = await r2.json();
      if (r2.ok) setWarnings(j2.warnings);
      loadMembers();
    }
  }

  async function deleteWarning(id: number) {
    if (!confirm("경고를 삭제하시겠습니까?")) return;
    await fetch(`/api/userinfo/warning?id=${id}`, { method: "DELETE" });
    if (warnModal) {
      const r2 = await fetch(`/api/userinfo/warning?memberId=${warnModal.memberId}`);
      const j2 = await r2.json();
      if (r2.ok) setWarnings(j2.warnings);
      loadMembers();
    }
  }

  // ������ ���� ���
  // �˻� ���͸� ���� ����
  const filteredMembers = members.filter((m) => {
    // �Ҵ緮 �̴� ���� (�ֱ� 2�� ���� 0��)
    if (showInactive && (m.aramGames2w >= 4 || m.normalGames2w >= 3)) return false;
    // ����/���� ����
    if (specialFilter === "rookie" && m.position !== "수습") return false;
    if (specialFilter === "leave" && m.status !== "leave") return false;
    // �ֶ��� ���� (�Ϲ� Ŭ���� ��ȸ ȭ��)
    if (lineFilter && m.mainLine !== lineFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    // Ŭ���� �̸� �Ǵ� ���� �г��� �Ǵ� �������� �˻�
    if (m.nickname.toLowerCase().includes(q)) return true;
    if (m.birthDate && m.birthDate.slice(0, 4).includes(q)) return true;
    return m.accounts.some(
      (a) =>
        a.gameName.toLowerCase().includes(q) ||
        a.tagLine.toLowerCase().includes(q)
    );
  });
  const TIER_ORDER = ["CHALLENGER","GRANDMASTER","MASTER","DIAMOND","EMERALD","PLATINUM","GOLD","SILVER","BRONZE","IRON"];
  const positionOrder = (p: string) => p === "운영진" ? 0 : p === "부운영진" ? 1 : 2;
  const sortedMembers = sortBy === "activityTier"
    ? [...filteredMembers].sort((a, b) => b.totalPoints - a.totalPoints || a.nickname.localeCompare(b.nickname, "ko"))
    : [...filteredMembers].sort((a, b) => {
        const po = positionOrder(a.position) - positionOrder(b.position);
        if (po !== 0) return po;
        const ay = a.birthYear ?? 9999;
        const by = b.birthYear ?? 9999;
        if (ay !== by) return ay - by;
        return a.nickname.localeCompare(b.nickname, "ko");
      });
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedMembers = sortedMembers.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  async function openEditModal(m: Member) {
    setEditModal(m);
    setWarnings([]);
    try {
      const res = await fetch(`/api/userinfo/warning?memberId=${m.id}`);
      const json = await res.json();
      if (res.ok) setWarnings(json.warnings);
    } catch {}

    setEditForm({
      birthYear: m.birthYear ? String(m.birthYear) : "",
      birthMD: m.birthDate ? m.birthDate.slice(5) : "", // YYYY-MM-DD���� MM-DD ����
      gender: m.gender ?? "",
      mainLine: m.mainLine || "",
      subLine: m.subLine || "",
      position: m.position || "�Ϲ�",
      status: m.status || "active",
      statusNote: m.statusNote || "",
    });
  }

  async function saveEdit() {
    if (!editModal) return;
    try {
      const res = await fetch("/api/userinfo/member", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editModal.id,
          birthYear: editForm.birthYear ? Number(editForm.birthYear) : null,
          birthDate: editForm.birthYear && editForm.birthMD.match(/^\d{2}-\d{2}$/) ? `${editForm.birthYear}-${editForm.birthMD}` : null,
          gender: editForm.gender || null,
          mainLine: editForm.mainLine || null,
          subLine: editForm.subLine || null,
          position: editForm.position || "�Ϲ�",
          status: editForm.status || "active",
          statusNote: editForm.statusNote || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "���� ����"); return; }
      setEditModal(null);
      loadMembers();
    } catch { alert("��Ʈ��ũ ����"); }
  }

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/userinfo");
      const json = await res.json();
      if (!res.ok) setError(json.error || "�ҷ����� ����");
      else {
        // �г��� �����ټ� ����
        setMembers(json.members);
      }
    } catch {
      setError("��Ʈ��ũ ����");
    } finally {
      setLoading(false);
    }
  }

  // 클랜원 추가 시 클랜원 이름으로 계정을 찾아야 연동이 가능하다. 계정이 없으면 조회 안 된다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); setMembers([]); return; }
    loadMembers();
  }, [user, authLoading]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  async function submitMemberModal() {
    const raw = memberInput.trim();
    const hashIdx = raw.lastIndexOf("#");
    if (hashIdx < 1 || hashIdx === raw.length - 1) {
      setMemberModalErr("닉네임#태그 형식으로 입력하세요. (예: 소환사#KR1)");
      return;
    }
    const gameName = raw.slice(0, hashIdx).trim();
    const tagLine = raw.slice(hashIdx + 1).trim();
    setMemberModalBusy(true);
    setMemberModalErr("");
    try {
      const res = await fetch("/api/userinfo/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, tagLine }),
      });
      const json = await res.json();
      if (!res.ok) { setMemberModalErr(json.error || "��� ����"); return; }
      setMemberModal(false);
      setMemberInput("");
      loadMembers();
    } catch { setMemberModalErr("��Ʈ��ũ ����"); }
    finally { setMemberModalBusy(false); }
  }

  async function addMember(e: React.FormEvent) { e.preventDefault(); }

  async function submitAccModal() {
    if (!accModal) return;
    const raw = accInput.trim();
    const hashIdx = raw.lastIndexOf("#");
    if (hashIdx < 1 || hashIdx === raw.length - 1) {
      setAccModalErr("닉네임#태그 형식으로 입력하세요. (예: 소환사#KR1)");
      return;
    }
    const gameName = raw.slice(0, hashIdx).trim();
    const tagLine = raw.slice(hashIdx + 1).trim();
    if (!gameName || !tagLine) {
      setAccModalErr("닉네임 또는 태그라인을 입력하세요.");
      return;
    }
    setAccModalBusy(true);
    setAccModalErr("");
    try {
      const res = await fetch("/api/userinfo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: accModal.memberId, gameName, tagLine, isMain: accIsMain }),
      });
      const json = await res.json();
      if (!res.ok) { setAccModalErr(json.error || "���� �߰� ����"); return; }
      setAccModal(null);
      setAccInput("");
      setAccIsMain(false);
      loadMembers();
    } catch { setAccModalErr("��Ʈ��ũ ����"); }
    finally { setAccModalBusy(false); }
  }

  async function submitAccFromEditModal() {
    if (!editModal) return;
    const raw = accInput.trim();
    const hashIdx = raw.lastIndexOf("#");
    if (hashIdx < 1 || hashIdx === raw.length - 1) {
      setAccModalErr("닉네임#태그 형식으로 입력하세요. (예: 소환사#KR1)");
      return;
    }
    const gameName = raw.slice(0, hashIdx).trim();
    const tagLine = raw.slice(hashIdx + 1).trim();
    setAccModalBusy(true);
    setAccModalErr("");
    try {
      const res = await fetch("/api/userinfo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: editModal.id, gameName, tagLine, isMain: accIsMain }),
      });
      const json = await res.json();
      if (!res.ok) { setAccModalErr(json.error || "���� �߰� ����"); return; }
      setAccInput("");
      setAccIsMain(false);
      const updated = await fetch("/api/userinfo").then((r) => r.json());
      const fresh = (updated.members as Member[]).find((m) => m.id === editModal.id);
      if (fresh) setEditModal(fresh);
      loadMembers();
    } catch { setAccModalErr("��Ʈ��ũ ����"); }
    finally { setAccModalBusy(false); }
  }

  async function syncTier(memberId: number | null) {
    setSyncingId(memberId ?? 0);
    setSyncMsg("");
    try {
      const res = await fetch("/api/userinfo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberId ? { memberId } : {}),
      });
      const json = await res.json();
      if (!res.ok) { setSyncMsg(json.error || "동기화 실패"); return; }
      await loadMembers();
      if (memberId) {
        setMembers((prev) => {
          const fresh = prev.find((m) => m.id === memberId);
          if (fresh) setEditModal(fresh);
          return prev;
        });
      }
    } catch { setSyncMsg("네트워크 오류"); }
    finally { setSyncingId(null); }
  }

  async function remove(kind: "member" | "account", id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    console.log("[remove] 삭제 요청:", { kind, id });
    try {
      const res = await fetch("/api/userinfo/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      console.log("[remove] ���� ����:", res.status);
      if (!res.ok) {
        const json = await res.json();
        console.error("[remove] ���� ����:", json);
        alert(json.error || "���� ����");
        return;
      }
      console.log("[remove] ���� ����, ��� ���ΰ�ħ");
      loadMembers();
    } catch (err) {
      console.error("[remove] ��Ʈ��ũ ����:", err);
      alert("��Ʈ��ũ ����");
    }
  }


  const [tab, setTab] = useState<"members" | "accounts" | "party-history" | "points">("members");

  useEffect(() => {
    if (user?.role === "admin") setTab("accounts");
  }, [user?.role]);

  // ��Ƽ ���� (���)
  const [historyData, setHistoryData] = useState<{
    parties: { id:number; mode:string; note:string|null; status:string; startAt:string|null; participants:string[]; pastParticipants:string[] }[];
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/party/history`);
      const json = await res.json();
      if (res.ok) setHistoryData(json);
    } catch {}
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    if (isAdmin && tab === "party-history") loadHistory();
  }, [isAdmin, tab]);

  // ����Ʈ ���� ����
  const [pointLogs, setPointLogs] = useState<any[]>([]);
  const [pointLoading, setPointLoading] = useState(false);
  const [pointForm, setPointForm] = useState({ memberId: "", points: "", comment: "" });
  const [pointMsg, setPointMsg] = useState("");

  // Ŭ���� ī�� ����Ʈ ���� ���
  const [pointModal, setPointModal] = useState<{ memberId: number; nickname: string } | null>(null);
  const [pointModalForm, setPointModalForm] = useState({ points: "", comment: "" });
  const [pointModalErr, setPointModalErr] = useState("");
  const [pointModalBusy, setPointModalBusy] = useState(false);

  async function submitPointModal() {
    if (!pointModal) return;
    const pts = Number(pointModalForm.points);
    if (!pts || !pointModalForm.comment.trim()) { setPointModalErr("������ ������ �Է��ϼ���."); return; }
    setPointModalBusy(true); setPointModalErr("");
    try {
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: pointModal.memberId, points: pts, comment: pointModalForm.comment }),
      });
      const json = await res.json();
      if (!res.ok) { setPointModalErr(json.error || "����"); return; }
      setPointModal(null);
      setPointModalForm({ points: "", comment: "" });
      loadMembers();
    } catch { setPointModalErr("��Ʈ��ũ ����"); }
    finally { setPointModalBusy(false); }
  }

  async function loadPointLogs() {
    setPointLoading(true);
    try {
      const res = await fetch("/api/points");
      const json = await res.json();
      if (res.ok) setPointLogs(json.logs);
    } catch {}
    finally { setPointLoading(false); }
  }

  async function givePoint(e: React.FormEvent) {
    e.preventDefault();
    setPointMsg("");
    if (!pointForm.memberId || !pointForm.points || !pointForm.comment.trim()) {
      setPointMsg("Ŭ����, ����, ������ ��� �Է��ϼ���."); return;
    }
    const res = await fetch("/api/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: Number(pointForm.memberId), points: Number(pointForm.points), comment: pointForm.comment }),
    });
    const json = await res.json();
    if (!res.ok) { setPointMsg(json.error || "����"); return; }
    setPointForm({ memberId: "", points: "", comment: "" });
    setPointMsg("���� �Ϸ�!");
    loadPointLogs();
    loadMembers();
  }

  async function cancelPoint(id: number) {
    if (!confirm("포인트 내역을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/points?id=${id}`, { method: "DELETE" });
    if (res.ok) { loadPointLogs(); loadMembers(); }
  }

  useEffect(() => {
    if (isAdmin && tab === "points") loadPointLogs();
  }, [isAdmin, tab]);

  const MODE_KO: Record<string,string> = { aram:"칼바람", normal:"일반협곡", flex:"자유랙크", solo:"솔로랙크", scrim:"내전" };

  // ���� ��� �ٿ�ε�
  function downloadExcel() {
    const rows = members.map((m) => ({
      "닉네임": m.nickname,
      "출생연도": m.birthYear || "",
      "생일(MM-DD)": m.birthDate ? m.birthDate.slice(5) : "",
      "직책": m.position,
      "주라인": m.mainLine || "",
      "부라인": m.subLine || "",
      "활동상태": m.status === "active" ? "활동" : "외출",
      "포인트": m.totalPoints,
      "본계정": (m.accounts.find((a) => a.isMain) || {}).gameName || "",
      "티어": m.tier ? tierLabel(m.tier) : "",
      "경고": m.warningCount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "클랜원");
    XLSX.writeFile(wb, "클랜원_목록.xlsx");
  }

  function downloadTemplate() {
    const template = [
      ["닉네임", "출생연도", "생일(MM-DD)", "주라인", "부라인", "계정1_이름", "계정1_태그", "계정1_본계정", "계정2_이름", "계정2_태그", "계정2_본계정"],
      ["홍길동", "1995", "03-15", "TOP", "JG", "HongGD", "KR1", "O", "HongSub", "KR2", ""],
      ["김철수", "1998", "", "SUP", "ADC", "KimCS", "1234", "O", "", "", ""],
      ["박영희", "2000", "11-02", "MID", "", "ParkYH", "ABCD", "O", "ParkAlt", "5678", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "클랜원");
    XLSX.writeFile(wb, "클랜원_업로드_양식.xlsx");
  }

  // ���� ���� ���ε� �ڵ鷯
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

      // 첫 번째 계정을 메인으로 설정, 나머지 서브
      const members: Array<{
        nickname: string;
        birthYear?: number;
        birthDate?: string;
        mainLine?: string;
        subLine?: string;
        accounts: Array<{ gameName: string; tagLine: string; isMain: boolean }>;
      }> = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const nickname = String(row[0] || "").trim();
        if (!nickname) continue;

        const birthYear = row[1] ? Number(String(row[1]).trim()) || undefined : undefined;
        const birthMD = row[2] ? String(row[2]).trim() : "";
        const birthDate = birthYear && birthMD.match(/^\d{2}-\d{2}$/)
          ? `${birthYear}-${birthMD}`
          : undefined;
        const mainLine = String(row[3] || "").trim().toUpperCase() || undefined;
        const subLine = String(row[4] || "").trim().toUpperCase() || undefined;
        const accounts: Array<{ gameName: string; tagLine: string; isMain: boolean }> = [];

        // F��(index 5)���� 3���� ��� ���� ������ �Ľ�
        for (let j = 5; j < row.length; j += 3) {
          const gameName = String(row[j] || "").trim();
          const tagLine = String(row[j + 1] || "").trim();
          const isMainStr = String(row[j + 2] || "").trim().toUpperCase();
          
          if (gameName && tagLine) {
            accounts.push({
              gameName,
              tagLine,
              isMain: isMainStr === "O" || isMainStr === "TRUE",
            });
          }
        }

        members.push({ nickname, birthYear, birthDate, mainLine, subLine, accounts });
      }

      if (members.length === 0) {
        setUploadMsg("���Ͽ� ��ȿ�� �����Ͱ� �����ϴ�.");
        return;
      }

      // ������ ����
      const res = await fetch("/api/userinfo/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members }),
      });

      const json = await res.json();
      if (!res.ok) {
        setUploadMsg(json.error || "���ε� ����");
      } else {
        let msg = `�Ϸ�: Ŭ���� ${json.addedMembers}��, ���� ${json.addedAccounts}�� �߰�`;
        if (json.errors && json.errors.length > 0) {
          msg += ` �� ���� ${json.errors.length}��: ${json.errors.slice(0, 3).join(", ")}`;
        }
        setUploadMsg(msg);
        loadMembers();
      }
    } catch (err: any) {
      setUploadMsg(`: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="userinfo">
        <div className="party-login-notice">
          클랜원 목록을 보려면 로그인이 필요합니다.
          <button type="button" className="inline-login-btn" onClick={() => openAuthModal("login")}>로그인 / 회원가입</button>
        </div>
      </div>
    );
  }

  return (
    <div className="userinfo">
      {/* 클랜원 추가 모달 */}
      {memberModal && (
        <div className="modal-backdrop" onClick={() => setMemberModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <span>클랜원 추가</span>
              <button className="modal-close" onClick={() => setMemberModal(false)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>본계정 Riot ID를 입력하세요. 솔로랭크 티어가 자동 조회됩니다.</p>
              <input
                autoFocus
                placeholder="소환사명#태그 (예: 소환사#KR1)"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitMemberModal(); }}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              {memberModalErr && <span style={{ fontSize: 12, color: "var(--loss-text)" }}>{memberModalErr}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="sync-btn" disabled={memberModalBusy} onClick={submitMemberModal} style={{ flex: 1 }}>
                  {memberModalBusy ? "조회 중... (티어 조회 포함)" : "추가"}
                </button>
                <button className="cancel-btn" disabled={memberModalBusy} onClick={() => setMemberModal(false)} style={{ flex: 1 }}>
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 클랜원 수정 모달 */}
      {/* 클랜원 수정 모달 */}
      {editModal && (
        <div className="modal-backdrop"
          onMouseDown={(e) => { editModalMouseDownInside.current = e.target !== e.currentTarget; }}
          onClick={() => { if (!editModalMouseDownInside.current) setEditModal(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "100%" }}>
            <div className="modal-head">
              <span>✏️ {editModal.nickname} 수정</span>
              <button className="modal-close" onClick={() => setEditModal(null)}>×</button>
            </div>
            {/* 기본 정보 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>출생연도</label>
                <input type="number" placeholder="1995" value={editForm.birthYear}
                  onChange={(e) => setEditForm((p) => ({ ...p, birthYear: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>생일 (MM-DD)</label>
                <input type="text" placeholder="03-15" value={editForm.birthMD}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const digits = raw.replace(/[^0-9]/g, "");
                    let v = digits.length >= 4 ? digits.slice(0, 2) + "-" + digits.slice(2, 4) : raw;
                    setEditForm((p) => ({ ...p, birthMD: v }));
                  }}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>성별</label>
                <select value={editForm.gender} onChange={(e) => setEditForm((p) => ({ ...p, gender: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
                  <option value="">미선택</option>
                  <option value="M">남</option>
                  <option value="F">여</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>직책</label>
                <select value={editForm.position} onChange={(e) => setEditForm((p) => ({ ...p, position: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
                  <option value="클랜원">클랜원</option>
                  <option value="수습">수습</option>
                  <option value="부운영진">부운영진</option>
                  <option value="운영진">운영진</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>활동상태</label>
                <select value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
                  <option value="active">활동</option>
                  <option value="leave">외출/예외</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>주라인</label>
                <select value={editForm.mainLine} onChange={(e) => setEditForm((p) => ({ ...p, mainLine: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
                  <option value="">미선택</option>
                  <option value="TOP">TOP</option><option value="JG">JG</option>
                  <option value="MID">MID</option><option value="ADC">ADC</option>
                  <option value="SUP">SUP</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--muted)" }}>부라인</label>
                <select value={editForm.subLine} onChange={(e) => setEditForm((p) => ({ ...p, subLine: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
                  <option value="">미선택</option>
                  <option value="TOP">TOP</option><option value="JG">JG</option>
                  <option value="MID">MID</option><option value="ADC">ADC</option>
                  <option value="SUP">SUP</option>
                </select>
              </div>
              {editForm.status === "leave" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 11, color: "var(--muted)" }}>외출 사유</label>
                  <input value={editForm.statusNote} onChange={(e) => setEditForm((p) => ({ ...p, statusNote: e.target.value }))}
                    placeholder="외출 사유"
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
                </div>
              )}
            </div>
            {/* 연동 계정 */}
            {/* 연동 계정 */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 700 }}>연동 계정</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {editModal.accounts.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8,
                    background: "var(--card-2)", borderRadius: 8, padding: "7px 10px", fontSize: 13 }}>
                    <span style={{ flex: 1, fontWeight: 700 }}>{a.gameName}<span style={{ color: "var(--muted)", fontWeight: 400 }}>#{a.tagLine}</span></span>
                    {a.isMain && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(83,131,232,0.18)", color: "#7aa2f7" }}>본계정</span>

                    )}
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{syncedTime(a.lastSyncedAt)}</span>
                    <button className="del-btn small" onClick={async () => {
                      if (!confirm("계정을 삭제하시겠습니까?")) return;
                      await fetch("/api/userinfo/delete", { method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ kind: "account", id: a.id }) });
                      await loadMembers();
                      setEditModal((prev) => prev ? { ...prev, accounts: prev.accounts.filter((x) => x.id !== a.id) } : null);
                    }}>
                      삭제
                    </button>
                  </div>
                ))}
                {editModal.accounts.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>연동된 계정이 없습니다.</p>}
              </div>
            {/* 계정 추가 폼 */}
            </div>
            {/* 계정 추가 폼 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <input
                placeholder="소환사명#태그"
                value={accInput}
                onChange={(e) => setAccInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAccFromEditModal(); }}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={accIsMain} onChange={(e) => setAccIsMain(e.target.checked)} />
                본계정
              </label>
              <button className="sync-btn" style={{ whiteSpace: "nowrap" }} disabled={accModalBusy} onClick={submitAccFromEditModal}>
                {accModalBusy ? "추가 중..." : "+ 계정 추가"}
              </button>
            </div>
            {/* 경고 내역 */}
            {warnings.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>⚠️ 경고 {warnings.length}건</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {warnings.map((w) => (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8,
                      background: "var(--card-2)", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
                      <span style={{ color: "#f1948a", fontWeight: 800, flexShrink: 0 }}>{w.warned_at?.slice(0, 10)}</span>
                      <span style={{ fontWeight: 700, flexShrink: 0, background: "rgba(231,76,60,0.18)",
                        color: "#f1948a", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{w.type}</span>
                      <span style={{ flex: 1, color: "var(--muted)", minWidth: 0 }}>{w.reason || "-"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 저장 / 취소 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sync-btn" style={{ flex: 1 }} onClick={saveEdit}>저장</button>
              <button className="sync-btn" style={{ flex: 1 }} disabled={syncingId === editModal.id}
                onClick={() => syncTier(editModal.id)}>
                {syncingId === editModal.id ? "동기화 중..." : "🔄 솔랭 동기화"}
              </button>
              <button className="cancel-btn" style={{ flex: 1 }} onClick={() => setEditModal(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
      {/* 계정 추가 모달 */}
      {/* 계정 추가 모달 */}
      {accModal && (
        <div className="modal-backdrop" onClick={() => setAccModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <span>계정 추가 — {accModal.nickname}</span>
              <button className="modal-close" onClick={() => setAccModal(null)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                autoFocus
                placeholder="소환사명#태그 (예: 소환사#KR1)"
                value={accInput}
                onChange={(e) => setAccInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitAccModal(); }}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={accIsMain} onChange={(e) => setAccIsMain(e.target.checked)} />
                본계정
              </label>
              {accModalErr && <span style={{ fontSize: 12, color: "var(--loss-text)" }}>{accModalErr}</span>}
              <button className="sync-btn" disabled={accModalBusy} onClick={submitAccModal}>
                {accModalBusy ? "추가 중..." : "계정 추가"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 포인트 지급 모달 */}
      {/* 포인트 지급 모달 */}
      {pointModal && (
        <div className="modal-backdrop" onClick={() => setPointModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <span>🎁 {pointModal.nickname} 포인트 지급</span>
              <button className="modal-close" onClick={() => setPointModal(null)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                autoFocus
                type="number"
                placeholder="포인트 (음수 가능)"
                value={pointModalForm.points}
                onChange={(e) => setPointModalForm((p) => ({ ...p, points: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") submitPointModal(); }}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              <input
                placeholder="사유 (필수)"
                value={pointModalForm.comment}
                onChange={(e) => setPointModalForm((p) => ({ ...p, comment: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") submitPointModal(); }}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              {pointModalErr && <span style={{ fontSize: 12, color: "var(--loss-text)" }}>{pointModalErr}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="sync-btn" style={{ flex: 1 }} disabled={pointModalBusy} onClick={submitPointModal}>
                  {pointModalBusy ? "지급 중..." : "지급"}
                </button>
                <button className="cancel-btn" style={{ flex: 1 }} onClick={() => setPointModal(null)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 경고 관리 모달 */}
      {/* 경고 관리 모달 */}
      {warnModal && (
        <div className="modal-backdrop" onClick={() => setWarnModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <span>⚠️ {warnModal.nickname} 경고 관리</span>
              <button className="modal-close" onClick={() => setWarnModal(null)}>×</button>
            </div>
            {/* 경고 추가 폼 */}
            {/* 경고 추가 폼 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <select value={warnForm.type} onChange={(e) => setWarnForm((p) => ({ ...p, type: e.target.value }))}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}>
                <option>운영 방침 위반</option>
                <option>지각 및 노쇼</option>
                <option>판수 미달</option>
                <option>불화 조장</option>
              </select>
              <input type="date" value={warnForm.warnedAt} onChange={(e) => setWarnForm((p) => ({ ...p, warnedAt: e.target.value }))}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
              <textarea value={warnForm.reason} onChange={(e) => setWarnForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="상세 사유 (선택)"
                rows={2}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14, resize: "vertical" }} />
              <button className="sync-btn" onClick={addWarning}>경고 추가</button>
            </div>
            {/* 경고 이력 */}
            {/* 경고 이력 */}
            {warnLoading ? <p className="empty">불러오는 중...</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {warnings.length === 0 && <p className="empty">경고 내역이 없습니다.</p>}
                {warnings.map((w) => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card-2)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <span style={{ fontWeight: 800, color: "#f1948a", flexShrink: 0 }}>{w.warned_at?.slice(0, 10)}</span>
                    <span style={{ fontWeight: 700, flexShrink: 0,
                      background: "rgba(231,76,60,0.18)", color: "#f1948a", padding: "2px 7px", borderRadius: 5, fontSize: 11 }}>{w.type}</span>
                    <span style={{ flex: 1, color: "var(--muted)", minWidth: 0 }}>{w.reason || "-"}</span>
                    <button className="del-btn small" onClick={() => deleteWarning(w.id)}>삭제</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="ui-head">
        <h2>{isAdmin ? "클랜원 목록" : "클랜원 목록"}</h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div className="scrim-tabs" style={{ margin: 0, borderBottom: "none" }}>
            {user?.role === "admin" && <button className={tab === "accounts" ? "on" : ""} onClick={() => setTab("accounts")}>로그인 계정</button>}
            <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>클랜원</button>
            <button className={tab === "party-history" ? "on" : ""} onClick={() => setTab("party-history")}>파티 내역</button>
            <button className={tab === "points" ? "on" : ""} onClick={() => setTab("points")}>포인트</button>
          </div>
        </div>
      </div>
      {tab === "members" && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button className={`filter-btn ${showInactive ? "on" : ""}`} onClick={() => { setShowInactive(!showInactive); setSpecialFilter(""); setPage(0); }}>
            판수미달
          </button>
          <button className={`filter-btn ${specialFilter === "rookie" ? "on" : ""}`} onClick={() => { setSpecialFilter(specialFilter === "rookie" ? "" : "rookie"); setShowInactive(false); setPage(0); }}>
            수습
          </button>
          <button className={`filter-btn ${specialFilter === "leave" ? "on" : ""}`} onClick={() => { setSpecialFilter(specialFilter === "leave" ? "" : "leave"); setShowInactive(false); setPage(0); }}>
            외출
          </button>
        </div>
      )}
      {linkMsg && <div className="error">{linkMsg}</div>}
      {error && <div className="error">{error}</div>}
      {/* 검색창 (클랜원 탭에서만 표시) */}
      {/* 검색창 */}
      {tab === "members" && (
      <div className="search-box">
        <input
          type="text"
          placeholder="클랜원 이름 또는 출생연도 검색..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
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
              📥 양식 다운로드
            </button>
            <label htmlFor="excel-file" className="excel-btn-small">
              📤 엑셀 업로드
            </label>
            <input type="file" id="excel-file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileUpload} />
            <button className={`excel-btn-small ${sortBy === "activityTier" ? "on" : ""}`} onClick={() => setSortBy(sortBy === "activityTier" ? "birth" : "activityTier")}>
              활동티어
            </button>
          </div>
        )}
      </div>
      )}
      {tab === "members" && uploading && <div className="sync-msg">엑셀 업로드 중...</div>}
      {tab === "members" && uploadMsg && <div className="sync-msg">{uploadMsg}</div>}
      {/* 로그인 계정 탭 */}
      {/* 로그인 계정 탭 */}
      {isAdmin && user?.role === "admin" && tab === "accounts" && (
        <div className="home-panel">
          <div className="home-panel-head"><h3>계정 목록</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>아이디</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>닉네임</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>권한</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px", fontWeight: 700 }}>{u.username}</td>
                  <td style={{ padding: "8px" }}>{u.nickname}</td>
                  <td style={{ padding: "8px" }}>
                    {user?.role === "admin" ? (
                      <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
                        <option value="member">일반</option>
                        <option value="subadmin">부운영진</option>
                        <option value="admin">운영진</option>
                      </select>
                    ) : (
                      <span className={`auth-role-badge ${u.role}`}>{u.role === "admin" ? "운영진" : u.role === "subadmin" ? "부운영진" : "일반"}</span>
                    )}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="reset-pw-btn" onClick={() => resetPassword(u.id, u.username)}>비밀번호 초기화</button>
                    {" "}
                    <button className="del-btn small" onClick={() => deleteUser(u.id, u.username)}>삭제</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "12px 8px", color: "var(--muted)" }}>로그인 계정이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {/* 포인트 탭 */}
      {/* 포인트 탭 */}
      {isAdmin && tab === "points" && (
        <div>
          <div className="home-panel" style={{ marginBottom: 16 }}>
            {/* 수동 지급 폼 */}
            {/* 수동 지급 폼 */}
            <div className="home-panel-head"><h3>포인트 수동 지급</h3></div>
            <form onSubmit={givePoint} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={pointForm.memberId}
                onChange={(e) => setPointForm((p) => ({ ...p, memberId: e.target.value }))}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              >
                <option value="">클랜원 선택</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.nickname} ({m.totalPoints ?? 0}P)</option>)}
              </select>
              <input
                type="number"
                placeholder="포인트 (음수 가능)"
                value={pointForm.points}
                onChange={(e) => setPointForm((p) => ({ ...p, points: e.target.value }))}
                style={{ width: 120, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              <input
                placeholder="사유 (필수)"
                value={pointForm.comment}
                onChange={(e) => setPointForm((p) => ({ ...p, comment: e.target.value }))}
                style={{ flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}
              />
              <button type="submit" className="sync-btn">지급</button>
            </form>
            {pointMsg && <p style={{ marginTop: 8, fontSize: 13, color: "var(--win-text)" }}>{pointMsg}</p>}
          </div>
            {/* 전체 로그 */}
            {/* 전체 로그 */}
          <div className="home-panel">
            <div className="home-panel-head"><h3>포인트 전체 로그</h3></div>
            {pointLoading ? <p className="empty">불러오는 중...</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>시간</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>클랜원</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>타입</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>판수</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>포인트</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>사유</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>지급자</th>
                    <th style={{ padding: "6px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pointLogs.map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", color: "var(--muted)", whiteSpace: "nowrap" }}>{l.created_at?.slice(0, 16)}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{l.nickname}</td>
                      <td style={{ padding: "7px 8px" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                          background: ({scrim:"rgba(155,89,182,0.18)",shop:"rgba(231,76,60,0.18)",manual:"rgba(83,131,232,0.18)",solo:"rgba(241,196,15,0.18)",flex:"rgba(230,126,34,0.18)",aram:"rgba(0,188,212,0.18)",birthday:"rgba(255,107,157,0.18)"}[l.type as string] ?? "rgba(46,204,113,0.18)"),
                          color: ({scrim:"#c39bd3",shop:"#f1948a",manual:"#7aa2f7",solo:"#f1c40f",flex:"#e67e22",aram:"#00bcd4",birthday:"#ff6b9d"}[l.type as string] ?? "#2ecc71") }}>
                          {({ solo: "솔로랭크", flex: "자유랭크", normal: "일반", scrim: "내전", aram: "칼바람", manual: "수동", shop: "상점", birthday: "생일보너스" } as any)[l.type] ?? l.type}
                        </span>
                      </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--muted)" }}>{l.games > 0 ? `${l.games}판` : "-"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800,
                        color: l.points > 0 ? "var(--win-text)" : "var(--loss-text)" }}>
                        {l.points > 0 ? `+${l.points}` : l.points}P
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{l.comment ?? "-"}</td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{l.given_by_name ?? "-"}</td>
                      <td style={{ padding: "7px 8px" }}>
                        <button className="del-btn small" onClick={() => cancelPoint(l.id)}>취소</button>
                      </td>
                    </tr>
                  ))}
                  {pointLogs.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: "12px 8px", color: "var(--muted)" }}>포인트 내역이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {/* 파티 내역 탭 */}
      {/* 파티 내역 탭 */}
      {isAdmin && tab === "party-history" && (
        <div>
          {historyLoading && <p className="party-empty">불러오는 중...</p>}
          {!historyLoading && historyData && (
            historyData.parties.length === 0
              ? <p className="empty">펑한 파티 내역이 없습니다.</p>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {historyData.parties.map((p) => (
                    <div key={p.id} className="home-panel" style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                        <span className={`party-mode-badge mode-${p.mode}`}>{MODE_KO[p.mode] ?? p.mode}</span>
                        {p.note && <span style={{ fontWeight: 700, fontSize: 13 }}>{p.note}</span>}
                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{p.startAt ? p.startAt.slice(5, 16).replace("T", " ") : "-"}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: "rgba(231,76,60,0.18)", color: "#f1948a" }}>펑</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {p.participants.map((nick) => (
                          <span key={nick} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: "var(--card-2)", color: "var(--text)" }}>{nick}</span>
                        ))}
                        {p.participants.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>참가자 없음</span>}
                        {p.pastParticipants.length > 0 && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", width: "100%" }}>
                            <span style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, display: "block" }}>이전 참가자</span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {p.pastParticipants.map((nick) => (
                                <span key={nick} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 12, background: "var(--card-2)", color: "var(--muted)", textDecoration: "line-through" }}>{nick}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
          )}
        </div>
      )}
      {/* 클랜원 목록 */}
      {/* 클랜원 목록 */}
      {tab === "members" && (<>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
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
          <button
            style={{ marginLeft: "auto", padding: "4px 14px", borderRadius: 8, border: "1px solid #27ae60", background: sortBy === "activityTier" ? "#27ae60" : "transparent", color: sortBy === "activityTier" ? "#fff" : "#2ecc71", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            onClick={() => { setSortBy(sortBy === "activityTier" ? "birth" : "activityTier"); setPage(0); }}
          >
            활동티어
          </button>
        </div>
      )}
      {/* 클랜원 추가 + 전체 티어 동기화 버튼 */}
      {/* 클랜원 추가 + 전체 티어 동기화 */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button className="sync-btn" onClick={() => { setMemberModal(true); setMemberInput(""); setMemberModalErr(""); }}>
            + 클랜원 추가
          </button>
        </div>
      )}
      {/* 페이지네이션 */}
      {/* 페이지네이션 */}
      {members.length > 0 && (
        <div className="pager">
          <div className="page-size">
            표시
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
              ‹
            </button>
            <span>
              {safePage + 1} / {totalPages}{showInactive ? ` (판수미달 ${filteredMembers.length} / 전체 ${members.length})` : specialFilter === "rookie" ? ` (신입 ${filteredMembers.length} / 전체 ${members.length})` : specialFilter === "leave" ? ` (외출 ${filteredMembers.length} / 전체 ${members.length})` : lineFilter ? ` (${lineFilter} ${filteredMembers.length} / 전체 ${members.length})` : searchQuery ? ` (검색 ${filteredMembers.length} / 전체 ${members.length})` : ` (전체 ${members.length})`}
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {loading && <p>불러오는 중...</p>}
      {!loading && filteredMembers.length === 0 && (showInactive || specialFilter || searchQuery) && (
        <p>{showInactive ? "최근 2주 판수 미달 클랜원이 없습니다." : specialFilter === "rookie" ? "신입 클랜원이 없습니다." : specialFilter === "leave" ? "외출 중인 클랜원이 없습니다." : "검색 결과가 없습니다."}</p>
      )}
      {!loading && members.length === 0 && !searchQuery && !showInactive && (
        <p>등록된 클랜원이 없습니다.</p>
      )}

      {false ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px" }}>닉네임</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>활동티어</th>
                <th style={{ textAlign: "right", padding: "6px 10px" }}>포인트</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>솔로랭크</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>활동상태</th>
              </tr>
            </thead>
            <tbody>
              {pagedMembers.map((m) => {
                const at = activityTier(m.totalPoints);
                return (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{m.nickname}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {at ? (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                          background: `${at.color}22`, color: at.color, border: `1px solid ${at.color}55` }}>
                          {at.label}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800,
                      color: m.totalPoints > 0 ? "var(--win-text)" : "var(--muted)" }}>
                      {m.totalPoints}P
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {m.tier
                        ? <span className={`tier-badge tier-${m.tier.tier.toLowerCase()}`}>{tierLabel(m.tier)}</span>
                      : <span style={{ color: "var(--muted)" }}>-</span>}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {m.position === "수습" && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                          background: "rgba(230,126,34,0.18)", color: "#e67e22" }}>수습</span>
                      )}
                      {m.status === "leave" && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                          background: "rgba(46,204,113,0.18)", color: "#2ecc71" }}>{m.statusNote ? `외출 ${m.statusNote}` : "외출"}</span>
                      )}
                      {m.position !== "수습" && m.status !== "leave" && (
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>활동</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px" }}>닉네임</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>활동티어</th>
                <th style={{ textAlign: "right", padding: "6px 10px" }}>포인트</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>솔로랭크</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>직책</th>
                <th style={{ textAlign: "center", padding: "6px 10px" }}>활동상태</th>
                <th style={{ textAlign: "right", padding: "6px 10px" }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {pagedMembers.map((m) => {
              const at = activityTier(m.totalPoints);
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                    <span style={{ cursor: "pointer", color: "var(--text)" }} onMouseEnter={e => (e.currentTarget.style.color="#7aa2f7")} onMouseLeave={e => (e.currentTarget.style.color="var(--text)")} onClick={() => openEditModal(m)}>
                      {m.nickname}
                      {m.birthYear && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 5, fontWeight: 400 }}>{String(m.birthYear).slice(2)}년생</span>}
                      {m.warningCount > 0 && <span style={{ fontSize: 11, fontWeight: 800, marginLeft: 6, color: "#f1948a" }}>⚠️{m.warningCount}</span>}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {at ? (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                        background: `${at.color}22`, color: at.color, border: `1px solid ${at.color}55` }}>
                        {at.label}
                      </span>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800,
                    color: m.totalPoints > 0 ? "var(--win-text)" : "var(--muted)" }}>
                    {m.totalPoints}P
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {m.tier
                      ? <span className={`tier-badge tier-${m.tier.tier.toLowerCase()}`}>{tierLabel(m.tier)}</span>
                    : <span style={{ color: "var(--muted)" }}>-</span>}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {m.position !== "일반" ? (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 5,
                        background: m.position === "수습" ? "rgba(230,126,34,0.18)" : m.position === "부운영진" ? "rgba(155,89,182,0.18)" : m.position === "운영진" ? "rgba(255,105,180,0.18)" : "rgba(83,131,232,0.18)",
                        color: m.position === "수습" ? "#e67e22" : m.position === "부운영진" ? "#c39bd3" : m.position === "운영진" ? "#ff69b4" : "#7aa2f7" }}>
                        {m.position}
                      </span>
                    ) : <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: "rgba(83,131,232,0.18)", color: "#7aa2f7" }}>클랜원</span>}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {m.status === "leave" ? (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 5,
                        background: "rgba(46,204,113,0.18)", color: "#2ecc71" }}>
                        {m.statusNote ? `외출 ${m.statusNote}` : "외출"}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 5,
                        background: "rgba(83,131,232,0.18)", color: "#7aa2f7" }}>활동</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button style={{ background: "transparent", border: "1px solid rgba(231,76,60,0.5)", color: "#f1948a", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                      onClick={() => openWarnModal(m)}>경고</button>
                    {" "}
                    <button className="edit-btn" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => openEditModal(m)}>수정</button>
                    {" "}
                    <button className="del-btn small" onClick={() => remove("member", m.id)}>삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      </div>
      </>)}
    </div>
  );
}
