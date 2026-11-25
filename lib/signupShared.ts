// =============================================================
// 회원가입: 서버/화면이 함께 쓰는 규칙
// =============================================================

export const USERNAME_RULE = /^[a-zA-Z0-9_]{4,20}$/;
export const USERNAME_HINT = "영문 · 숫자 · _ 4~20자";
export const MIN_PASSWORD = 6;

/** "닉네임#태그" → { gameName, tagLine } (형식이 틀리면 null) */
export const parseRiotId = (raw: string) => {
  const s = raw.trim();
  const i = s.lastIndexOf("#");
  if (i <= 0 || i === s.length - 1) return null;
  const gameName = s.slice(0, i).trim();
  const tagLine = s.slice(i + 1).trim();
  if (!gameName || !tagLine || gameName.length > 100 || tagLine.length > 50) return null;
  return { gameName, tagLine };
};
