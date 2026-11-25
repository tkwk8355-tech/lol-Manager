"use client";

// =============================================================
// 경매 진행 화면 (팀장 입찰 / 운영진 진행)
// - 0.5초마다 세션 상태를 폴링한다.
// - 낙찰/다음 처리 흐름(awarded, frozenPlayer, awardCd ...)은 기존 동작을 그대로 유지한다.
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import AuctionTimer from "./AuctionTimer";
import {
  LineIcon, LINES, LINE_LABEL, TEAM_COLORS, introUrl, bannerUrl, shrinkImage,
  type AuctionBid, type AuctionPlayer, type AuctionSession,
} from "./shared";

const BID_STEPS = [5, 10, 50, 100] as const;
const teamVar = (color: string) => ({ ["--team" as string]: color }) as React.CSSProperties;

export default function AuctionRoom({sessionId,isAdmin,isOwner,myUserId}:{sessionId:number;isAdmin:boolean;isOwner:boolean;myUserId:number|null}){
  const [session,setSession]=useState<AuctionSession|null>(null);
  const [players,setPlayers]=useState<AuctionPlayer[]>([]);
  const [bids,setBids]=useState<AuctionBid[]>([]);
  const [serverNow,setServerNow]=useState<number|null>(null);
  const [bidErr,setBidErr]=useState("");
  const [bidLoading,setBidLoading]=useState(false);
  const [awarded,setAwarded]=useState(false);
  const [awardedTopBid,setAwardedTopBid]=useState<AuctionBid|null>(null);
  const [frozenPlayer,setFrozenPlayer]=useState<AuctionPlayer|null>(null);
  const [awardCd,setAwardCd]=useState<number|null>(null);
  const [nexting,setNexting]=useState(false);
  const pollRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const prevTopRef=useRef<number>(0);
  const timerResetRef=useRef<(()=>void)|null>(null);
  const prevPlayerIdRef=useRef<number|null>(null);
  const nextingRef=useRef(false);
  const awardingRef=useRef(false);
  const captains=players.filter(p=>p.is_captain===1);
  const nonCaptains=players.filter(p=>p.is_captain===0);
  const timerStartedAt=session?.timer_started?(session.timer_started_at??null):null;
  const currentPlayer=session?nonCaptains.filter(p=>p.team_id===null)[0]??null:null;
  // 낙찰 표시: awarded state(어드민) 또는 timer_started=0이고 frozenPlayer가 있으면(팀장)
  const displayPlayer=awarded?frozenPlayer:currentPlayer;
  const activePlayer=displayPlayer??currentPlayer;
  const bidSourcePlayer=awarded?frozenPlayer:currentPlayer;
  const currentBids=bidSourcePlayer?bids.filter(b=>b.player_id===bidSourcePlayer.id):[];
  const topBid=awarded?awardedTopBid:currentBids.reduce<AuctionBid|null>((top,b)=>(!top||b.points>top.points)?b:top,null);
  const topBidRef=useRef(topBid);topBidRef.current=topBid;
  const sessionRef=useRef(session);sessionRef.current=session;
  const myCaptain=myUserId?captains.find(c=>c.user_id===myUserId)??null:null;
  const awardedRef=useRef(false);
  awardedRef.current=awarded;
  const myUserIdRef=useRef(myUserId);myUserIdRef.current=myUserId;
  const prevCurrentIdxRef=useRef<number|null>(null);
  const prevTimerStartedRef=useRef<number|null>(null);
  const load=useCallback(async()=>{
    const res=await fetch("/api/auction?sessionId="+sessionId);
    if(!res.ok)return;
    const json=await res.json();
    const s=json.session;
    if(s&&s.timer_started_at!=null)s.timer_started_at=Number(s.timer_started_at);
    const nc=(json.players as AuctionPlayer[]).filter(p=>p.is_captain===0);
    // timer_started 1→0: 낙찰 완료
    if(prevTimerStartedRef.current===1&&s?.timer_started===0&&!nextingRef.current&&!awardedRef.current){
      const prevPlayer=nc.find(p=>p.id===prevPlayerIdRef.current)??null;
      const allBids=json.bids as AuctionBid[];
      const tb=allBids.filter(b=>b.player_id===(prevPlayer?.id??-1)).reduce<AuctionBid|null>((top,b)=>(!top||b.points>top.points)?b:top,null);
      if(tb&&prevPlayer){setFrozenPlayer(prevPlayer);setAwardedTopBid(tb);setAwarded(true);}
    }
    // current_idx 증가 감지: 어드민이 다음 누름 → 팀장 화면 리셋
    const isCaptain=!!(myUserIdRef.current&&(json.players as AuctionPlayer[]).find(p=>p.is_captain===1&&p.user_id===myUserIdRef.current));
    if(isCaptain&&awardedRef.current&&prevCurrentIdxRef.current!==null&&s?.current_idx!==prevCurrentIdxRef.current){
      setAwarded(false);setAwardedTopBid(null);setFrozenPlayer(null);setAwardCd(null);prevTopRef.current=0;
      prevPlayerIdRef.current=nc.filter(p=>p.team_id===null)[0]?.id??null;
    }
    prevTimerStartedRef.current=s?.timer_started??null;
    prevCurrentIdxRef.current=s?.current_idx??null;
    setSession(s);setPlayers(json.players);setBids(json.bids);setServerNow(json.serverNow??null);
  },[sessionId]);
  useEffect(()=>{
    load();
    pollRef.current=setInterval(load,500);
    return()=>{if(pollRef.current)clearInterval(pollRef.current);};
  },[load]);
  useEffect(()=>{
    const newTop=topBid?.points??0;
    if(newTop>prevTopRef.current&&!awardingRef.current){prevTopRef.current=newTop;setAwardCd(null);}
  },[topBid?.points]);
  useEffect(()=>{
    const pid=currentPlayer?.id??null;
    if(pid!==prevPlayerIdRef.current&&!nextingRef.current&&!awardedRef.current){
      prevPlayerIdRef.current=pid;timerResetRef.current?.();
      setAwarded(false);setAwardedTopBid(null);setFrozenPlayer(null);setAwardCd(null);prevTopRef.current=0;
    }
  },[currentPlayer?.id]);
  // 타이머 0초 도달 여부 (새 타이머가 시작되면 해제)
  const [timeUp,setTimeUp]=useState(false);
  useEffect(()=>{setTimeUp(false);},[timerStartedAt]);
  function onTimerEnd(){setTimeUp(true);if(sessionRef.current?.status==="running"){if(topBidRef.current)setAwardCd(1);else setAwarded(true);}}
  const handleAwardRef=useRef(handleAward);handleAwardRef.current=handleAward;
  useEffect(()=>{
    if(awardCd===null)return;
    if(awardCd<=0){if(isAdmin&&!awardingRef.current)handleAwardRef.current();return;}
    const t=setTimeout(()=>setAwardCd(prev=>(prev??1)-1),1000);
    return()=>clearTimeout(t);
  },[awardCd,isAdmin]);
  async function handleAward(){
    if(awardingRef.current)return;
    awardingRef.current=true;
    const wonBid=topBidRef.current;
    const frozen=currentPlayer;
    setFrozenPlayer(frozen);setAwarded(true);setAwardedTopBid(wonBid);
    try{
      const res=await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"award",sessionId})});
      const json=await res.json().catch(()=>({}));
      if(!res.ok){
        // 서버 기준 아직 입찰 시간이 남음(시계 오차 등) → 낙찰 표시 되돌리고 1초 뒤 재시도
        setAwarded(false);setAwardedTopBid(null);setFrozenPlayer(null);
        if(res.status===409)setAwardCd(1);else setAwardCd(null);
        return;
      }
      // 화면 표시는 서버가 실제로 낙찰 처리한 입찰 기준
      if(json.bid){
        setAwardedTopBid({...json.bid,points:Number(json.bid.points)});
        if(frozen&&json.playerId!==frozen.id){
          const p=players.find(pl=>pl.id===json.playerId);if(p)setFrozenPlayer(p);
        }
      }
      await load();
      setAwardCd(null);prevTopRef.current=0;timerResetRef.current?.();
    }finally{
      awardingRef.current=false;
    }
  }
  async function handleNext(){
    nextingRef.current=true;setNexting(true);
    setAwarded(false);setAwardedTopBid(null);setFrozenPlayer(null);setAwardCd(null);prevTopRef.current=0;timerResetRef.current?.();
    if(!topBidRef.current){
      await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"award",sessionId})});
    }
    await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"next",sessionId})});
    const res=await fetch("/api/auction?sessionId="+sessionId);
    if(res.ok){
      const json=await res.json();
      const s=json.session;
      if(s&&s.timer_started_at!=null)s.timer_started_at=Number(s.timer_started_at);
      setSession(s);setPlayers(json.players);setBids(json.bids);setServerNow(json.serverNow??null);
      const nc=(json.players as AuctionPlayer[]).filter(p=>p.is_captain===0);
      prevPlayerIdRef.current=nc.filter(p=>p.team_id===null)[0]?.id??null;
    }
    nextingRef.current=false;setNexting(false);
  }
  async function handleBid(pts:number){
    if(!myCaptain)return;
    setBidLoading(true);setBidErr("");
    try{
      const res=await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"bid",sessionId,captainPlayerId:myCaptain.id,points:pts})});
      const json=await res.json();
      if(!res.ok){setBidErr(json.error||"입찰 실패");return;}
      load();
    }catch{setBidErr("네트워크 오류");}finally{setBidLoading(false);}
  }
  function getTeam(capId:number){return nonCaptains.filter(p=>p.team_id===capId);}
  function getUsed(capId:number){
    return nonCaptains
      .filter(p=>p.team_id===capId)
      .reduce((s,p)=>{
        const won=bids.filter(b=>b.player_id===p.id&&b.captain_id===capId).reduce((m,b)=>Math.max(m,b.points),0);
        return s+won;
      },0);
  }
  // 팀장 순서대로 팀 색상을 배정한다.
  function capColor(capId:number){const idx=captains.findIndex(c=>c.id===capId);return TEAM_COLORS[(idx<0?0:idx)%TEAM_COLORS.length];}
  async function patchAction(action:"start"|"reset"|"timer_start"){
    await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,sessionId})});
    load();
  }
  // ---------- 경매 플랜카드 (경매 시작 전 대기 화면) ----------
  const bannerFileRef=useRef<HTMLInputElement>(null);
  const [bannerBusy,setBannerBusy]=useState(false);
  const [bannerErr,setBannerErr]=useState("");
  async function uploadBanner(file:File){
    setBannerBusy(true);setBannerErr("");
    try{
      const fd=new FormData();
      fd.append("sessionId",String(sessionId));
      fd.append("file",await shrinkImage(file),"banner");
      const res=await fetch("/api/auction/banner",{method:"PUT",body:fd});
      if(!res.ok){const j=await res.json().catch(()=>({}));setBannerErr(j.error||"플랜카드 업로드 실패");return;}
      await load();
    }catch{setBannerErr("네트워크 오류");}finally{setBannerBusy(false);}
  }
  async function removeBanner(){
    if(!confirm("플랜카드를 삭제할까요?"))return;
    setBannerBusy(true);setBannerErr("");
    try{
      await fetch("/api/auction/banner",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId})});
      await load();
    }finally{setBannerBusy(false);}
  }
  const isDone=session?.status==="done";
  const isRunning=session?.status==="running";
  const isWaiting=session?.status==="waiting";
  const remaining=nonCaptains.filter(p=>p.team_id===null).sort((a,b)=>a.sort_order-b.sort_order);
  const soldCount=nonCaptains.filter(p=>p.team_id!==null).length;
  const timer=<AuctionTimer onEnd={onTimerEnd} resetRef={timerResetRef} startedAt={nexting?null:timerStartedAt} serverNow={serverNow}/>;

  // 내 팀장 기준 입찰 가능 여부 계산
  const cpLine=currentPlayer?.roster_line??null;
  // 팀 경매는 팀장이 선수가 아니므로 팀장 라인을 비워 두고 5라인 모두 경매한다.
  const isTeamAuction=session?.auction_type==="team";
  const capLine=(cap:AuctionPlayer)=>isTeamAuction?null:cap.roster_line;
  const myLineBlocked=!!myCaptain&&!!cpLine&&(capLine(myCaptain)===cpLine||getTeam(myCaptain.id).some(p=>p.roster_line===cpLine));
  const myCurrentBid=myCaptain&&currentPlayer?bids.filter(b=>b.player_id===currentPlayer.id&&b.captain_id===myCaptain.id).reduce((m,b)=>Math.max(m,b.points),0):0;
  const myLeft=myCaptain?myCaptain.points-getUsed(myCaptain.id):0;

  // 무대 강조색: 최고 입찰 팀 색 (없으면 기본 강조색)
  const heroColor=topBid?capColor(topBid.captain_id):"var(--accent)";
  const queueBase=isRunning?remaining.filter(p=>p.id!==currentPlayer?.id):remaining;
  // 선수 소개 단계: 입찰 시작(타이머) 전이고 소개사진이 있으면 사진을 먼저 크게 보여준다.
  const introSrc=activePlayer?introUrl(activePlayer.member_id,activePlayer.intro_ver):null;
  const showIntro=!!(isRunning&&activePlayer&&introSrc&&!timerStartedAt&&!awarded&&!nexting);
  // 다음 선수 소개사진은 미리 받아 둔다 (다음 선수로 넘어갈 때 바로 뜨도록)
  const nextIntroSrc=queueBase[0]?introUrl(queueBase[0].member_id,queueBase[0].intro_ver):null;
  const upcoming=queueBase.slice(0,10);
  // 경매 시작 전(대기 중)에는 플랜카드를 먼저 크게 보여준다.
  const bannerSrc=session?bannerUrl(session.id,session.banner_ver):null;
  const canManage=isAdmin&&!myCaptain;
  const total=nonCaptains.length;

  return(
    <div className="auc-arena">
      {/* ================= 무대 (현재 경매) ================= */}
      <section className={"auc-hero"+(awarded&&topBid?" sold":"")} style={teamVar(heroColor)}>
        <div className="auc-hero-glow"/>
        {nextIntroSrc&&<link rel="preload" as="image" href={nextIntroSrc}/>}

        {isWaiting&&bannerSrc&&(
          <div className="auc-intro auc-banner" key={String(session?.banner_ver)}>
            <div className="auc-hero-top">
              <span className="auc-live intro"><i/>COMING UP</span>
              <span className="auc-hero-count">팀장 {captains.length} · 선수 {total}</span>
            </div>
            <img className="auc-intro-img" src={bannerSrc} alt="경매 플랜카드"/>
            <div className="auc-intro-foot">
              {canManage
                ?<button className="auc-cta sm" onClick={()=>patchAction("start")}>▶ 경매 시작</button>
                :<span className="auc-intro-wait">운영진이 경매를 시작할 때까지 기다려 주세요</span>}
            </div>
          </div>
        )}
        {isWaiting&&!bannerSrc&&(
          <div className="auc-hero-state">
            <div className="auc-eyebrow">READY</div>
            <div className="auc-hero-title">경매 대기 중</div>
            <p>팀장 {captains.length}명 · 선수 {total}명이 준비됐어요.</p>
            {canManage
              ?<button className="auc-cta" onClick={()=>patchAction("start")}>경매 시작</button>
              :<p className="dim">운영진이 경매를 시작할 때까지 기다려 주세요.</p>}
          </div>
        )}
        {isWaiting&&canManage&&(
          <div className="auc-banner-tools">
            <button className="auc-ghost-btn" disabled={bannerBusy} onClick={()=>bannerFileRef.current?.click()}>
              {bannerBusy?"올리는 중…":bannerSrc?"플랜카드 변경":"🖼 플랜카드 올리기"}
            </button>
            {bannerSrc&&<button className="auc-ghost-btn" disabled={bannerBusy} onClick={removeBanner}>삭제</button>}
            {bannerErr&&<span className="auc-banner-err">{bannerErr}</span>}
            <input ref={bannerFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
              onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)uploadBanner(f);}}/>
          </div>
        )}
        {isDone&&(
          <div className="auc-hero-state">
            <div className="auc-eyebrow">FINISHED</div>
            <div className="auc-hero-title">경매 완료!</div>
            <p>모든 선수의 팀이 정해졌어요. 아래에서 최종 팀을 확인하세요.</p>
            {isAdmin&&<button className="auc-ghost-btn" onClick={()=>patchAction("reset")}>재경매</button>}
          </div>
        )}
        {isRunning&&!activePlayer&&(
          <div className="auc-hero-state"><div className="auc-hero-title">모든 선수 경매 완료</div></div>
        )}

        {showIntro&&(
          <div className="auc-intro" key={activePlayer!.id}>
            <div className="auc-hero-top">
              <span className="auc-live intro"><i/>PLAYER INTRO</span>
              <span className="auc-hero-count">{Math.min(soldCount+1,total)} <em>/ {total}</em></span>
              <div className="auc-progress-track"><span style={{width:`${total?(soldCount/total)*100:0}%`}}/></div>
            </div>
            <img className="auc-intro-img" src={introSrc!} alt={activePlayer!.nickname+" 소개"}/>
            <div className="auc-intro-foot">
              {isAdmin&&!myCaptain
                ?<button className="auc-cta sm" onClick={()=>patchAction("timer_start")}>▶ 입찰 시작</button>
                :<span className="auc-intro-wait">운영진이 입찰을 시작하면 바로 경매가 시작돼요</span>}
            </div>
          </div>
        )}

        {isRunning&&activePlayer&&!showIntro&&(
          <>
            <div className="auc-hero-top">
              <span className="auc-live"><i/>LIVE</span>
              <span className="auc-hero-count">{Math.min(soldCount+1,total)} <em>/ {total}</em></span>
              <div className="auc-progress-track"><span style={{width:`${total?(soldCount/total)*100:0}%`}}/></div>
            </div>

            <div className="auc-hero-main">
              <div className="auc-hero-player">
                <div className="auc-eyebrow">NOW BIDDING</div>
                <div className="auc-hero-name">{activePlayer.nickname}</div>
                <div className="auc-hero-meta">
                  {activePlayer.roster_line&&<span className="auc-pill"><LineIcon line={activePlayer.roster_line} size={18}/>{LINE_LABEL[activePlayer.roster_line]??activePlayer.roster_line}</span>}
                  {activePlayer.solo_tier&&<span className="auc-pill tier">{activePlayer.solo_tier} {activePlayer.solo_rank}</span>}
                </div>
              </div>

              <div className="auc-hero-timer">{timer}</div>

              <div className="auc-hero-bid">
                <div className="auc-eyebrow">{awarded&&topBid?"낙찰":"최고 입찰"}</div>
                {topBid?(
                  <div className="auc-topbid" key={topBid.id}>
                    <div className="auc-topbid-pt">{topBid.points}<small>pt</small></div>
                    <div className="auc-topbid-who"><span className="dot"/>{topBid.captain_name}</div>
                  </div>
                ):(
                  <div className="auc-topbid empty"><div className="auc-topbid-pt">—</div><div className="auc-topbid-who">아직 입찰 없음</div></div>
                )}
              </div>
            </div>

            {(awardCd!==null&&awardCd>0&&timerStartedAt===null&&!awarded&&topBid)&&(
              <div className="auc-hero-banner warn">{topBid.captain_name} 낙찰 확정 중…</div>
            )}
            {awarded&&topBid&&(
              <div className="auc-hero-banner sold">🏆 {topBid.captain_name} 팀 낙찰 · {topBid.points}pt</div>
            )}
            {!currentPlayer&&<div className="auc-hero-banner">모든 선수 경매 완료</div>}
          </>
        )}
      </section>

      {/* ================= 팀장 입찰 바 ================= */}
      {isRunning&&activePlayer&&myCaptain&&(
        <section className="auc-bidbar" style={teamVar(capColor(myCaptain.id))}>
          <div className="auc-bidbar-info">
            <div className="auc-eyebrow">내 잔여 포인트</div>
            <div className="auc-bidbar-pt">{myLeft}<small>pt</small></div>
            {myLineBlocked
              ?<div className="auc-bidbar-warn">이미 {LINE_LABEL[cpLine!]??cpLine} 라인 보유 중 · 입찰 불가</div>
              :bidErr?<div className="auc-bidbar-warn">{bidErr}</div>
              :<div className="auc-bidbar-hint">{timerStartedAt?(timeUp||awardCd!==null?"입찰 마감 · 낙찰 확정 중":"버튼을 눌러 바로 입찰하세요"):"입찰 시작을 기다리는 중"}</div>}
          </div>
          <div className="auc-bid-btns">
            {BID_STEPS.map((n,i)=>{
              const next=(topBid?.points??0)+n;
              const remain=myCaptain.points-getUsed(myCaptain.id)-myCurrentBid;
              const dis=bidLoading||myLineBlocked||next>remain+myCurrentBid||awarded||!timerStartedAt||timeUp||awardCd!==null;
              return(
                <button key={n} className={"auc-bid-btn t"+i} onClick={()=>handleBid(next)} disabled={dis}>
                  <small>+{n}</small>
                  <span>{next}<em>pt</em></span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ================= 운영진 진행 바 ================= */}
      {isAdmin&&!myCaptain&&(isRunning||isWaiting)&&(
        <section className="auc-ctrlbar">
          <div className="auc-ctrl-btns">
            {isRunning&&activePlayer&&!timerStartedAt&&!awarded&&!showIntro&&<button className="auc-cta sm" onClick={()=>patchAction("timer_start")}>▶ 입찰 시작</button>}
            {showIntro&&<span className="auc-ctrl-status">선수 소개 중 · 위에서 입찰을 시작하세요</span>}
            {isRunning&&awarded&&<button className="auc-cta sm go" onClick={handleNext}>다음 선수 →</button>}
            {isRunning&&timerStartedAt&&!awarded&&<span className="auc-ctrl-status">입찰 진행 중…</span>}
            {isWaiting&&<span className="auc-ctrl-status">경매 시작 전</span>}
          </div>
          {isOwner&&<div className="auc-queue-strip">
            <span className="auc-eyebrow">다음 순서</span>
            <div className="auc-queue-chips">
              {upcoming.map((pl,i)=>(<span key={pl.id} className="auc-qchip"><b>{i+1}</b>{pl.nickname}<LineIcon line={pl.roster_line} size={13} dim/></span>))}
              {queueBase.length>upcoming.length&&<span className="auc-qchip more">+{queueBase.length-upcoming.length}</span>}
              {upcoming.length===0&&<span className="auc-qchip more">없음</span>}
            </div>
          </div>}
        </section>
      )}

      {/* ================= 팀 보드 + 입찰 피드 ================= */}
      <div className="auc-lower">
        <section className="auc-board">
          {captains.map(cap=>{
            const team=getTeam(cap.id);const used=getUsed(cap.id);const left=cap.points-used;const isMe=myCaptain?.id===cap.id;
            const leading=!!topBid&&topBid.captain_id===cap.id&&isRunning;
            return(
              <div key={cap.id} className={"auc-tcard"+(isMe?" me":"")+(leading?" leading":"")} style={teamVar(capColor(cap.id))}>
                <div className="auc-tcard-head">
                  <div className="auc-tcard-title">
                    <span className="auc-tcard-name">{cap.nickname}</span>
                    {isMe&&<span className="auc-tag">MY TEAM</span>}
                    {leading&&<span className="auc-tag hot">최고 입찰</span>}
                  </div>
                  <div className={"auc-tcard-pt"+(left<200?" low":"")}>{left}<small>/{cap.points}</small></div>
                  <div className="auc-tcard-bar"><span style={{width:`${cap.points?Math.max(0,left)/cap.points*100:0}%`}}/></div>
                </div>
                <div className="auc-tcard-slots">
                  {LINES.map(line=>{
                    const isCaptainLine=capLine(cap)===line;
                    const member=isCaptainLine?cap:team.find(pl=>pl.roster_line===line)??null;
                    const wonPts=member&&!isCaptainLine?bids.filter(b=>b.player_id===member.id&&b.captain_id===cap.id).reduce((m,b)=>Math.max(m,b.points),0):null;
                    const target=!member&&!!cpLine&&cpLine===line&&isRunning;
                    return(
                      <div key={line} className={"auc-tslot"+(member?" filled":"")+(isCaptainLine?" cap":"")+(target?" target":"")}>
                        <LineIcon line={line} size={16} dim={!member}/>
                        {member
                          ?<><span className="nm">{member.nickname}</span>{isCaptainLine?<em className="c">C</em>:wonPts!==null&&<em>{wonPts}</em>}</>
                          :<span className="empty">{LINE_LABEL[line]}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="auc-feed">
          <div className="auc-feed-head"><span className="auc-eyebrow">입찰 현황</span>{currentBids.length>0&&<span className="auc-feed-n">{currentBids.length}건</span>}</div>
          {currentBids.length===0&&<div className="auc-feed-empty">아직 입찰이 없어요</div>}
          <ol className="auc-feed-list">
            {[...currentBids].sort((a,b)=>b.points-a.points).slice(0,6).map((b,i)=>{
              const isTop=b.id===topBid?.id;
              return(
                <li key={b.id} className={isTop?"top":""} style={teamVar(capColor(b.captain_id))}>
                  <span className="rk">{i+1}</span>
                  <span className="who">{b.captain_name}</span>
                  <span className="pt">{b.points}<small>pt</small></span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
