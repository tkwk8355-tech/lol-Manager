"use client";

// =============================================================
// 프로필 팝업: 헤더 프로필을 누르면 뜬다.
// - 프로필(테두리 · 닉네임 · 등급 · 포인트) + 방 구경 (보기만)
// - 내 프로필이면: 방 꾸미러 가기 · 비밀번호 변경 · 로그아웃
// - userId를 넘기면 다른 사람 프로필/방도 같은 팝업으로 볼 수 있다
// - 헤더 안에서 열지만 화면 전체에 뜨도록 document.body에 그린다(portal)
// =============================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import ProfileAvatar from "./ProfileAvatar";
import RoomView from "./room/RoomView";
import ChangePasswordModal from "./ChangePasswordModal";
import type { RoomData } from "@/lib/roomShared";
import styles from "./ProfileModal.module.css";

const ROLE_LABEL: Record<string, string> = { admin: "운영진", subadmin: "부운영진", captain: "팀장", member: "클랜원" };

type RoomRes = {
  owner: { userId: number; nickname: string; role: string; frame: string; icon?: string };
  room: RoomData;
  points?: number | null;
};

export default function ProfileModal({ userId, onClose }: { userId?: number; onClose: () => void }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState<RoomRes | null>(null);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const isMe = !userId || userId === user?.userId;

  useEffect(() => {
    fetch(`/api/room${userId ? `?userId=${userId}` : ""}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); })
      .catch(e => setError(e.message || "불러오지 못했어요."));
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !showPw) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, showPw]);

  const owner = data?.owner ?? (isMe && user ? { userId: user.userId, nickname: user.nickname, role: user.role, frame: "frame_none" } : null);

  // 헤더(backdrop-filter) 안에서는 position:fixed가 헤더 기준이 되므로 body에 띄운다
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="프로필">
        <button className={styles.close} onClick={onClose} aria-label="닫기">×</button>

        <div className={styles.head}>
          {owner && <ProfileAvatar userId={owner.userId} nickname={owner.nickname} size={64} frame={owner.frame} icon={owner.icon} />}
          <div className={styles.who}>
            <div className={styles.name}>{owner?.nickname ?? "…"}</div>
            <div className={styles.tags}>
              {owner && <span className={`auth-role-badge ${owner.role}`}>{ROLE_LABEL[owner.role] ?? "클랜원"}</span>}
              {isMe && data && (
                <span className={styles.points}>{data.points == null ? "포인트 연동 안 됨" : `💰 ${data.points.toLocaleString()}P`}</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.roomBox}>
          {data ? <RoomView room={data.room} /> : <div className={styles.roomEmpty}>{error || "방을 불러오는 중…"}</div>}
          <span className={styles.roomLabel}>🏠 {owner?.nickname ?? ""}님의 방</span>
        </div>

        {isMe && (
          <div className={styles.actions}>
            <a href="/content/room" className={`btn-primary ${styles.decorate}`}>🛋️ 방 꾸미기</a>
            {!user?.scrimOnly && <button className="btn-secondary" onClick={() => setShowPw(true)}>비밀번호 변경</button>}
            <button className="btn-secondary" onClick={async () => { await logout(); window.location.href = "/"; }}>로그아웃</button>
          </div>
        )}
      </div>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>,
    document.body
  );
}
