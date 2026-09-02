"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthProvider";

interface AuctionPlayer {
  id:number;member_id:number;nickname:string;is_captain:number;points:number;
  team_id:number|null;sort_order:number;main_line:string|null;sub_line:string|null;user_id:number|null;
  champ1:string|null;champ2:string|null;champ3:string|null;
  roster_line:string|null;solo_tier:string|null;solo_rank:string|null;
}
interface AuctionBid {
  id:number;session_id:number;player_id:number;captain_id:number;points:number;captain_name:string;
}
interface AuctionSession{id:number;status:string;current_idx:number;timer_started:number;timer_started_at:number|null;}
interface SessionListItem{id:number;status:string;current_idx:number;created_at:string;player_count:number;}
interface Member{id:number;nickname:string;}
interface RosterEntry{member_id:number;nickname:string;main_line:string|null;sub_line:string|null;solo_tier:string|null;solo_rank:string|null;line:string|null;champ1:string|null;champ2:string|null;champ3:string|null;}

const LINE_LABEL:Record<string,string>={TOP:"탑",JG:"정글",MID:"미드",ADC:"원딜",SUP:"서폿"};
const LINE_ICON:Record<string,string>={
  TOP:"https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png",
  JG:"https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png",
  MID:"https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png",
  ADC:"https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png",
  SUP:"https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png",
};
const LINES=["TOP","JG","MID","ADC","SUP"] as const;
const CHAMP_LIST=["Aatrox","Ahri","Akali","Akshan","Alistar","Ambessa","Amumu","Anivia","Annie","Aphelios","Ashe","AurelionSol","Aurora","Azir","Bard","Belveth","Blitzcrank","Brand","Braum","Briar","Caitlyn","Camille","Cassiopeia","Chogath","Corki","Darius","Diana","Draven","DrMundo","Ekko","Elise","Evelynn","Ezreal","Fiddlesticks","Fiora","Fizz","Galio","Gangplank","Garen","Gnar","Gragas","Graves","Gwen","Hecarim","Heimerdinger","Hwei","Illaoi","Irelia","Ivern","Janna","JarvanIV","Jax","Jayce","Jhin","Jinx","Kaisa","Kalista","Karma","Karthus","Kassadin","Katarina","Kayle","Kayn","Kennen","Khazix","Kindred","Kled","KogMaw","KSante","Leblanc","LeeSin","Leona","Lillia","Lissandra","Lucian","Lulu","Lux","Malphite","Malzahar","Maokai","MasterYi","Mel","Milio","MissFortune","MonkeyKing","Mordekaiser","Morgana","Naafiri","Nami","Nasus","Nautilus","Neeko","Nidalee","Nilah","Nocturne","Nunu","Olaf","Orianna","Ornn","Pantheon","Poppy","Pyke","Qiyana","Quinn","Rakan","Rammus","RekSai","Rell","Renata","Renekton","Rengar","Riven","Rumble","Ryze","Samira","Sejuani","Senna","Seraphine","Sett","Shaco","Shen","Shyvana","Singed","Sion","Sivir","Skarner","Smolder","Sona","Soraka","Swain","Sylas","Syndra","TahmKench","Taliyah","Talon","Taric","Teemo","Thresh","Tristana","Trundle","Tryndamere","TwistedFate","Twitch","Udyr","Urgot","Varus","Vayne","Veigar","Velkoz","Vex","Vi","Viego","Viktor","Vladimir","Volibear","Warwick","Xayah","Xerath","XinZhao","Yasuo","Yone","Yorick","Yunara","Yuumi","Zac","Zed","Zeri","Ziggs","Zilean","Zoe","Zyra"];
function ChampImg({name,size=32}:{name:string|null;size?:number}){
  if(!name)return<div style={{width:size,height:size,borderRadius:4,background:"var(--card-2)",border:"1px solid var(--border)"}} />;
  return<img src={`/champions/${name}.png`} alt={name} width={size} height={size} style={{borderRadius:4,objectFit:"cover",border:"1px solid var(--border)"}} />;
}
const STATUS_LABEL:Record<string,string>={waiting:"대기중",running:"진행중",done:"완료"};
function getChosung(str:string):string{
  const C=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  return str.split("").map(ch=>{const c=ch.charCodeAt(0)-0xAC00;return(c<0||c>11171)?ch:C[Math.floor(c/588)];}).join("");
}
function matchScore(name:string,q:string):number{
  const n=name.toLowerCase(),query=q.toLowerCase();
  if(n===query)return 3;if(n.startsWith(query))return 2;if(n.includes(query))return 1;
  const cs=getChosung(name);if(cs.startsWith(q))return 2;if(cs.includes(q))return 1;return 0;
}

function MemberSearchInput({members,usedIds,onSelect,placeholder}:{members:Member[];usedIds:number[];onSelect:(m:Member)=>void;placeholder?:string;}){
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const [activeIdx,setActiveIdx]=useState(-1);
  const wrapRef=useRef<HTMLDivElement>(null);
  const avail=members.filter(m=>!usedIds.includes(m.id));
  const filtered=q?avail.filter(m=>matchScore(m.nickname,q)>0).sort((a,b)=>matchScore(b.nickname,q)-matchScore(a.nickname,q)).slice(0,8):avail.slice(0,8);
  useEffect(()=>{
    function h(e:MouseEvent){if(wrapRef.current&&!wrapRef.current.contains(e.target as Node)){setOpen(false);setActiveIdx(-1);}}
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  function select(m:Member){onSelect(m);setQ("");setOpen(false);setActiveIdx(-1);}
  return(
    <div ref={wrapRef} style={{position:"relative"}}>
      <input value={q}
        onChange={e=>{setQ(e.target.value);setOpen(true);setActiveIdx(-1);}}
        onFocus={()=>setOpen(true)}
        onKeyDown={e=>{
          if(e.key==="ArrowDown"){e.preventDefault();setActiveIdx(i=>Math.min(i+1,filtered.length-1));}
          else if(e.key==="ArrowUp"){e.preventDefault();setActiveIdx(i=>Math.max(i-1,-1));}
          else if(e.key==="Enter"){e.preventDefault();const picked=activeIdx>=0?filtered[activeIdx]:filtered.length>0?filtered[0]:null;if(picked)select(picked);else setOpen(false);}
          else if(e.key==="Escape"){setOpen(false);setActiveIdx(-1);}
        }}
        placeholder={placeholder??"클랜원 검색"}
        style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}}
      />
      {open&&filtered.length>0&&(
        <div className="slot-candidates" style={{zIndex:50}}>
          {filtered.map((m,i)=>(<button key={m.id} className={i===activeIdx?"active":""} onMouseDown={()=>select(m)}>{m.nickname}</button>))}
        </div>
      )}
    </div>
  );
}
function useCountdown(seconds:number,onEnd:()=>void,startedAt:number|null,serverNow:number|null){
  const [rem,setRem]=useState(seconds);
  const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const onEndRef=useRef(onEnd);onEndRef.current=onEnd;
  const serverNowRef=useRef(serverNow);
  useEffect(()=>{serverNowRef.current=serverNow;},[serverNow]);
  function reset(){setRem(seconds);if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}}
  useEffect(()=>{
    if(!startedAt)return;
    if(timerRef.current)clearInterval(timerRef.current);
    const now=Date.now();
    const elapsed=Math.floor((now-startedAt)/1000);
    const initial=Math.max(0,seconds-elapsed);
    if(initial<=0){setRem(0);setTimeout(()=>onEndRef.current(),0);return;}
    setRem(initial);
    timerRef.current=setInterval(()=>{
      setRem(prev=>{if(prev<=1){clearInterval(timerRef.current!);timerRef.current=null;onEndRef.current();return 0;}return prev-1;});
    },1000);
    return()=>{if(timerRef.current)clearInterval(timerRef.current);};
  },[startedAt]);
  return{rem,reset};
}

function AuctionTimer({onEnd,resetRef,startedAt,serverNow,onStart,isAdmin}:{onEnd:()=>void;resetRef:React.MutableRefObject<(()=>void)|null>;startedAt:number|null;serverNow:number|null;onStart:()=>void;isAdmin:boolean}){
  const {rem,reset}=useCountdown(10,onEnd,startedAt,serverNow);
  resetRef.current=reset;
  const pct=(rem/10)*100;
  const color=rem<=3?"var(--loss-text)":rem<=6?"#e67e22":"var(--win-text)";
  return(
    <div style={{textAlign:"center",width:"100%"}}>
      {!startedAt
        ?<button className="btn-primary" style={{fontSize:16,padding:"12px 40px"}} onClick={onStart} disabled={!isAdmin}>▶ 시작</button>
        :<>
          <div style={{fontSize:56,fontWeight:900,color,lineHeight:1,letterSpacing:2}}>{String(rem).padStart(2,"0")}</div>
          <div style={{height:8,background:"var(--border)",borderRadius:4,margin:"10px 0",overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",background:color,borderRadius:4,transition:"width 1s linear,background 0.3s"}} />
          </div>
        </>
      }
    </div>
  );
}

function CreateSessionModal({members,roster,onClose,onCreated}:{members:Member[];roster:RosterEntry[];onClose:()=>void;onCreated:(id:number)=>void;}){
  const [captains,setCaptains]=useState<{memberId:number;nickname:string;points:number;captainUserId:number|null}[]>([]);
  const [captainAccounts,setCaptainAccounts]=useState<{id:number;nickname:string}[]>([]);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const usedIds=captains.map(c=>c.memberId);
  const rosterIds=new Set(roster.map(r=>r.member_id));
  const rosterMembers=members.filter(m=>rosterIds.has(m.id));
  const nonCaptainRoster=roster.filter(r=>!usedIds.includes(r.member_id));
  useEffect(()=>{
    fetch("/api/auction/captains").then(r=>r.json()).then(j=>setCaptainAccounts(j.captains??[]));
  },[]);
  async function submit(){
    if(captains.length<2){setErr("팀장을 2명 이상 추가하세요.");return;}
    setLoading(true);setErr("");
    try{
      const res=await fetch("/api/auction",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({captains:captains.map(c=>({memberId:c.memberId,points:c.points,captainUserId:c.captainUserId}))})});
      const json=await res.json();
      if(!res.ok){setErr(json.error||"생성 실패");return;}
      onCreated(json.sessionId);
    }catch{setErr("네트워크 오류");}finally{setLoading(false);}
  }
  return(
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:900,width:"95vw"}}>
        <div className="modal-head" style={{fontSize:17}}>
          <span>📢 새 경매 생성</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {/* 팀장 지정 */}
          <div style={{background:"var(--card-2)",borderRadius:12,padding:16,border:"1px solid var(--border)"}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:10,color:"var(--win-text)"}}>👑 팀장 <span style={{fontWeight:400,fontSize:12,color:"var(--muted)"}}>({captains.length}명)</span></div>
            <MemberSearchInput members={rosterMembers} usedIds={usedIds} onSelect={m=>setCaptains(prev=>[...prev,{memberId:m.id,nickname:m.nickname,points:1000,captainUserId:null}])} placeholder="팀장 검색" />
            <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
              {captains.length===0&&<div style={{color:"var(--muted)",fontSize:12}}>팀장 최소 2명</div>}
              {captains.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"var(--card)",borderRadius:8,padding:"8px 12px",border:"1px solid var(--border)",flexWrap:"wrap"}}>
                  <span style={{flex:1,fontWeight:700,fontSize:14,minWidth:60}}>{c.nickname}</span>
                  <select value={c.captainUserId??""} onChange={e=>setCaptains(prev=>prev.map((x,idx)=>idx===i?{...x,captainUserId:e.target.value?Number(e.target.value):null}:x))}
                    style={{padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:12}}>
                    <option value="">계정 선택</option>
                    {captainAccounts.map(a=>(<option key={a.id} value={a.id}>{a.nickname}</option>))}
                  </select>
                  <input type="number" min={100} step={100} value={c.points}
                    onChange={e=>setCaptains(prev=>prev.map((x,idx)=>idx===i?{...x,points:Number(e.target.value)}:x))}
                    style={{width:70,padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:13,textAlign:"center"}}
                  />
                  <span style={{fontSize:11,color:"var(--muted)"}}>pt</span>
                  <button onClick={()=>setCaptains(prev=>prev.filter((_,idx)=>idx!==i))} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:18,padding:"0 2px"}}>×</button>
                </div>
              ))}
            </div>
          </div>
          {/* 선수 미리보기 (roster 기반) */}
          <div style={{background:"var(--card-2)",borderRadius:12,padding:16,border:"1px solid var(--border)"}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:10,color:"var(--loss-text)"}}>🎮 선수 예정 <span style={{fontWeight:400,fontSize:12,color:"var(--muted)"}}>({nonCaptainRoster.length}명)</span></div>
            {nonCaptainRoster.length===0
              ?<div style={{color:"var(--muted)",fontSize:12}}>참여자 관리에서 먼저 등록하세요</div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(72px,1fr))",gap:4,maxHeight:220,overflowY:"auto"}}>
                {nonCaptainRoster.map(r=>(
                  <div key={r.member_id} style={{background:"var(--card)",borderRadius:6,padding:"4px 8px",fontSize:12,fontWeight:700,border:"1px solid var(--border)",textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {r.nickname}
                  </div>
                ))}
              </div>
            }
            {roster.length>0&&<div style={{marginTop:8,fontSize:11,color:"var(--muted)"}}>팀장 제외 전원 자동 포함</div>}
          </div>
        </div>
        {err&&<div className="error" style={{marginTop:14}}>{err}</div>}
        <div style={{marginTop:18,display:"flex",alignItems:"center",gap:10}}>
          <button className="btn-primary" style={{fontSize:14,padding:"10px 28px"}} onClick={submit} disabled={loading}>{loading?"생성 중..": "경매 생성"}</button>
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <span style={{marginLeft:"auto",fontSize:12,color:"var(--muted)"}}>팀장 {captains.length}명 · 선수 {nonCaptainRoster.length}명</span>
        </div>
      </div>
    </div>
  );
}
function AuctionRoom({sessionId,isAdmin,myUserId}:{sessionId:number;isAdmin:boolean;myUserId:number|null}){
  const [session,setSession]=useState<AuctionSession|null>(null);
  const [players,setPlayers]=useState<AuctionPlayer[]>([]);
  const [bids,setBids]=useState<AuctionBid[]>([]);
  const [serverNow,setServerNow]=useState<number|null>(null);
  const [bidErr,setBidErr]=useState("");
  const [bidLoading,setBidLoading]=useState(false);
  const [lastBidMsg,setLastBidMsg]=useState<string|null>(null);
  const lastBidTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [awarding,setAwarding]=useState(false);
  const [awardCd,setAwardCd]=useState<number|null>(null);
  const pollRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const prevTopRef=useRef<number>(0);
  const prevTopBidIdRef=useRef<number|null>(null);
  const timerResetRef=useRef<(()=>void)|null>(null);
  const captains=players.filter(p=>p.is_captain===1);
  const nonCaptains=players.filter(p=>p.is_captain===0);
  const timerStartedAt=session?.timer_started ? (session.timer_started_at??null) : null;
  const currentPlayer=session?nonCaptains[session.current_idx]??null:null;
  const currentBids=currentPlayer?bids.filter(b=>b.player_id===currentPlayer.id):[];
  const topBid=currentBids.reduce<AuctionBid|null>((top,b)=>(!top||b.points>top.points)?b:top,null);
  const myCaptain=myUserId?captains.find(c=>c.user_id===myUserId)??null:null;
  const load=useCallback(async()=>{
    const res=await fetch("/api/auction?sessionId="+sessionId);
    if(!res.ok)return;
    const json=await res.json();
    const s=json.session;
    if(s&&s.timer_started_at!=null)s.timer_started_at=Number(s.timer_started_at);
    setSession(s);setPlayers(json.players);setBids(json.bids);setServerNow(json.serverNow??null);
  },[sessionId]);
  useEffect(()=>{
    load();
    pollRef.current=setInterval(load,500);
    return()=>{if(pollRef.current)clearInterval(pollRef.current);};
  },[load]);
  useEffect(()=>{
    const newTop=topBid?.points??0;
    if(newTop>prevTopRef.current){prevTopRef.current=newTop;setAwardCd(null);}
  },[topBid?.points]);
  useEffect(()=>{
    if(!topBid)return;
    if(topBid.id===prevTopBidIdRef.current)return;
    prevTopBidIdRef.current=topBid.id;
    if(lastBidTimerRef.current)clearTimeout(lastBidTimerRef.current);
    setLastBidMsg(topBid.captain_name+"님이 "+topBid.points+" 포인트 입찰했습니다!");
    lastBidTimerRef.current=setTimeout(()=>setLastBidMsg(null),3000);
  },[topBid?.id]);
  const prevIdxRef=useRef<number>(-1);
  useEffect(()=>{
    const idx=session?.current_idx??-1;
    if(idx!==prevIdxRef.current&&idx>=0){prevIdxRef.current=idx;timerResetRef.current?.();}
  },[session?.current_idx]);
  const topBidRef=useRef(topBid);topBidRef.current=topBid;
  const sessionRef=useRef(session);sessionRef.current=session;
  function onTimerEnd(){if(sessionRef.current?.status==="running"){setAwardCd(topBidRef.current?3:0);}}
  const handleAwardRef=useRef(handleAward);handleAwardRef.current=handleAward;
  useEffect(()=>{
    if(awardCd===null)return;
    if(awardCd<=0){if(isAdmin)handleAwardRef.current();return;}
    const t=setTimeout(()=>setAwardCd(prev=>(prev??1)-1),1000);
    return()=>clearTimeout(t);
  },[awardCd,isAdmin]);
  async function handleAward(){
    setAwarding(true);
    await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"award",sessionId})});
    setAwardCd(null);prevTopRef.current=0;setAwarding(false);timerResetRef.current?.();load();
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
  const LINES_ORDER=["TOP","JG","MID","ADC","SUP"] as const;
  const isDone=session?.status==="done";
  const isRunning=session?.status==="running";
  const isWaiting=session?.status==="waiting";
  const remaining=nonCaptains.filter(p=>p.team_id===null);
  return(
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr 180px",gap:16,minHeight:600}}>
      {/* 팀장 패널 - 라인별 슬롯 */}
      <div style={{display:"flex",flexDirection:"column",gap:10,overflowY:"auto",maxHeight:"80vh"}}>
        {captains.map(cap=>{
          const team=getTeam(cap.id);const used=getUsed(cap.id);const left=cap.points-used;const isMe=myCaptain?.id===cap.id;
          return(
            <div key={cap.id} style={{background:"var(--card)",border:"2px solid "+(isMe?"var(--accent)":"var(--border)"),borderRadius:10,padding:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontWeight:800,fontSize:14}}>{cap.nickname}{isMe&&<span style={{fontSize:11,color:"var(--accent)",marginLeft:4}}>(나)</span>}</span>
                <span style={{fontSize:12,color:left<200?"var(--loss-text)":"var(--win-text)",fontWeight:700}}>{left}pt</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {LINES_ORDER.map(line=>{
                  const isCaptainLine=cap.roster_line===line;
                  const member=isCaptainLine?cap:team.find(pl=>pl.roster_line===line)??null;
                  const wonPts=member&&!isCaptainLine?bids.filter(b=>b.player_id===member.id&&b.captain_id===cap.id).reduce((m,b)=>Math.max(m,b.points),0):null;
                  return(
                    <div key={line} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:6,background:member?"var(--card-2)":"rgba(255,255,255,0.03)",border:"1px solid "+(member?"var(--border)":"rgba(255,255,255,0.06)")}}>
                      <img src={LINE_ICON[line]} alt={line} width={20} height={20} style={{filter:"brightness(0) invert(1)",opacity:member?1:0.3,flexShrink:0}}/>
                      {member
                        ?<span style={{fontSize:12,fontWeight:700,flex:1}}>{member.nickname}{wonPts!==null&&<span style={{fontSize:10,color:"var(--muted)",marginLeft:4}}>({wonPts}pt)</span>}{isCaptainLine&&<span style={{fontSize:10,color:"var(--accent)",marginLeft:4}}>팀장</span>}</span>
                        :<span style={{fontSize:11,color:"rgba(255,255,255,0.2)",flex:1}}>-</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:24,display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
        {isWaiting&&isAdmin&&(<button className="btn-primary" style={{fontSize:16,padding:"14px 40px"}} onClick={async()=>{await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"start",sessionId})});load();}}>경매 시작</button>)}
        {isWaiting&&!isAdmin&&<div style={{color:"var(--muted)",fontSize:15}}>운영진이 경매를 시작할 때까지 대기하세요.</div>}
        {isDone&&(<div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:"var(--win-text)",marginBottom:8}}>경매 완료!</div>{isAdmin&&<button className="btn-secondary" onClick={async()=>{await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reset",sessionId})});load();}}>초기화</button>}</div>)}
        {isRunning&&currentPlayer&&(
          <>
            <div style={{fontSize:13,color:"var(--muted)"}}>현재 경매 중 ({(session?.current_idx??0)+1} / {nonCaptains.length})</div>
            <div style={{fontSize:36,fontWeight:900,color:"var(--text)"}}>{currentPlayer.nickname}</div>
            {(currentPlayer.champ1||currentPlayer.champ2||currentPlayer.champ3)&&(
              <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                <ChampImg name={currentPlayer.champ1} size={72}/>
                <ChampImg name={currentPlayer.champ2} size={72}/>
                <ChampImg name={currentPlayer.champ3} size={72}/>
              </div>
            )}
            <div style={{display:"flex",gap:10,alignItems:"center",fontSize:13,color:"var(--muted)"}}>
              {(currentPlayer.roster_line&&LINE_ICON[currentPlayer.roster_line])&&<img src={LINE_ICON[currentPlayer.roster_line]} alt={currentPlayer.roster_line} width={32} height={32} style={{filter:"brightness(0) invert(1)",opacity:0.85}}/>}
              {currentPlayer.solo_tier&&<span style={{fontWeight:700,color:"var(--win-text)"}}>{currentPlayer.solo_tier} {currentPlayer.solo_rank}</span>}
            </div>
            <AuctionTimer onEnd={onTimerEnd} resetRef={timerResetRef} startedAt={timerStartedAt} serverNow={serverNow} onStart={async()=>{await fetch("/api/auction",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"timer_start",sessionId})});load();}} isAdmin={isAdmin}/>
            {awardCd!==null&&(<div style={{fontSize:20,fontWeight:800,color:"#e67e22"}}>{topBid?topBid.captain_name+" 낙찰 확정까지 "+awardCd+"초":"유찰 처리까지 "+awardCd+"초"}</div>)}
            <div style={{width:"100%",background:"var(--card-2)",borderRadius:8,padding:12}}>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:6}}>입찰 현황</div>
              {currentBids.length===0&&<div style={{color:"var(--muted)",fontSize:13}}>아직 입찰 없음</div>}
              {[...currentBids].sort((a,b)=>b.points-a.points).map(b=>(<div key={b.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0",fontWeight:b.id===topBid?.id?800:400,color:b.id===topBid?.id?"var(--win-text)":"var(--text)"}}><span>{b.captain_name}</span><span>{b.points}pt</span></div>))}
            </div>
            {myCaptain&&(
              <div style={{width:"100%"}}>
                {(()=>{
                  const cpLine=currentPlayer?.roster_line;
                  const lineBlocked=!!cpLine&&(cap=>cap.roster_line===cpLine||getTeam(myCaptain.id).some(p=>p.roster_line===cpLine))(myCaptain);
                  return lineBlocked&&<div style={{textAlign:"center",fontSize:13,color:"var(--loss-text)",fontWeight:700,marginBottom:6}}>이미 {LINE_LABEL[cpLine!]??cpLine} 라인 보유 중</div>;
                })()}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {([5,10,50,100] as const).map((n,i)=>{
                    const next=(topBid?.points??0)+n;
                    const myCurrentBid=currentPlayer?bids.filter(b=>b.player_id===currentPlayer.id&&b.captain_id===myCaptain.id).reduce((m,b)=>Math.max(m,b.points),0):0;
                    const remain=myCaptain.points-getUsed(myCaptain.id)-myCurrentBid;
                    const cpLine=currentPlayer?.roster_line;
                    const lineBlocked=!!cpLine&&(myCaptain.roster_line===cpLine||getTeam(myCaptain.id).some(p=>p.roster_line===cpLine));
                    const dis=bidLoading||lineBlocked||next>remain+myCurrentBid;
                    const colors=[
                      {border:"rgba(255,255,255,0.12)",text:"#9aa5b8",hover:"rgba(255,255,255,0.06)"},
                      {border:"rgba(83,131,232,0.4)",text:"#7aa2f7",hover:"rgba(83,131,232,0.1)"},
                      {border:"rgba(155,89,182,0.5)",text:"#c39bd3",hover:"rgba(155,89,182,0.12)"},
                      {border:"rgba(230,126,34,0.6)",text:"#e67e22",hover:"rgba(230,126,34,0.12)"},
                    ][i];
                    return(
                      <button key={n} onClick={()=>handleBid(next)} disabled={dis} style={{
                        padding:"10px 0",borderRadius:8,border:"1px solid "+(dis?"rgba(255,255,255,0.06)":colors.border),
                        background:"transparent",color:dis?"rgba(255,255,255,0.2)":colors.text,
                        fontSize:13,fontWeight:700,cursor:dis?"default":"pointer",
                        transition:"background 0.15s,border-color 0.15s",letterSpacing:0.2,
                      }}
                      onMouseEnter={e=>{if(!dis)(e.currentTarget as HTMLButtonElement).style.background=colors.hover;}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="transparent";}}>
                        <div style={{fontSize:10,opacity:0.6,marginBottom:1}}>+{n}pt</div>
                        <div style={{fontSize:14}}>{next}pt</div>
                      </button>
                    );
                  })}
                </div>
                {bidErr&&<div style={{color:"var(--loss-text)",fontSize:12,marginTop:6,textAlign:"center"}}>{bidErr}</div>}
                <div style={{fontSize:12,color:"var(--muted)",marginTop:4,textAlign:"center"}}>잔여: {myCaptain.points-getUsed(myCaptain.id)}pt{topBid&&" · 현재 최고: "+topBid.points+"pt ("+topBid.captain_name+")"}</div>
              </div>
            )}
            {lastBidMsg&&(
              <div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",background:"rgba(20,20,30,0.97)",border:"1px solid var(--accent)",borderRadius:12,padding:"14px 32px",fontSize:17,fontWeight:700,color:"var(--win-text)",zIndex:9999,pointerEvents:"none",whiteSpace:"nowrap",boxShadow:"0 4px 24px rgba(0,0,0,0.4)"}}>{lastBidMsg}</div>
            )}
            {isAdmin&&(<button className="btn-secondary" onClick={handleAward} disabled={awarding} style={{marginTop:4}}>{awarding?"처리 중":"수동 낙찰"}</button>)}
          </>
        )}
        {isRunning&&!currentPlayer&&<div style={{color:"var(--muted)"}}>모든 선수 경매 완료</div>}
      </div>      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,overflowY:"auto",maxHeight:"80vh"}}>
        <div style={{fontWeight:800,fontSize:13,marginBottom:10,color:"var(--muted)"}}>미경매 선수 ({remaining.length}명)</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {remaining.map((pl,i)=>(<div key={pl.id} style={{padding:"5px 8px",borderRadius:7,fontSize:13,fontWeight:700,background:currentPlayer?.id===pl.id?"rgba(83,131,232,0.18)":"var(--card-2)",border:currentPlayer?.id===pl.id?"1px solid var(--accent)":"1px solid transparent",color:currentPlayer?.id===pl.id?"var(--win-text)":"var(--text)"}}><span style={{color:"var(--muted)",fontSize:11,marginRight:5}}>{i+1}</span>{pl.nickname}</div>))}
          {remaining.length===0&&<div style={{color:"var(--muted)",fontSize:13}}>없음</div>}
        </div>
      </div>
    </div>
  );
}

function RosterManager({members,roster,isAdmin,onSaved}:{members:Member[];roster:RosterEntry[];isAdmin:boolean;onSaved:()=>void;}){
  const [editing,setEditing]=useState<number|null>(null);
  const [editLine,setEditLine]=useState("");
  const [editChamps,setEditChamps]=useState<string[]>([]);
  const [champQ,setChampQ]=useState("");
  const [saving,setSaving]=useState(false);
  const [addQ,setAddQ]=useState("");
  const [adding,setAdding]=useState<Member|null>(null);
  const [addLine,setAddLine]=useState("");
  const [addChamps,setAddChamps]=useState<string[]>([]);
  const [addChampQ,setAddChampQ]=useState("");
  const filteredChamps=champQ?CHAMP_LIST.filter(c=>c.toLowerCase().includes(champQ.toLowerCase())):CHAMP_LIST;
  const filteredAddChamps=addChampQ?CHAMP_LIST.filter(c=>c.toLowerCase().includes(addChampQ.toLowerCase())):CHAMP_LIST;
  const rosterIds=new Set(roster.map(r=>r.member_id));
  const addCandidates=addQ?members.filter(m=>!rosterIds.has(m.id)&&matchScore(m.nickname,addQ)>0).sort((a,b)=>matchScore(b.nickname,addQ)-matchScore(a.nickname,addQ)).slice(0,8):[];
  function startEdit(r:RosterEntry){
    setEditing(r.member_id);
    setEditLine(r.line??"");
    setEditChamps([r.champ1,r.champ2,r.champ3].filter(Boolean) as string[]);
    setChampQ("");
  }
  async function save(memberId:number){
    setSaving(true);
    await fetch("/api/auction/roster",{method:"PUT",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({memberId,line:editLine||null,champ1:editChamps[0]||null,champ2:editChamps[1]||null,champ3:editChamps[2]||null})});
    setSaving(false);setEditing(null);onSaved();
  }
  async function addMember(m:Member){
    setAddQ("");
    setAdding(m);
    setAddLine("");
    setAddChamps([]);
    setAddChampQ("");
  }
  async function submitAdd(){
    if(!adding)return;
    await fetch("/api/auction/roster",{method:"PUT",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({memberId:adding.id,line:addLine||null,champ1:addChamps[0]||null,champ2:addChamps[1]||null,champ3:addChamps[2]||null})});
    setAdding(null);onSaved();
  }
  async function removeMember(memberId:number){
    if(!confirm("참여자 목록에서 제거하시겠습니까?"))return;
    await fetch("/api/auction/roster",{method:"DELETE",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({memberId})});
    onSaved();
  }
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontWeight:800,fontSize:15}}>참여자 관리 <span style={{fontWeight:400,fontSize:13,color:"var(--muted)"}}>(경매에 포함될 참여자 목록)</span></div>
        <span style={{fontSize:12,color:"var(--muted)"}}>{roster.length}명 등록됨</span>
      </div>
      {isAdmin&&(
        <div style={{position:"relative",maxWidth:300,marginBottom:16}}>
          <input value={addQ} onChange={e=>setAddQ(e.target.value)} placeholder="+ 참여자 추가 (이름 검색)"
            onKeyDown={e=>{if(e.key==="Enter"&&addCandidates.length>0)addMember(addCandidates[0]);}}
            style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}}/>
          {addCandidates.length>0&&(
            <div className="slot-candidates" style={{zIndex:50}}>
              {addCandidates.map(m=>(<button key={m.id} onMouseDown={()=>addMember(m)}>{m.nickname}</button>))}
            </div>
          )}
        </div>
      )}
      {adding&&(
        <div className="modal-backdrop">
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
            <div className="modal-head">
              <span>{adding.nickname} 추가</span>
              <button className="modal-close" onClick={()=>setAdding(null)}>×</button>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>라인</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {LINES.map(l=>(
                  <button key={l} onClick={()=>setAddLine(prev=>prev===l?"":l)} style={{padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",background:addLine===l?"var(--accent)":"var(--card-2)",color:addLine===l?"#fff":"var(--text)",border:"1px solid "+(addLine===l?"var(--accent)":"var(--border)")}}>{LINE_LABEL[l]}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>주챔피언 ({addChamps.length}/3)</div>
              <div style={{display:"flex",gap:5,marginBottom:6}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:"relative",cursor:addChamps[i]?"pointer":"default"}} onClick={()=>{if(addChamps[i])setAddChamps(prev=>prev.filter((_,idx)=>idx!==i));}}>
                    <ChampImg name={addChamps[i]??null} size={40}/>
                    {addChamps[i]&&<div style={{position:"absolute",top:-4,right:-4,background:"var(--loss-text)",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>×</div>}
                  </div>
                ))}
              </div>
              <input value={addChampQ} onChange={e=>setAddChampQ(e.target.value)} placeholder="챔피언 검색" style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:12,marginBottom:4}}/>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,maxHeight:220,overflowY:"auto"}}>
                {filteredAddChamps.map(c=>{const sel=addChamps.includes(c);return(
                  <button key={c} onClick={()=>{if(sel)setAddChamps(prev=>prev.filter(x=>x!==c));else if(addChamps.length<3)setAddChamps(prev=>[...prev,c]);}} style={{padding:0,border:"2px solid "+(sel?"var(--accent)":"transparent"),borderRadius:3,cursor:"pointer",background:"none",opacity:(!sel&&addChamps.length>=3)?0.3:1}}>
                    <ChampImg name={c} size={40}/>
                  </button>
                );})}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn-primary" style={{flex:1}} onClick={submitAdd}>추가</button>
              <button className="btn-secondary" style={{flex:1}} onClick={()=>setAdding(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
        {roster.map(r=>{
          const isEdit=editing===r.member_id;
          return(
            <div key={r.member_id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:isEdit?10:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:800,fontSize:14}}>{r.nickname}</span>
                  {r.solo_tier&&<span style={{fontSize:11,fontWeight:700,color:"var(--win-text)"}}>{r.solo_tier} {r.solo_rank}</span>}
                </div>
                {isAdmin&&!isEdit&&(
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>startEdit(r)} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",cursor:"pointer",color:"var(--text)"}}>수정</button>
                    <button onClick={()=>removeMember(r.member_id)} style={{fontSize:12,padding:"3px 8px",borderRadius:6,border:"1px solid rgba(231,76,60,0.4)",background:"transparent",cursor:"pointer",color:"#f1948a"}}>×</button>
                  </div>
                )}
              </div>
              {!isEdit&&(
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {r.line&&<span style={{fontSize:12,color:"var(--muted)",background:"var(--card-2)",borderRadius:4,padding:"2px 7px"}}>{LINE_LABEL[r.line]??r.line}</span>}
                  {[r.champ1,r.champ2,r.champ3].filter(Boolean).map((c,i)=><ChampImg key={i} name={c} size={32}/>)}
                  {!r.line&&!r.champ1&&<span style={{fontSize:12,color:"var(--muted)"}}>(라인/챔피언 미입력)</span>}
                </div>
              )}
              {isEdit&&(
                <div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>라인</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {LINES.map(l=>(
                        <button key={l} onClick={()=>setEditLine(prev=>prev===l?"":l)} style={{padding:"3px 9px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",background:editLine===l?"var(--accent)":"var(--card-2)",color:editLine===l?"#fff":"var(--text)",border:"1px solid "+(editLine===l?"var(--accent)":"var(--border)")}}>{LINE_LABEL[l]}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>주챔피언 ({editChamps.length}/3)</div>
                    <div style={{display:"flex",gap:5,marginBottom:5}}>
                      {[0,1,2].map(i=>(
                        <div key={i} style={{position:"relative",cursor:editChamps[i]?"pointer":"default"}} onClick={()=>{if(editChamps[i])setEditChamps(prev=>prev.filter((_,idx)=>idx!==i));}}>
                          <ChampImg name={editChamps[i]??null} size={36}/>
                          {editChamps[i]&&<div style={{position:"absolute",top:-4,right:-4,background:"var(--loss-text)",color:"#fff",borderRadius:"50%",width:13,height:13,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>×</div>}
                        </div>
                      ))}
                    </div>
                    <input value={champQ} onChange={e=>setChampQ(e.target.value)} placeholder="챔피언 검색" style={{width:"100%",padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:12,marginBottom:4}}/>
                    <div style={{display:"flex",flexWrap:"wrap",gap:2,maxHeight:90,overflowY:"auto"}}>
                      {filteredChamps.map(c=>{const sel=editChamps.includes(c);return(
                        <button key={c} onClick={()=>{if(sel)setEditChamps(prev=>prev.filter(x=>x!==c));else if(editChamps.length<3)setEditChamps(prev=>[...prev,c]);}} style={{padding:0,border:"2px solid "+(sel?"var(--accent)":"transparent"),borderRadius:3,cursor:"pointer",background:"none",opacity:(!sel&&editChamps.length>=3)?0.3:1}}>
                          <ChampImg name={c} size={26}/>
                        </button>
                      );})}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn-primary" style={{fontSize:12,padding:"5px 14px"}} onClick={()=>save(r.member_id)} disabled={saving}>{saving?"저장 중..": "저장"}</button>
                    <button className="btn-secondary" style={{fontSize:12,padding:"5px 14px"}} onClick={()=>setEditing(null)}>취소</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AuctionPage(){
  const {user,loading:authLoading,openAuthModal}=useAuth();
  const [members,setMembers]=useState<Member[]>([]);
  const [roster,setRoster]=useState<RosterEntry[]>([]);
  const [sessions,setSessions]=useState<SessionListItem[]>([]);
  const [activeId,setActiveId]=useState<number|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [tab,setTab]=useState<"sessions"|"roster">("sessions");
  const [loadingData,setLoadingData]=useState(true);
  const isAdmin=user?.role==="admin"||user?.role==="subadmin";
  const myUserId=user?.userId??null;
  const loadSessions=useCallback(async()=>{
    const res=await fetch("/api/auction");
    if(res.ok){const json=await res.json();setSessions(json.sessions);}
  },[]);
  const loadRoster=useCallback(async()=>{
    const res=await fetch("/api/auction/roster");
    if(res.ok){const json=await res.json();setRoster(json.roster);}
  },[]);
  useEffect(()=>{
    if(authLoading||!user){setLoadingData(false);return;}
    Promise.all([
      fetch("/api/userinfo").then(r=>r.json()).then(j=>{
        if(j.members)setMembers(j.members.filter((m:any)=>m.mainLine!=="ARAM").map((m:any)=>({id:m.id,nickname:m.nickname})));
      }),
      loadSessions(),
      loadRoster(),
    ]).finally(()=>setLoadingData(false));
  },[user,authLoading,loadSessions,loadRoster]);
  if(authLoading||loadingData)return null;
  if(!user)return(<div className="scrim"><div className="party-login-notice">경매 시스템을 이용하려면 로그인이 필요합니다.<button type="button" className="inline-login-btn" onClick={()=>openAuthModal("login")}>로그인 / 회원가입</button></div></div>);
  return(
    <div className="scrim">
      {!activeId&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{display:"flex",gap:0,background:"var(--card-2)",borderRadius:8,padding:3,border:"1px solid var(--border)"}}>
          <button onClick={()=>{setTab("sessions");}} style={{padding:"6px 18px",borderRadius:6,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",background:tab==="sessions"?"var(--accent)":"transparent",color:tab==="sessions"?"#fff":"var(--muted)"}}>📢 경매</button>
          <button onClick={()=>setTab("roster")} style={{padding:"6px 18px",borderRadius:6,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",background:tab==="roster"?"var(--accent)":"transparent",color:tab==="roster"?"#fff":"var(--muted)"}}>👥 참여자 관리</button>
        </div>
        <div style={{display:"flex",gap:8}}>
          {tab==="sessions"&&isAdmin&&<button className="btn-primary" onClick={()=>setShowCreate(true)}>+ 새 경매 생성</button>}
        </div>
      </div>}
      {activeId&&<div style={{marginBottom:12}}><button className="btn-secondary" onClick={()=>setActiveId(null)}>← 목록으로</button></div>}
      {tab==="sessions"&&(
        <>
          {!activeId&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {sessions.length===0&&<p style={{color:"var(--muted)"}}>경매 세션이 없습니다.</p>}
              {sessions.map(s=>(<div key={s.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}><span style={{fontWeight:800,fontSize:15}}>세션 #{s.id}</span><span style={{fontSize:12,padding:"2px 8px",borderRadius:6,fontWeight:700,background:s.status==="done"?"rgba(46,204,113,0.15)":s.status==="running"?"rgba(83,131,232,0.15)":"var(--card-2)",color:s.status==="done"?"#2ecc71":s.status==="running"?"var(--win-text)":"var(--muted)"}}>{STATUS_LABEL[s.status]??s.status}</span><span style={{color:"var(--muted)",fontSize:13}}>참가자 {s.player_count}명</span><span style={{color:"var(--muted)",fontSize:12,marginLeft:"auto"}}>{new Date(s.created_at).toLocaleDateString("ko-KR")}</span><button className="btn-secondary" style={{padding:"6px 14px",fontSize:12}} onClick={()=>setActiveId(s.id)}>입장</button>{isAdmin&&<button className="del-btn small" onClick={async()=>{if(!confirm("삭제하시겠습니까?"))return;await fetch("/api/auction?sessionId="+s.id,{method:"DELETE"});loadSessions();}}>삭제</button>}</div>))}
            </div>
          )}
          {activeId&&<AuctionRoom sessionId={activeId} isAdmin={isAdmin} myUserId={myUserId} />}
        </>
      )}
      {tab==="roster"&&<RosterManager members={members} roster={roster} isAdmin={isAdmin} onSaved={loadRoster} />}
      {showCreate&&(<CreateSessionModal members={members} roster={roster} onClose={()=>setShowCreate(false)} onCreated={id=>{setShowCreate(false);loadSessions();setActiveId(id);setTab("sessions");}} />)}
    </div>
  );
}