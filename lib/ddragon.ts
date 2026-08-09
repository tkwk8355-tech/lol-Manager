// Data Dragon: Riot 정적 데이터 CDN (API 키 불필요)
// 챔피언 한글 이름, 이미지 URL 등을 제공

const DDRAGON = "https://ddragon.leagueoflegends.com";

export interface ChampionInfo {
  id: string; // 영문 ID
  name: string; // 한글 이름
}

// 최신 Data Dragon 버전 조회 (하루 캐시)
export async function getLatestVersion(): Promise<string> {
  const res = await fetch(`${DDRAGON}/api/versions.json`, {
    next: { revalidate: 86400 },
  });
  const versions: string[] = await res.json();
  return versions[0];
}

// 챔피언 데이터 조회 (소문자 ID로 매핑)
export async function getChampionMap(version: string): Promise<Record<string, ChampionInfo>> {
  const res = await fetch(`${DDRAGON}/cdn/${version}/data/ko_KR/champion.json`, {
    next: { revalidate: 86400 },
  });
  const json = await res.json();
  const data = json.data as Record<string, { id: string; name: string }>;

  const map: Record<string, ChampionInfo> = {};
  for (const key of Object.keys(data)) {
    const champ = data[key];
    map[champ.id.toLowerCase()] = { id: champ.id, name: champ.name };
  }
  return map;
}

// 챔피언 아이콘 URL
export function championIconUrl(version: string, championId: string): string {
  return `${DDRAGON}/cdn/${version}/img/champion/${championId}.png`;
}

// 프로필 아이콘 URL
export function profileIconUrl(version: string, iconId: number): string {
  return `${DDRAGON}/cdn/${version}/img/profileicon/${iconId}.png`;
}

// 아이템 아이콘 URL (0이면 null)
export function itemIconUrl(version: string, itemId: number): string | null {
  if (!itemId) return null;
  return `${DDRAGON}/cdn/${version}/img/item/${itemId}.png`;
}

// 소환사 주문 데이터 조회 (숫자 ID → 문자열 ID)
export async function getSummonerSpellMap(version: string): Promise<Record<number, string>> {
  const res = await fetch(`${DDRAGON}/cdn/${version}/data/ko_KR/summoner.json`, {
    next: { revalidate: 86400 },
  });
  const json = await res.json();
  const data = json.data as Record<string, { id: string; key: string }>;

  const map: Record<number, string> = {};
  for (const key of Object.keys(data)) {
    const spell = data[key];
    map[Number(spell.key)] = spell.id;
  }
  return map;
}

// 스펠 아이콘 URL
export function spellIconUrl(version: string, spellId: string): string {
  return `${DDRAGON}/cdn/${version}/img/spell/${spellId}.png`;
}

export interface RuneLookup {
  runeIconById: Record<number, string>;
  styleIconById: Record<number, string>;
}

// 룬 데이터 조회
export async function getRuneLookup(version: string): Promise<RuneLookup> {
  const res = await fetch(
    `${DDRAGON}/cdn/${version}/data/ko_KR/runesReforged.json`,
    { next: { revalidate: 86400 } }
  );
  const styles = (await res.json()) as Array<{
    id: number;
    icon: string;
    slots: Array<{ runes: Array<{ id: number; icon: string }> }>;
  }>;

  const runeIconById: Record<number, string> = {};
  const styleIconById: Record<number, string> = {};
  for (const style of styles) {
    styleIconById[style.id] = style.icon;
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        runeIconById[rune.id] = rune.icon;
      }
    }
  }
  return { runeIconById, styleIconById };
}

// 룬 아이콘 URL
export function runeIconUrl(iconPath: string): string {
  return `${DDRAGON}/cdn/img/${iconPath}`;
}

// 라인 아이콘 (Community Dragon 사용)
const POSITION_ICONS: Record<string, string> = {
  TOP: "icon-position-top",
  JUNGLE: "icon-position-jungle",
  MIDDLE: "icon-position-middle",
  BOTTOM: "icon-position-bottom",
  UTILITY: "icon-position-utility",
};

// 라인 아이콘 URL
export function positionIconUrl(teamPosition?: string): string | null {
  if (!teamPosition) return null;
  const name = POSITION_ICONS[teamPosition];
  if (!name) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/${name}.png`;
}
