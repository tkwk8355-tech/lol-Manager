"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import AuctionContent from "../components/auction/AuctionContent";
import { MemberSearchInput, type Member } from "../components/auction/shared";

interface SRSession{id:number;name:string|null;total_games:number;status:string;created_at:string;participant_count:number;}
interface SRParticipant{id:number;session_id:number;member_id:number;team:number;nickname:string;}
interface SRGame{id:number;session_id:number;game_no:number;winner_team:number;}

function SoloRankEvent(){const{user}=useAuth();
  const isAdmin=user?.role==="admin"||user?.role==="subadmin";
  const[sessions,setSessions]=useState<SRSession[]>([]);
  const[activeId,setActiveId]=useState<number|null>(null);
  const[showCreate,setShowCreate]=useState(false);
  const[members,setMembers]=useState<Member[]>([]);
  useEffect(()=>{
    fetch("/api/solorank").then(r=>r.json()).then(j=>setSessions(j.sessions??[]));
    if(isAdmin)fetch("/api/userinfo").then(r=>r.json()).then(j=>{
      if(j.members)setMembers(j.members.filter((m:any)=>m.status!=="withdraw"&&m.status!=="black").map((m:any)=>({id:m.id,nickname:m.nickname})));
    });
  },[isAdmin]);
  function reload(){fetch("/api/solorank").then(r=>r.json()).then(j=>setSessions(j.sessions??[]));}
  if(activeId)return<SRRoom sessionId={activeId} isAdmin={isAdmin} onBack={()=>{setActiveId(null);reload();}} members={members}/>;
  return(<div>
    <div className="ev-bar">
      <span className="ev-bar-title">솔랭내기 <small>{sessions.length}개</small></span>
      {isAdmin&&<button className="btn-primary" onClick={()=>setShowCreate(true)}>+ 새 솔랭내기</button>}
    </div>
    {sessions.length===0&&<p className="ui-empty">진행 중인 솔랭내기가 없습니다.</p>}
    <div className="ev-list">
      {sessions.map(s=>(
        <div key={s.id} className="ui-card ev-row" onClick={()=>setActiveId(s.id)}>
          <div className="ev-row-main">
            <span className="ev-row-title">{s.name||`솔랭내기 #${s.id}`}</span>
            <span className="ev-row-meta">참가자 {s.participant_count}명 · {s.total_games}판 · {new Date(s.created_at).toLocaleDateString("ko-KR")}</span>
          </div>
          <span className={`ui-badge ${s.status==="done"?"green":"blue"}`}>{s.status==="done"?"완료":"진행중"}</span>
          <button className="btn-secondary ev-enter" onClick={e=>{e.stopPropagation();setActiveId(s.id);}}>입장</button>
          {isAdmin&&<button className="del-btn" onClick={async e=>{e.stopPropagation();if(!confirm("삭제하시겠습니까?"))return;await fetch("/api/solorank?sessionId="+s.id,{method:"DELETE"});reload();}}>삭제</button>}
        </div>
      ))}
    </div>
    {showCreate&&<SRCreateModal members={members} onClose={()=>setShowCreate(false)} onCreated={id=>{setShowCreate(false);setActiveId(id);reload();}}/>}
  </div>);}

const TEAM_COLORS=[{main:"#7aa2f7",bg:"rgba(83,131,232,0.15)",border:"rgba(83,131,232,0.4)",label:"🔵"},{main:"#f7768e",bg:"rgba(247,118,142,0.15)",border:"rgba(247,118,142,0.4)",label:"🔴"},{main:"#9ece6a",bg:"rgba(158,206,106,0.15)",border:"rgba(158,206,106,0.4)",label:"🟢"},{main:"#e0af68",bg:"rgba(224,175,104,0.15)",border:"rgba(224,175,104,0.4)",label:"🟡"},{main:"#bb9af7",bg:"rgba(187,154,247,0.15)",border:"rgba(187,154,247,0.4)",label:"🟣"}];

function SRCreateModal({members,onClose,onCreated}:{members:Member[];onClose:()=>void;onCreated:(id:number)=>void;}){
  const[name,setName]=useState("");
  const[totalGames,setTotalGames]=useState(5);
  const[startDate,setStartDate]=useState(()=>new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10));
  const[startTime,setStartTime]=useState("");
  const[teams,setTeams]=useState<Member[][]>([[],[]]);
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const usedIds=teams.flat().map(m=>m.id);
  function addTeam(){if(teams.length>=5)return;setTeams(prev=>[...prev,[]]);}
  function removeTeam(ti:number){if(teams.length<=2)return;setTeams(prev=>prev.filter((_,i)=>i!==ti));}
  function addMember(ti:number,m:Member){setTeams(prev=>prev.map((t,i)=>i===ti?[...t,m]:t));}
  function removeMember(ti:number,mid:number){setTeams(prev=>prev.map((t,i)=>i===ti?t.filter(m=>m.id!==mid):t));}
  async function submit(){
    if(teams.some(t=>!t.length)){setErr("각 팀에 최소 1명씩 추가하세요.");return;}
    if(!startTime){setErr("시작 시간을 입력하세요.");return;}
    setLoading(true);setErr("");
    const startAt=`${startDate}T${startTime}:00`;
    try{
      const res=await fetch("/api/solorank",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:name||null,totalGames,teams:teams.map(t=>t.map(m=>m.id)),startAt})});
      const json=await res.json();
      if(!res.ok){setErr(json.error||"생성 실패");return;}
      onCreated(json.sessionId);
    }catch{setErr("네트워크 오류");}finally{setLoading(false);}
  }
  return(<div className="modal-backdrop"><div className="modal" style={{maxWidth:900,width:"95vw"}}>
    <div className="modal-head"><span>🎮 새 솔랭내기</span><button className="modal-close" onClick={onClose}>×</button></div>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <input autoFocus placeholder="이름 (예: 9/20 솔랭내기)" value={name} onChange={e=>setName(e.target.value)}
        style={{padding:"9px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:14}}/>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:13,color:"var(--muted)",whiteSpace:"nowrap"}}>총 판수</span>
        {[3,5,7,9].map(n=>(
          <button key={n} onClick={()=>setTotalGames(n)} style={{padding:"5px 14px",borderRadius:6,fontSize:13,fontWeight:700,cursor:"pointer",border:"1px solid "+(totalGames===n?"var(--accent)":"var(--border)"),background:totalGames===n?"var(--accent)":"var(--card-2)",color:totalGames===n?"#fff":"var(--text)"}}>{n}판</button>
        ))}
        <span style={{fontSize:13,color:"var(--muted)",marginLeft:8,whiteSpace:"nowrap"}}>시작 시간</span>
        <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
          style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:13}}/>
        <input placeholder="HH:MM" value={startTime} onChange={e=>setStartTime(e.target.value)} maxLength={5}
          style={{width:80,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:13}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
        {teams.map((team,ti)=>{
          const c=TEAM_COLORS[ti%TEAM_COLORS.length];
          return(
            <div key={ti} style={{background:"var(--card-2)",borderRadius:10,padding:12,border:"1px solid var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontWeight:800,fontSize:13,color:c.main}}>{c.label} 팀{ti+1} <span style={{fontWeight:400,color:"var(--muted)",fontSize:12}}>({team.length}명)</span></span>
                {teams.length>2&&<button onClick={()=>removeTeam(ti)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:16,padding:0}}>×</button>}
              </div>
              <MemberSearchInput members={members} usedIds={usedIds} onSelect={m=>addMember(ti,m)} placeholder="클랜원 검색"/>
              <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                {team.map(m=>(<span key={m.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 8px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>{m.nickname}<button onClick={()=>removeMember(ti,m.id)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:14,padding:0}}>×</button></span>))}
              </div>
            </div>
          );
        })}
        {teams.length<5&&(
          <button onClick={addTeam} style={{minHeight:80,borderRadius:10,border:"2px dashed var(--border)",background:"transparent",color:"var(--muted)",fontSize:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        )}
      </div>
      {err&&<div className="error">{err}</div>}
      <div style={{display:"flex",gap:8}}>
        <button className="btn-primary" style={{flex:1}} onClick={submit} disabled={loading}>{loading?"생성 중..":"시작"}</button>
        <button className="btn-secondary" style={{flex:1}} onClick={onClose}>취소</button>
      </div>
    </div>
  </div></div>);}

function SRRoom({sessionId,isAdmin,onBack,members}:{sessionId:number;isAdmin:boolean;onBack:()=>void;members:Member[];}){
  const[session,setSession]=useState<any>(null);
  const[participants,setParticipants]=useState<SRParticipant[]>([]);
  const[games,setGames]=useState<SRGame[]>([]);
  const[finishPts,setFinishPts]=useState(10);
  const[finishing,setFinishing]=useState(false);
  const[syncResults,setSyncResults]=useState<Record<number,any[]>>({});
  const[syncing,setSyncing]=useState<Record<number,boolean>>({});
  const load=useCallback(async()=>{
    const res=await fetch("/api/solorank?sessionId="+sessionId);
    if(!res.ok)return;
    const json=await res.json();
    setSession(json.session);setParticipants(json.participants);setGames(json.games);
  },[sessionId]);
  useEffect(()=>{load();},[load]);
  if(!session)return null;
  const teamNos=[...new Set(participants.map(p=>p.team))].sort();
  const total=session.total_games;
  async function sync(teamNo:number){
    setSyncing(prev=>({...prev,[teamNo]:true}));
    try{
      const res=await fetch("/api/solorank/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId,teamNo})});
      const json=await res.json();
      if(res.ok)setSyncResults(prev=>({...prev,[teamNo]:json.results}));
    }finally{setSyncing(prev=>({...prev,[teamNo]:false}));}
  }
  async function finish(){
    if(!confirm(`참여자 전원에게 ${finishPts}포인트를 지급하고 종료하시겠습니까?`))return;
    setFinishing(true);
    await fetch("/api/solorank",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"finish",sessionId,points:finishPts})});
    setFinishing(false);load();
  }
  return(<div>
    <div style={{marginBottom:12}}><button className="btn-secondary" onClick={onBack}>← 목록으로</button></div>
    <div style={{fontWeight:800,fontSize:18,marginBottom:4}}>{session.name||`솔랭내기 #${sessionId}`}</div>
    {session.start_at&&<div style={{fontSize:12,color:"var(--muted)",marginBottom:16}}>시작 시간: {new Date(session.start_at).toLocaleString("ko-KR")} 이후 솔로랭크 기준</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
      {teamNos.map(teamNo=>{
        const c=TEAM_COLORS[(teamNo-1)%TEAM_COLORS.length];
        const teamMembers=participants.filter(p=>p.team===teamNo);
        const results=syncResults[teamNo]??[];
        const teamTotal=results.reduce((s:number,r:any)=>s+(r.score??0),0);
        return(
          <div key={teamNo} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontWeight:800,fontSize:15,color:c.main}}>{c.label} 팀{teamNo}</span>
              {results.length>0&&<span style={{fontSize:13,fontWeight:700,color:"var(--win-text)"}}>(팀 점수: {teamTotal}점)</span>}
              {isAdmin&&session.status!=="done"&&(
                <button onClick={()=>sync(teamNo)} disabled={syncing[teamNo]} style={{marginLeft:"auto",padding:"5px 14px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",border:"1px solid "+c.border,background:c.bg,color:c.main}}>
                  {syncing[teamNo]?"조회 중..":"🔄 동기화"}
                </button>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {teamMembers.map(p=>{
                const r=results.find((x:any)=>x.memberId===p.member_id);
                return(
                  <div key={p.id} style={{background:"var(--card-2)",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:r?.games?.length?6:0}}>
                      <span style={{fontWeight:700,fontSize:14}}>{p.nickname}</span>
                      {r&&!r.error&&<span style={{fontSize:13,fontWeight:800,color:r.score>=0?"var(--win-text)":"var(--loss-text)"}}>{r.score>=0?"+":""}{r.score}점</span>}
                      {r?.error&&<span style={{fontSize:12,color:"var(--loss-text)"}}>{r.error}</span>}
                      {!r&&<span style={{fontSize:12,color:"var(--muted)"}}>-</span>}
                    </div>
                    {r?.games?.length>0&&(
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {r.games.map((g:any,i:number)=>(
                          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                            <div style={{width:28,height:28,borderRadius:6,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",background:g.win?"rgba(46,204,113,0.2)":"rgba(231,76,60,0.2)",border:"1px solid "+(g.win?"rgba(46,204,113,0.5)":"rgba(231,76,60,0.5)"),color:g.win?"#2ecc71":"#e74c3c"}}>{g.win?"W":"L"}</div>
                            {g.bonus>0&&<div style={{fontSize:9,color:"#e0af68",fontWeight:800}}>+{g.bonus}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
    {isAdmin&&session.status!=="done"&&(
      <div style={{display:"flex",alignItems:"center",gap:10,background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 18px",marginTop:16}}>
        <span style={{fontSize:13,color:"var(--muted)"}}>참여 포인트</span>
        <input type="number" min={1} value={finishPts} onChange={e=>setFinishPts(Number(e.target.value))}
          style={{width:70,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card-2)",color:"var(--text)",fontSize:13,textAlign:"center"}}/>
        <span style={{fontSize:12,color:"var(--muted)"}}>pt · 참여자 전원</span>
        <button className="btn-primary" onClick={finish} disabled={finishing} style={{marginLeft:"auto"}}>{finishing?"지급 중..":"이벤트 종료 & 포인트 지급"}</button>
      </div>
    )}
    {session.status==="done"&&<div style={{color:"var(--win-text)",fontWeight:700,fontSize:15,marginTop:16}}>✅ 이벤트 종료 (포인트 지급 완료)</div>}
  </div>);}

export default function EventPage(){const[eventTab,setEventTab]=useState<"auction"|"solorank">("auction");
  return(<div className="ev">
    <div className="ui-page-head">
      <div>
        <h2>이벤트</h2>
        <p>경매내전과 솔랭내기를 열고 진행해요.</p>
      </div>
    </div>
    <div className="ui-tabs">
      <button className={eventTab==="auction"?"on":""} onClick={()=>setEventTab("auction")}>경매내전</button>
      <button className={eventTab==="solorank"?"on":""} onClick={()=>setEventTab("solorank")}>솔랭내기</button>
    </div>
    {eventTab==="auction"&&<AuctionContent/>}
    {eventTab==="solorank"&&<SoloRankEvent/>}
  </div>);}
