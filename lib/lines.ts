// =============================================================
// 라인(포지션) 관련 공용 상수/헬퍼.
// 회원가입 시 주라인/부라인 선택, 클랜원 카드의 라인 표시 등에서 재사용한다.
// =============================================================

export const LINES = [
  { key: "TOP", label: "탑", icon: "icon-position-top" },
  { key: "JG", label: "정글", icon: "icon-position-jungle" },
  { key: "MID", label: "미드", icon: "icon-position-middle" },
  { key: "ADC", label: "원딜", icon: "icon-position-bottom" },
  { key: "SUP", label: "서폿", icon: "icon-position-utility" },
] as const;

const CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions";
export function lineIconUrl(icon: string) {
  return `${CDRAGON}/${icon}.png`;
}

export const LINE_MAP: Record<string, (typeof LINES)[number]> =
  Object.fromEntries(LINES.map((l) => [l.key, l]));

export function lineLabel(key: string | null | undefined) {
  if (!key) return null;
  return LINE_MAP[key]?.label ?? key;
}
