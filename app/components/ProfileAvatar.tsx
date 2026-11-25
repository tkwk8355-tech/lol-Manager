// =============================================================
// 프로필 동그라미: 닉네임 첫 글자(또는 산 아이콘) + 사용자마다 고정된 색 + (산) 테두리.
// 헤더 프로필 버튼, 프로필 팝업, 방꾸미기 테두리 상점에서 같이 쓴다.
// - 테두리 종류는 lib/roomShared.ts CATALOG의 frame_* 와 아래 FRAME_STYLE 이 같은 key
// =============================================================

import styles from "./ProfileAvatar.module.css";
import { CATALOG_MAP } from "@/lib/roomShared";

const HUES = [4, 28, 45, 140, 170, 200, 225, 260, 290, 330];

export const avatarHue = (userId: number) => HUES[Math.abs(userId) % HUES.length];

/** 테두리 key → CSS 클래스 + 장식 이모지 */
const FRAME_STYLE: Record<string, { cls: string; deco?: string; decoPos?: "top" | "corner" }> = {
  frame_gold: { cls: styles.gold },
  frame_sakura: { cls: styles.sakura, deco: "🌸", decoPos: "corner" },
  frame_neon: { cls: styles.neon },
  frame_rainbow: { cls: styles.rainbow },
  frame_galaxy: { cls: styles.galaxy, deco: "✨", decoPos: "corner" },
  frame_crown: { cls: styles.gold, deco: "👑", decoPos: "top" },
  frame_leaf: { cls: styles.leaf, deco: "🌱", decoPos: "corner" },
  frame_heart: { cls: styles.heart, deco: "💗", decoPos: "corner" },
  frame_ice: { cls: styles.ice, deco: "❄️", decoPos: "corner" },
  frame_fire: { cls: styles.fire, deco: "🔥", decoPos: "top" },
  frame_star: { cls: styles.star, deco: "⭐", decoPos: "corner" },
  frame_xmas: { cls: styles.xmas, deco: "🎄", decoPos: "corner" },
  frame_diamond: { cls: styles.diamond, deco: "💎", decoPos: "top" },
  frame_aurora: { cls: styles.aurora },
};

type Props = { userId: number; nickname: string; size?: number; frame?: string | null; icon?: string | null };

export default function ProfileAvatar({ userId, nickname, size = 26, frame, icon }: Props) {
  const emoji = icon ? CATALOG_MAP[icon]?.emoji : undefined;
  const hue = avatarHue(userId);
  const fs = frame ? FRAME_STYLE[frame] : undefined;
  const ring = fs ? Math.max(2, Math.round(size * 0.09)) : 0;
  const inner = size - ring * 2;
  return (
    <span className={`${styles.wrap}${fs ? ` ${styles.framed} ${fs.cls}` : ""}`} style={{ width: size, height: size, padding: ring }} aria-hidden>
      <span
        className={styles.avatar}
        style={{
          width: inner, height: inner, fontSize: Math.round(inner * (emoji ? 0.6 : 0.46)),
          background: emoji ? `linear-gradient(145deg, hsl(${hue} 80% 88%), hsl(${hue} 70% 74%))` : `linear-gradient(145deg, hsl(${hue} 70% 62%), hsl(${hue} 65% 46%))`,
        }}
      >
        {emoji ?? [...nickname.trim()][0] ?? "?"}
      </span>
      {fs?.deco && (
        <span className={fs.decoPos === "top" ? styles.decoTop : styles.decoCorner} style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}>
          {fs.deco}
        </span>
      )}
    </span>
  );
}
