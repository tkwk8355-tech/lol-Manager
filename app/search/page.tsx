"use client";

import { useState } from "react";

interface LeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

interface Participant {
  puuid: string;
  teamId: number;
  champion: string;
  championKo: string;
  championIcon: string;
  name: string;
  tagLine: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  items: (string | null)[];
  spells: (string | null)[];
  runes: { keystone: string | null; secondary: string | null };
  win: boolean;
  placement: number;
  subteamId: number;
  isMe: boolean;
}

interface Match {
  matchId: string;
  queue: string;
  isArena: boolean;
  durationSec: number;
  createdAt: number;
  champion: string;
  championKo: string;
  championIcon: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  items: (string | null)[];
  spells: (string | null)[];
  runes: { keystone: string | null; secondary: string | null };
  positionIcon: string | null;
  placement: number;
  win: boolean;
  participants: Participant[];
}

interface PlayedWith {
  name: string;
  tagLine: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
}

interface SummonerData {
  version: string;
  account: { gameName: string; tagLine: string };
  summoner: { level: number; profileIcon: string };
  league: LeagueEntry[];
  matches: Match[];
  playedWith: PlayedWith[];
}

function kdaRatio(k: number, d: number, a: number) {
  if (d === 0) return "Perfect";
  return ((k + a) / d).toFixed(2);
}

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function duration(sec: number) {
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

const TIER_KO: Record<string, string> = {
  IRON: "아이언", BRONZE: "브론즈", SILVER: "실버", GOLD: "골드",
  PLATINUM: "플래티넘", EMERALD: "에메랄드", DIAMOND: "다이아",
  MASTER: "마스터", GRANDMASTER: "그랜드마스터", CHALLENGER: "챌린저",
};

function tierLabel(tier: string, rank: string) {
  const ko = TIER_KO[tier] ?? tier;
  return ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier) ? ko : `${ko} ${rank}`;
}

const TIER_COLOR: Record<string, string> = {
  IRON: "#8a8a8a", BRONZE: "#b06b3f", SILVER: "#9aa4ad", GOLD: "#e0b349",
  PLATINUM: "#4ec3c0", EMERALD: "#3fc380", DIAMOND: "#6aa3ff",
  MASTER: "#c879e6", GRANDMASTER: "#e25b5b", CHALLENGER: "#f0c14b",
};

function shortName(name: string) {
  return name.length > 7 ? `${name.slice(0, 7)}…` : name;
}

function tierEmblemUrl(tier: string) { return `/tiers/emblem-${tier.toLowerCase()}.png`; }
function tierName(tier: string) { return tier.charAt(0) + tier.slice(1).toLowerCase(); }
const DIVISION: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
function tierFull(tier: string, rank: string) {
  return ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier)
    ? tierName(tier)
    : `${tierName(tier)} ${DIVISION[rank] ?? rank}`;
}

function ordinal(n: number) { return `${n}위`; }

function Items({ icons }: { icons: (string | null)[] }) {
  return (
    <div className="items">
      {icons.map((src, i) => (
        <span className="item-slot" key={i}>
          {src ? <img src={src} alt="" width={22} height={22} /> : null}
        </span>
      ))}
    </div>
  );
}

function arenaSubteams(participants: Participant[]): Participant[][] {
  const groups: Record<number, Participant[]> = {};
  for (const p of participants) (groups[p.subteamId] ||= []).push(p);
  return Object.values(groups).sort((a, b) => (a[0]?.placement ?? 99) - (b[0]?.placement ?? 99));
}

function RankCard({ label, entry }: { label: string; entry?: LeagueEntry }) {
  if (!entry) {
    return (
      <div className="rank-card unranked">
        <div className="rank-label">{label}</div>
        <div className="rank-unranked-text">Unranked</div>
      </div>
    );
  }
  const total = entry.wins + entry.losses;
  const wr = total ? Math.round((entry.wins / total) * 100) : 0;
  return (
    <div className="rank-card">
      <div className="rank-label">{label}</div>
      <div className="rank-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tier-emblem" src={tierEmblemUrl(entry.tier)} alt={entry.tier} width={132} height={74} />
        <div className="rank-main">
          <div className="rank-tier" style={{ color: TIER_COLOR[entry.tier] ?? "var(--text)" }}>
            {tierFull(entry.tier, entry.rank)}
          </div>
          <div className="rank-lp">{entry.leaguePoints} LP</div>
        </div>
        <div className="rank-record">
          <div className="rank-wl">{entry.wins}승 {entry.losses}패</div>
          <div className="rank-winrate">승률 {wr}%</div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  p, maxDmg, teamColor, onSelect,
}: {
  p: Participant;
  maxDmg: number;
  teamColor: "blue" | "red";
  onSelect: (name: string, tag: string) => void;
}) {
  const dmgPercent = maxDmg > 0 ? (p.damage / maxDmg) * 100 : 0;
  return (
    <div className={`detail-row ${p.isMe ? "is-me" : ""}`}>
      <div className="detail-player">
        <div className="detail-champ">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.championIcon} alt={p.championKo} width={32} height={32} />
          <span className="detail-clevel">{p.champLevel}</span>
        </div>
        <div className="detail-spells">
          {p.spells.map((src, i) => src
            ? <img key={i} src={src} alt="" width={16} height={16} />
            : <span className="mini-empty" key={i} />
          )}
        </div>
        <div className="detail-runes">
          {p.runes.keystone && <img src={p.runes.keystone} alt="" width={16} height={16} />}
          {p.runes.secondary && <img src={p.runes.secondary} alt="" width={14} height={14} />}
        </div>
        <span
          className="detail-name"
          onClick={(e) => { e.stopPropagation(); p.tagLine && onSelect(p.name, p.tagLine); }}
          title={`${p.name}#${p.tagLine}`}
        >
          {p.name}
        </span>
      </div>
      <div className="detail-kda">
        <span>{p.kills}</span>/<span className="detail-deaths">{p.deaths}</span>/<span>{p.assists}</span>
      </div>
      <div className="detail-dmg-col">
        <span className="dmg-num">{p.damage.toLocaleString()}</span>
        <div className="dmg-bar-wrap">
          <div className={`dmg-bar dmg-bar-${teamColor}`} style={{ width: `${dmgPercent}%` }} />
        </div>
      </div>
      <div className="detail-items">
        <Items icons={p.items} />
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [data, setData] = useState<SummonerData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Record<string, { tier: string; rank: string }>>({});
  const [current, setCurrent] = useState<{ name: string; tag: string } | null>(null);

  async function loadTiers(m: Match) {
    const need = m.participants.map((p) => p.puuid).filter((pu) => !(pu in tiers));
    if (need.length === 0) return;
    try {
      const res = await fetch(`/api/tiers?puuids=${need.join(",")}`);
      const json = await res.json();
      if (res.ok && json.tiers) setTiers((prev) => ({ ...prev, ...json.tiers }));
    } catch {}
  }

  function toggleExpand(m: Match) {
    const opening = expanded !== m.matchId;
    setExpanded(opening ? m.matchId : null);
    if (opening) loadTiers(m);
  }

  async function fetchData(name: string, tag: string, refresh = false) {
    setError("");
    if (!refresh) { setData(null); setExpanded(null); }
    const url = `/api/summoner?gameName=${encodeURIComponent(name)}&tagLine=${encodeURIComponent(tag)}${refresh ? "&refresh=1" : ""}`;
    console.log("[fetchData] 요청:", url);
    try {
      const res = await fetch(url);
      console.log("[fetchData] 응답 상태:", res.status);
      const json = await res.json();
      if (!res.ok) {
        console.error("[fetchData] 오류 응답:", json);
        setError(json.error || "문제가 발생했습니다.");
      } else {
        console.log("[fetchData] 조회 성공:", json.account);
        setData(json); setCurrent({ name, tag });
      }
    } catch (err) {
      console.error("[fetchData] 네트워크 오류:", err);
      setError("네트워크 오류입니다. 다시 시도해주세요.");
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const name = gameName.trim();
    const tag = tagLine.trim();
    if (!name || !tag) { setError("소환사명과 태그를 모두 입력하세요."); return; }
    setLoading(true);
    await fetchData(name, tag, false);
    setLoading(false);
  }

  async function handleRefresh() {
    if (!current) return;
    setRefreshing(true);
    await fetchData(current.name, current.tag, true);
    setRefreshing(false);
  }

  async function searchAccount(name: string, tag: string) {
    setGameName(name);
    setTagLine(tag);
    setLoading(true);
    await fetchData(name, tag, false);
    setLoading(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "#") { e.preventDefault(); document.getElementById("tag-input")?.focus(); }
  }

  const solo = data?.league.find((l) => l.queueType === "RANKED_SOLO_5x5");
  const flex = data?.league.find((l) => l.queueType === "RANKED_FLEX_SR");

  return (
    <>
      <form className="search-form" onSubmit={handleSearch}>
        <div className="riot-id-input">
          <input className="name-input" value={gameName} onChange={(e) => setGameName(e.target.value)} onKeyDown={onNameKeyDown} placeholder="소환사명" aria-label="소환사명" />
          <span className="hash">#</span>
          <input id="tag-input" className="tag-input" value={tagLine} onChange={(e) => setTagLine(e.target.value)} placeholder="태그" aria-label="태그" />
        </div>
        <button type="submit" disabled={loading}>{loading ? "검색 중..." : "검색"}</button>
      </form>

      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <section className="profile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="profile-icon" src={data.summoner.profileIcon} alt="profile icon" width={84} height={84} />
            <div className="profile-info">
              <h2>{data.account.gameName}<span className="tag">#{data.account.tagLine}</span></h2>
              {solo && (
                <div className="tier-badge-row">
                  <span className={`tier-badge tier-${solo.tier.toLowerCase()}`}>{tierLabel(solo.tier, solo.rank)}</span>
                </div>
              )}
              <div className="level-row">
                <span className="level">레벨 {data.summoner.level}</span>
                <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
                  {refreshing ? "갱신 중..." : "전적 갱신"}
                </button>
              </div>
            </div>
          </section>

          <div className="content-grid">
            <aside className="sidebar">
              <RankCard label="솔로랙크" entry={solo} />
              <RankCard label="자유랙크" entry={flex} />
              <div className="panel">
                <h3 className="panel-title">함께 플레이한 소환사 <span>(최근 10판)</span></h3>
                {data.playedWith.length === 0 ? (
                  <p className="empty">2판 이상 함께한 소환사가 없습니다.</p>
                ) : (
                  <ul className="played-with">
                    {data.playedWith.map((pw) => (
                      <li className="pw-row" key={`${pw.name}#${pw.tagLine}`} onClick={() => pw.tagLine && searchAccount(pw.name, pw.tagLine)} title={`${pw.name}#${pw.tagLine}`}>
                        <span className="pw-name">{shortName(pw.name)}<span className="pw-tag">#{pw.tagLine}</span></span>
                        <span className="pw-wl">{pw.wins}승 {pw.losses}패</span>
                        <span className="pw-games">{pw.games}판</span>
                        <span className="pw-rate" style={{ color: pw.winrate >= 60 ? "var(--loss-text)" : "var(--text)" }}>{pw.winrate}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            <div className="main-col">
              <div className="matches-header">
                <h3 className="section-title">최근 전적</h3>
              </div>

              <section className="matches">
                {data.matches.length === 0 && <p>최근 전적이 없습니다.</p>}
                {data.matches.map((m) => {
                  const blue = m.participants.filter((p) => p.teamId === 100);
                  const red = m.participants.filter((p) => p.teamId === 200);
                  const isOpen = expanded === m.matchId;
                  const resultLabel = m.isArena ? ordinal(m.placement) : m.win ? "승리" : "패배";
                  const winLike = m.isArena ? m.placement === 1 : m.win;
                  const maxDmg = Math.max(...m.participants.map((p) => p.damage), 1);

                  return (
                    <div className="match-wrap" key={m.matchId}>
                      {/* ── 요약 행: match 박스 안에 팀 목록 포함 ── */}
                      <div
                        className={`match ${winLike ? "win" : "loss"}`}
                        onClick={() => toggleExpand(m)}
                      >
                        {/* 왼쪽: 메타 + 챔피언 + 스펠룬 + KDA + 아이템 */}
                        <div className="match-left">
                          <div className="match-meta">
                            <div className="queue-name">{m.queue}</div>
                            <div className="time">{timeAgo(m.createdAt)}</div>
                            <div className="result-text">{resultLabel}</div>
                            <div className="duration">{duration(m.durationSec)}</div>
                          </div>

                          {/* 챔피언 블록: [아이콘+스펠/룬 위줄] + KDA 오른쪽, 아래줄에 아이템 */}
                          <div className="champ-block">
                            <div className="champ-top-row">
                              <div className="champ-icon-wrap">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="champ-icon" src={m.championIcon} alt={m.championKo} width={60} height={60} />
                                <span className="champ-level">{m.champLevel}</span>
                              </div>
                              <div className="champ-spellrune">
                                <div className="spell-col">
                                  {m.spells.map((src, i) => src
                                    ? <img key={i} src={src} alt="spell" width={22} height={22} />
                                    : <span className="spell-empty" key={i} />
                                  )}
                                </div>
                                <div className="rune-col">
                                  {m.runes.keystone && <img src={m.runes.keystone} alt="keystone" width={22} height={22} />}
                                  {m.runes.secondary && <img src={m.runes.secondary} alt="secondary rune" width={22} height={22} />}
                                </div>
                              </div>
                              {m.positionIcon && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="position-icon" src={m.positionIcon} alt="position" width={18} height={18} />
                              )}
                              <div className="kda-box">
                                <div className="kda">{m.kills} / <span className="deaths">{m.deaths}</span> / {m.assists}</div>
                                <div className="kda-ratio">{kdaRatio(m.kills, m.deaths, m.assists)} 평점</div>
                              </div>
                            </div>
                            <div className="champ-bottom-row">
                              <Items icons={m.items} />
                            </div>
                          </div>
                        </div>

                        {/* 오른쪽: 양팀 참가자 목록 */}
                        {!m.isArena && (
                          <div className="match-teams" onClick={(e) => e.stopPropagation()}>
                            <div className="team-column blue-team">
                              {blue.slice(0, 5).map((p) => (
                                <div key={p.puuid} className={`team-player ${p.isMe ? "is-me" : ""}`}
                                  onClick={() => p.tagLine && searchAccount(p.name, p.tagLine)}
                                  title={`${p.name}#${p.tagLine}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={p.championIcon} alt={p.championKo} width={20} height={20} className="mini-champ" />
                                  <span className="player-name">{p.name}</span>
                                </div>
                              ))}
                            </div>
                            <div className="team-column red-team">
                              {red.slice(0, 5).map((p) => (
                                <div key={p.puuid} className={`team-player ${p.isMe ? "is-me" : ""}`}
                                  onClick={() => p.tagLine && searchAccount(p.name, p.tagLine)}
                                  title={`${p.name}#${p.tagLine}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={p.championIcon} alt={p.championKo} width={20} height={20} className="mini-champ" />
                                  <span className="player-name">{p.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="expand-toggle">{isOpen ? "▲" : "▼"}</div>
                      </div>

                      {/* ── 상세 펼침: 데미지 그래프 ── */}
                      {isOpen && !m.isArena && (
                        <div className="match-detail">
                          <div className="detail-section blue">
                            <div className="detail-head">
                              <span className={blue[0]?.win ? "detail-win" : "detail-loss"}>{blue[0]?.win ? "승리" : "패배"}</span>
                              <span className="detail-team-label"> (블루팀)</span>
                            </div>
                            {blue.map((p) => (
                              <DetailRow key={p.puuid} p={p} maxDmg={maxDmg} teamColor="blue" onSelect={searchAccount} />
                            ))}
                          </div>
                          <div className="detail-section red">
                            <div className="detail-head">
                              <span className={red[0]?.win ? "detail-win" : "detail-loss"}>{red[0]?.win ? "승리" : "패배"}</span>
                              <span className="detail-team-label"> (레드팀)</span>
                            </div>
                            {red.map((p) => (
                              <DetailRow key={p.puuid} p={p} maxDmg={maxDmg} teamColor="red" onSelect={searchAccount} />
                            ))}
                          </div>
                        </div>
                      )}

                      {isOpen && m.isArena && (
                        <div className="match-detail">
                          {arenaSubteams(m.participants).map((team, i) => {
                            const teamMaxDmg = Math.max(...team.map((p) => p.damage), 1);
                            const isMine = team.some((p) => p.isMe);
                            return (
                              <div key={i} className={`detail-section ${isMine ? "blue" : "red"}`}>
                                <div className="detail-head">
                                  <span className="detail-team-label">{ordinal(team[0]?.placement ?? i + 1)}</span>
                                </div>
                                {team.map((p) => (
                                  <DetailRow key={p.puuid} p={p} maxDmg={teamMaxDmg} teamColor={isMine ? "blue" : "red"} onSelect={searchAccount} />
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
