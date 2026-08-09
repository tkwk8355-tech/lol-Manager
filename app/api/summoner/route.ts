// =============================================================
// 소환사 전적 조회 API 라우트 (서버에서 실행)
//
// 클라이언트(브라우저)는 이 엔드포인트만 호출하고, 실제 Riot API 키를 쓰는
// 호출은 전부 여기(서버)에서 일어난다. 덕분에 키가 브라우저로 노출되지 않는다.
//
// 호출 흐름:
//   Riot ID → (account) puuid → (summoner) 프로필 → (league) 랭크
//                                → (match) 최근 경기 ID들 → 각 경기 상세
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getLeagueEntries,
  getMatchIds,
  getMatch,
  RiotApiError,
  type MatchParticipant,
} from "@/lib/riot";
import {
  getLatestVersion,
  getChampionMap,
  championIconUrl,
  profileIconUrl,
  itemIconUrl,
  getSummonerSpellMap,
  spellIconUrl,
  getRuneLookup,
  runeIconUrl,
  positionIconUrl,
} from "@/lib/ddragon";

// queueId(숫자)를 사람이 읽기 좋은 한국어 큐 이름으로 변환하는 표.
// (Riot이 큐 ID를 추가/변경할 수 있어, 없는 ID는 gameMode로 대체한다.)
const QUEUE_NAMES: Record<number, string> = {
  420: "솔로랭크",
  440: "자유랭크",
  400: "일반",
  430: "일반",
  490: "빠른 대전",
  450: "무작위 총력전", // 칼바람
  700: "격전", // 클래시
  900: "URF",
  1700: "아레나",
  1710: "아레나",
  1750: "아레나",
  1900: "URF",
};

// 큐 ID를 한국어 이름으로. 표에 없으면 게임 모드 문자열을 그대로 사용.
function queueName(queueId: number, gameMode: string): string {
  return QUEUE_NAMES[queueId] || gameMode;
}

// 참가자의 아이템 슬롯 7칸을 이미지 URL 배열로 변환한다.
// 빈 칸(0)은 null로 남겨서, 프론트에서 빈 슬롯으로 표시한다.
function itemIcons(
  version: string,
  p: {
    item0: number;
    item1: number;
    item2: number;
    item3: number;
    item4: number;
    item5: number;
    item6: number;
  }
): (string | null)[] {
  return [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map(
    (id) => itemIconUrl(version, id)
  );
}

// 소환사 주문 2개를 아이콘 URL 배열로 변환.
function spellIcons(
  version: string,
  spells: Record<number, string>,
  p: MatchParticipant
): (string | null)[] {
  return [p.summoner1Id, p.summoner2Id].map((id) => {
    const name = spells[id];
    return name ? spellIconUrl(version, name) : null;
  });
}

// 핵심룬(키스톤) + 보조 룬 계열 아이콘을 구한다.
function runeIcons(
  runes: { runeIconById: Record<number, string>; styleIconById: Record<number, string> },
  p: MatchParticipant
): { keystone: string | null; secondary: string | null } {
  const styles = p.perks?.styles ?? [];
  const keystoneId = styles[0]?.selections?.[0]?.perk; // 주 계열 첫 룬 = 핵심룬
  const subStyleId = styles[1]?.style; // 보조 계열 ID
  return {
    keystone:
      keystoneId && runes.runeIconById[keystoneId]
        ? runeIconUrl(runes.runeIconById[keystoneId])
        : null,
    secondary:
      subStyleId && runes.styleIconById[subStyleId]
        ? runeIconUrl(runes.styleIconById[subStyleId])
        : null,
  };
}

// 많은 비동기 작업을 한꺼번에 다 던지면 초당 요청 한도(20/초)를 넘길 수 있어서,
// size개씩 나눠서 순차적으로 처리한다.
async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

// 분석할 최근 경기 수. (함께 플레이한 소환사 집계에도 사용)
// 개인 API 키는 2분당 100회 한도라, 검색당 호출(=경기수+4)을 낮춰 여러 번
// 검색해도 한도에 덜 걸리도록 10으로 둔다. (필요하면 늘릴 수 있음)
const MATCH_COUNT = 10;

// GET /api/summoner?gameName=옵타론&tagLine=3000[&refresh=1]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName")?.trim(); // 게임 이름
  const tagLine = searchParams.get("tagLine")?.trim(); // 태그
  const fresh = searchParams.get("refresh") === "1"; // 전적 갱신 여부(캐시 무시)

  console.log(`[summoner] 요청 수신: gameName=${gameName}, tagLine=${tagLine}, refresh=${fresh}`);

  // 필수 파라미터 검증.
  if (!gameName || !tagLine) {
    console.warn("[summoner] 필수 파라미터 누락");
    return NextResponse.json(
      { error: "소환사명과 태그가 필요합니다. (예: Faker#KR1)" },
      { status: 400 }
    );
  }

  try {
    // 정적 데이터: 최신 버전 + 한국어 챔피언 이름 맵. (하루 단위 캐시)
    // 이미지 URL과 한국어 이름을 만들 때 사용한다.
    const version = await getLatestVersion();
    const champions = await getChampionMap(version);
    // 스펠/룬 변환용 정적 데이터(역시 하루 단위 캐시).
    const spells = await getSummonerSpellMap(version);
    const runes = await getRuneLookup(version);

    // 1) Riot ID → 계정(puuid). 이후 모든 조회의 기준이 된다.
    const account = await getAccountByRiotId(gameName, tagLine, fresh);

    // 2) puuid → 소환사 프로필(레벨, 아이콘).
    const summoner = await getSummonerByPuuid(account.puuid, fresh);

    // 3) puuid → 랭크 정보(솔랭/자랭 등).
    const league = await getLeagueEntries(account.puuid, fresh);

    // 4) 최근 경기: 경기 ID를 받고, 각 ID의 상세를 10개씩 나눠서 조회.
    const matchIds = await getMatchIds(account.puuid, MATCH_COUNT);
    const matches = await inBatches(matchIds, 10, (id) => getMatch(id));

    // 각 경기를 화면에서 바로 쓰기 좋은 형태로 가공한다.
    const recent = matches.map((m) => {
      // 이 경기에서 "검색 대상 본인"에 해당하는 참가자를 찾는다.
      const me = m.info.participants.find((p) => p.puuid === account.puuid);
      const champName = me?.championName ?? "Unknown";
      const champInfo = champions[champName.toLowerCase()];
      // CS = 미니언 처치 + 정글 몬스터 처치.
      const cs =
        (me?.totalMinionsKilled ?? 0) + (me?.neutralMinionsKilled ?? 0);
      // 게임 모드가 CHERRY면 아레나. (등수/서브팀 방식으로 다르게 표시)
      const isArena = m.info.gameMode === "CHERRY";

      // 상세 보기(스코어보드)에서 쓸 전체 참가자 목록을 가공.
      const participants = m.info.participants.map((p) => {
        const info = champions[p.championName.toLowerCase()];
        // 표시 이름: Riot ID 게임이름 우선, 없으면 구 소환사명.
        const displayName = p.riotIdGameName || p.summonerName || "Unknown";
        return {
          puuid: p.puuid,
          teamId: p.teamId, // 100/200 (협곡), 아레나에선 의미 없음
          champion: p.championName, // 영문 챔피언 ID
          championKo: info?.name ?? p.championName, // 한국어 이름
          championIcon: championIconUrl(version, info?.id ?? p.championName),
          name: displayName,
          tagLine: p.riotIdTagline ?? "",
          champLevel: p.champLevel,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: p.totalMinionsKilled + p.neutralMinionsKilled,
          damage: p.totalDamageDealtToChampions, // 챔피언 대상 딜량
          items: itemIcons(version, p), // 아이템 아이콘 URL 7칸
          spells: spellIcons(version, spells, p), // 소환사 주문 2개
          runes: runeIcons(runes, p), // 핵심룬/보조계열
          win: p.win,
          // 아레나: placement(개인 등수)가 있으면 그 값을, 없으면 서브팀 등수를 사용.
          placement: p.placement ?? p.subteamPlacement ?? 0,
          subteamId: p.playerSubteamId ?? 0, // 아레나 서브팀 묶음 ID
          isMe: p.puuid === account.puuid, // 본인 여부(화면에서 강조)
        };
      });

      return {
        matchId: m.metadata.matchId,
        queue: queueName(m.info.queueId, m.info.gameMode), // 한국어 큐 이름
        isArena, // 아레나 여부(프론트 분기용)
        durationSec: m.info.gameDuration,
        createdAt: m.info.gameCreation,
        // 아래는 "본인" 기준 요약 정보(목록 행에 바로 표시).
        champion: champName,
        championKo: champInfo?.name ?? champName,
        championIcon: championIconUrl(version, champInfo?.id ?? champName),
        champLevel: me?.champLevel ?? 0,
        kills: me?.kills ?? 0,
        deaths: me?.deaths ?? 0,
        assists: me?.assists ?? 0,
        cs,
        items: me ? itemIcons(version, me) : [], // 본인 아이템(기본 행 표시용)
        spells: me ? spellIcons(version, spells, me) : [], // 소환사 주문 2개
        runes: me
          ? runeIcons(runes, me)
          : { keystone: null, secondary: null }, // 핵심룬/보조계열
        positionIcon: positionIconUrl(me?.teamPosition), // 라인 아이콘
        placement: me?.placement ?? me?.subteamPlacement ?? 0, // 아레나 본인 등수
        win: me?.win ?? false,
        participants, // 상세 보기용 전체 참가자
      };
    });

    // === 함께 플레이한 소환사 집계 ===
    // 최근 경기들에서 "본인과 같은 팀"이었던 사람을 모아, 같이한 판수와 승수를 센다.
    // (협곡은 같은 teamId, 아레나는 같은 서브팀을 같은 팀으로 본다)
    const playedWithMap = new Map<
      string,
      { name: string; tagLine: string; games: number; wins: number }
    >();
    for (const m of matches) {
      const meP = m.info.participants.find((p) => p.puuid === account.puuid);
      if (!meP) continue;
      const isArena = m.info.gameMode === "CHERRY";
      for (const p of m.info.participants) {
        if (p.puuid === account.puuid) continue; // 본인 제외
        const sameTeam = isArena
          ? p.playerSubteamId === meP.playerSubteamId
          : p.teamId === meP.teamId;
        if (!sameTeam) continue; // 같은 팀이 아니면 제외
        const entry = playedWithMap.get(p.puuid) ?? {
          name: p.riotIdGameName || p.summonerName || "Unknown",
          tagLine: p.riotIdTagline ?? "",
          games: 0,
          wins: 0,
        };
        entry.games++;
        if (meP.win) entry.wins++; // 같은 팀이므로 본인 승=동반자 승
        playedWithMap.set(p.puuid, entry);
      }
    }
    // 2판 이상 함께한 사람만, 같이한 판수 → 승률 순으로 정렬.
    const playedWith = [...playedWithMap.values()]
      .filter((e) => e.games >= 2)
      .map((e) => ({
        name: e.name,
        tagLine: e.tagLine,
        games: e.games,
        wins: e.wins,
        losses: e.games - e.wins,
        winrate: Math.round((e.wins / e.games) * 100),
      }))
      .sort((a, b) => b.games - a.games || b.winrate - a.winrate);

    console.log(`[summoner] 조회 성공: ${account.gameName}#${account.tagLine}, 경기 ${recent.length}건`);

    // 최종 응답. 프론트가 그대로 화면에 그릴 수 있는 형태.
    return NextResponse.json({
      version, // 이미지 URL 버전(프론트에서 추가로 쓸 수 있음)
      account: {
        gameName: account.gameName,
        tagLine: account.tagLine,
        puuid: account.puuid,
      },
      summoner: {
        level: summoner.summonerLevel,
        profileIconId: summoner.profileIconId,
        profileIcon: profileIconUrl(version, summoner.profileIconId),
      },
      league,
      matches: recent,
      playedWith, // 함께 플레이한 소환사 목록
    });
  } catch (err) {
    // Riot API에서 온 에러는 상태 코드와 메시지를 그대로 전달.
    if (err instanceof RiotApiError) {
      console.error(`[summoner] Riot API 오류: status=${err.status}, message=${err.message}`);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // 그 외 예기치 못한 에러.
    console.error("[summoner] 알 수 없는 오류:", err);
    return NextResponse.json(
      { error: "서버에서 알 수 없는 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
