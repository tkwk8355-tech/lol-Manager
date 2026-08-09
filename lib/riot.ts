// Riot API 호출 헬퍼 (서버 전용)
// API 키를 사용해 Riot API를 호출하고 결과를 반환

const API_KEY = process.env.RIOT_API_KEY;
const PLATFORM = process.env.RIOT_PLATFORM || "kr";
const REGION = process.env.RIOT_REGION || "asia";
const PLATFORM_HOST = `https://${PLATFORM}.api.riotgames.com`;
const REGION_HOST = `https://${REGION}.api.riotgames.com`;

// API 호출 실패 시 사용하는 커스텀 에러
export class RiotApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "RiotApiError";
  }
}

// Riot API GET 요청 공통 함수
async function riotFetch<T>(url: string): Promise<T> {
  if (!API_KEY) {
    throw new RiotApiError(500, "RIOT_API_KEY is not set. Add it to your .env.local file.");
  }

  const res = await fetch(url, {
    headers: { "X-Riot-Token": API_KEY as string },
    cache: "no-store",
  });

  if (!res.ok) {
    let message = res.statusText;
    if (res.status === 404) message = "소환사를 찾을 수 없습니다.";
    if (res.status === 401 || res.status === 403) message = "API 키가 유효하지 않거나 만료되었습니다.";
    if (res.status === 429) message = "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.";
    throw new RiotApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

// 타입 정의
export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface SummonerDto {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface Perks {
  styles: Array<{
    description: string;
    style: number;
    selections: Array<{ perk: number }>;
  }>;
}

export interface MatchParticipant {
  puuid: string;
  teamId: number;
  championName: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
  win: boolean;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  teamPosition?: string;
  perks?: Perks;
  placement?: number;
  playerSubteamId?: number;
  subteamPlacement?: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
}

export interface MatchDto {
  metadata: { matchId: string };
  info: {
    gameMode: string;
    queueId: number;
    gameDuration: number;
    gameCreation: number;
    gameEndTimestamp?: number;
    participants: MatchParticipant[];
  };
}

// API 호출 함수들
// ACCOUNT-V1: Riot ID → puuid
export function getAccountByRiotId(gameName: string, tagLine: string, _fresh = false) {
  const url = `${REGION_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<RiotAccount>(url);
}

// SUMMONER-V4: puuid → 소환사 프로필
export function getSummonerByPuuid(puuid: string, _fresh = false) {
  const url = `${PLATFORM_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  return riotFetch<SummonerDto>(url);
}

// LEAGUE-V4: puuid → 랭크 정보
export function getLeagueEntries(puuid: string, _fresh = false) {
  const url = `${PLATFORM_HOST}/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotFetch<LeagueEntryDto[]>(url);
}

// MATCH-V5: puuid → 최근 경기 ID 목록
export function getMatchIds(puuid: string, count = 20, startTime?: number, type?: string) {
  let url = `${REGION_HOST}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  if (startTime) url += `&startTime=${startTime}`;
  if (type) url += `&type=${type}`;
  return riotFetch<string[]>(url);
}

// 경기 상세 메모리 캐시 (끝난 경기는 결과가 안 바뀌므로 영구 캐시)
const matchCache = new Map<string, MatchDto>();

// MATCH-V5: 경기 ID → 경기 상세 (캐시 활용)
export async function getMatch(matchId: string): Promise<MatchDto> {
  const cached = matchCache.get(matchId);
  if (cached) return cached;

  const url = `${REGION_HOST}/lol/match/v5/matches/${matchId}`;
  const data = await riotFetch<MatchDto>(url);
  matchCache.set(matchId, data);
  return data;
}
