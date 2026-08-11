import { NextRequest, NextResponse } from "next/server";
import { getAccountByRiotId, getMatch } from "@/lib/riot";

// GET /api/test-custom?gameName=부처믿는예수&tagLine=KR1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName")?.trim();
  const tagLine = searchParams.get("tagLine")?.trim();

  if (!gameName || !tagLine)
    return NextResponse.json({ error: "gameName, tagLine 필요" }, { status: 400 });

  const API_KEY = process.env.RIOT_API_KEY;
  const account = await getAccountByRiotId(gameName, tagLine);

  const url = `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${account.puuid}/ids?queue=0&count=20`;
  const res = await fetch(url, { headers: { "X-Riot-Token": API_KEY! }, cache: "no-store" });
  const customIds: string[] = res.ok ? await res.json() : [];

  const details = await Promise.all(customIds.slice(0, 5).map((id) => getMatch(id)));

  const matches = details.map((m) => ({
    matchId: m.metadata.matchId,
    playedAt: new Date(m.info.gameCreation).toLocaleString("ko-KR"),
    duration: `${Math.floor(m.info.gameDuration / 60)}분 ${m.info.gameDuration % 60}초`,
    participants: m.info.participants.map((p) => ({
      name: p.riotIdGameName || p.summonerName,
      champion: p.championName,
      kda: `${p.kills}/${p.deaths}/${p.assists}`,
      win: p.win,
    })),
  }));

  return NextResponse.json({ puuid: account.puuid, customMatchCount: customIds.length, matches });
}
