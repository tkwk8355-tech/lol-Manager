// =============================================================
// 적어 둔 이름 → 클랜원 매칭용 유사도 계산 (오타/띄어쓰기/일부만 적기/초성 대응)
// 내전 팀생성 붙여넣기(app/scrim/page.tsx)와 같은 규칙. 파티 모집글 붙여넣기에서 사용한다.
// =============================================================

const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function getChosung(str: string): string {
  return str.split("").map((ch) => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG[Math.floor(code / 588)];
  }).join("");
}

export const normName = (x: string) => x.replace(/[\s_.\-]+/g, "").toLowerCase();

// 한글을 자모 단위로 분해 → "꼬"/"코", "죽"/"쭉" 같은 오타도 거리 1로 계산된다
function toJamo(x: string): string {
  let out = "";
  for (const ch of x) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    out += CHOSUNG[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
  }
  return out;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

// 0~1 유사도. 1 = 같은 이름
export function nameSimilarity(written: string, nickname: string): number {
  const a = normName(written), b = normName(nickname);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let best = 0;
  // 일부만 적은 경우 ("범" ↔ "범고래")
  if (b.includes(a) || a.includes(b)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    best = Math.max(best, 0.7 + 0.25 * ratio);
  }
  // 줄임말: 적은 글자가 닉네임 안에 순서대로 들어있는 경우 ("숟 도" ↔ "숟가락과도구")
  if (isSubsequence(a, b)) {
    const ratio = a.length / b.length;
    best = Math.max(best, a[0] === b[0] ? 0.72 + 0.23 * ratio : 0.62 + 0.2 * ratio);
  }
  // 초성으로 적은 경우 ("ㄱㄲㅈ" ↔ "귤꺼죽")
  if (/^[ㄱ-ㅎ]+$/.test(a) && getChosung(b).startsWith(a)) best = Math.max(best, 0.8);
  // 오타: 자모 단위 편집거리
  const ja = toJamo(a), jb = toJamo(b);
  best = Math.max(best, 1 - editDistance(ja, jb) / Math.max(ja.length, jb.length));
  return best;
}

export const NAME_MATCH_MIN = 0.6; // 이 값보다 낮으면 "못 찾음" 처리
