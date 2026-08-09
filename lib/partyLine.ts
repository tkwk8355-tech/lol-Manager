// =============================================================
// 파티 생성/참가 시 라인 입력값을 검증하는 공용 헬퍼.
// - 라인은 최대 2개까지 선택 가능 (예: "TOP,JG")
// - "ALL"은 라인 무관을 뜻하며, 다른 라인과 함께 고를 수 없다(항상 단독).
// - DB에는 쉼표로 이어붙인 문자열로 저장한다 (예: "TOP,JG" 또는 "ALL").
// =============================================================

export const VALID_LINES = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
export const MAX_LINES = 2;

export type ParseLineResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

// 입력값(문자열 또는 쉼표로 구분된 문자열)을 검증해 저장용 문자열로 정규화한다.
export function parseLineInput(input: unknown): ParseLineResult {
  if (!input) return { ok: true, value: null };
  const raw = String(input).trim();
  if (!raw) return { ok: true, value: null };

  if (raw === "ALL") return { ok: true, value: "ALL" };

  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes("ALL")) {
    return { ok: false, error: "ALL은 다른 라인과 함께 선택할 수 없습니다." };
  }
  if (parts.length > MAX_LINES) {
    return { ok: false, error: `라인은 최대 ${MAX_LINES}개까지 선택할 수 있습니다.` };
  }
  const unique = new Set(parts);
  if (unique.size !== parts.length) {
    return { ok: false, error: "같은 라인을 중복해서 선택할 수 없습니다." };
  }
  for (const p of parts) {
    if (!VALID_LINES.includes(p as any)) {
      return { ok: false, error: "올바르지 않은 라인입니다." };
    }
  }
  return { ok: true, value: parts.join(",") };
}
