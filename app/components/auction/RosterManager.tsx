"use client";

import { useEffect, useState } from "react";
import {
  ChampImg, LineIcon, TierText, LINES, LINE_LABEL, searchMembers,
  type Member, type RosterEntry,
} from "./shared";

interface Champ { name_en: string; name_ko: string; }

async function saveRoster(memberId: number, line: string, champs: string[]) {
  await fetch("/api/auction/roster", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId, line: line || null, champ1: champs[0] || null, champ2: champs[1] || null, champ3: champs[2] || null }),
  });
}

/** 참여자 추가/수정 공용 모달: 라인 1개 + 주챔피언 최대 3개 선택. */
function RosterEntryModal({ title, initialLine, initialChamps, champList, submitLabel, onSubmit, onClose }: {
  title: string; initialLine: string; initialChamps: string[]; champList: Champ[];
  submitLabel: string; onSubmit: (line: string, champs: string[]) => Promise<void>; onClose: () => void;
}) {
  const [line, setLine] = useState(initialLine);
  const [champs, setChamps] = useState<string[]>(initialChamps);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const filtered = q ? champList.filter(c => c.name_en.toLowerCase().includes(q.toLowerCase()) || c.name_ko.includes(q)) : champList;
  function toggle(name: string) {
    if (champs.includes(name)) setChamps(prev => prev.filter(x => x !== name));
    else if (champs.length < 3) setChamps(prev => [...prev, name]);
  }
  async function submit() {
    setSaving(true);
    try { await onSubmit(line, champs); } finally { setSaving(false); }
  }
  return (
    <div className="modal-backdrop">
      <div className="modal auc-entry-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="auc-field">
          <span className="auc-label">라인</span>
          <div className="auc-line-pick">
            {LINES.map(l => (
              <button key={l} className={line === l ? "on" : ""} onClick={() => setLine(prev => prev === l ? "" : l)}>
                <LineIcon line={l} size={16} />{LINE_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="auc-field">
          <span className="auc-label">주챔피언 <em>{champs.length}/3 · 선택한 챔피언을 누르면 빠져요</em></span>
          <div className="auc-champ-slots">
            {[0, 1, 2].map(i => (
              <button key={i} className="auc-champ-slot" disabled={!champs[i]} title={champs[i] ? "선택 해제" : undefined}
                onClick={() => { if (champs[i]) setChamps(prev => prev.filter((_, idx) => idx !== i)); }}>
                <ChampImg name={champs[i] ?? null} size={44} />
                {champs[i] && <span className="auc-champ-x">×</span>}
              </button>
            ))}
          </div>
          <input className="ui-input" value={q} onChange={e => setQ(e.target.value)} placeholder="챔피언 검색 (한글/영문)" />
          <div className="auc-champ-grid">
            {filtered.map(c => {
              const sel = champs.includes(c.name_en);
              return (
                <button key={c.name_en} title={c.name_ko} onClick={() => toggle(c.name_en)}
                  className={"auc-champ-opt" + (sel ? " on" : "") + (!sel && champs.length >= 3 ? " off" : "")}>
                  <ChampImg name={c.name_en} size={40} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="auc-modal-foot">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "저장 중…" : submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function RosterCard({ r, isAdmin, onEdit, onRemove }: { r: RosterEntry; isAdmin: boolean; onEdit: () => void; onRemove: () => void; }) {
  const champs = [r.champ1, r.champ2, r.champ3].filter(Boolean) as string[];
  return (
    <div className="auc-roster-card">
      <div className="auc-roster-top">
        <div className="auc-roster-name">
          <strong>{r.nickname}</strong>
          <TierText tier={r.solo_tier} rank={r.solo_rank} />
        </div>
        {isAdmin && (
          <div className="auc-row-actions">
            <button className="auc-mini-btn" onClick={onEdit}>수정</button>
            <button className="auc-mini-btn danger" onClick={onRemove} aria-label="참여자 제거">×</button>
          </div>
        )}
      </div>
      {champs.length > 0 && <div className="auc-champ-row">{champs.map((c, i) => <ChampImg key={i} name={c} size={30} />)}</div>}
    </div>
  );
}

/** 경매 참여자(선수 후보) 관리: 라인별 5열 보드. */
export default function RosterManager({ members, roster, isAdmin, onSaved }: {
  members: Member[]; roster: RosterEntry[]; isAdmin: boolean; onSaved: () => void;
}) {
  const [editTarget, setEditTarget] = useState<RosterEntry | null>(null);
  const [adding, setAdding] = useState<Member | null>(null);
  const [addQ, setAddQ] = useState("");
  const [champList, setChampList] = useState<Champ[]>([]);
  useEffect(() => { fetch("/api/champions").then(r => r.json()).then(j => setChampList(j.champions ?? [])); }, []);

  const rosterIds = new Set(roster.map(r => r.member_id));
  const addCandidates = addQ ? searchMembers(members.filter(m => !rosterIds.has(m.id)), addQ) : [];
  const unassigned = roster.filter(r => !r.line);

  function startAdd(m: Member) { setAddQ(""); setAdding(m); }
  async function removeMember(memberId: number) {
    if (!confirm("참여자 목록에서 제거하시겠습니까?")) return;
    await fetch("/api/auction/roster", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }) });
    onSaved();
  }

  return (
    <div className="auc-roster">
      <div className="auc-roster-head">
        <div>
          <h3 className="ui-section-title">참여자 관리 <span className="sub">경매에 포함될 참여자 · {roster.length}명</span></h3>
        </div>
        {isAdmin && (
          <div className="auc-search auc-roster-add">
            <input className="ui-input" value={addQ} onChange={e => setAddQ(e.target.value)} placeholder="+ 참여자 추가 (이름 검색)"
              onKeyDown={e => { if (e.key === "Enter" && addCandidates.length > 0) startAdd(addCandidates[0]); }} />
            {addCandidates.length > 0 && (
              <div className="slot-candidates auc-search-list">
                {addCandidates.map(m => (<button key={m.id} onMouseDown={() => startAdd(m)}>{m.nickname}</button>))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="auc-roster-board">
        {LINES.map(line => {
          const list = roster.filter(r => r.line === line);
          return (
            <div key={line} className="auc-roster-col">
              <div className="auc-roster-col-head"><LineIcon line={line} size={16} />{LINE_LABEL[line]}<span className="auc-count">{list.length}</span></div>
              <div className="auc-roster-col-body">
                {list.map(r => (
                  <RosterCard key={r.member_id} r={r} isAdmin={isAdmin} onEdit={() => setEditTarget(r)} onRemove={() => removeMember(r.member_id)} />
                ))}
                {list.length === 0 && <div className="auc-roster-empty">없음</div>}
              </div>
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="auc-unassigned">
          <div className="auc-label">라인 미지정 <em>{unassigned.length}명</em></div>
          <div className="auc-unassigned-list">
            {unassigned.map(r => (
              <span key={r.member_id} className="auc-chip lg">
                {r.nickname}
                {isAdmin && (<>
                  <button className="auc-mini-btn" onClick={() => setEditTarget(r)}>수정</button>
                  <button className="auc-mini-btn danger" onClick={() => removeMember(r.member_id)} aria-label="참여자 제거">×</button>
                </>)}
              </span>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <RosterEntryModal
          key={"add-" + adding.id}
          title={`${adding.nickname} 추가`} submitLabel="추가"
          initialLine="" initialChamps={[]} champList={champList}
          onClose={() => setAdding(null)}
          onSubmit={async (line, champs) => { await saveRoster(adding.id, line, champs); setAdding(null); onSaved(); }}
        />
      )}
      {editTarget && (
        <RosterEntryModal
          key={"edit-" + editTarget.member_id}
          title={`${editTarget.nickname} 수정`} submitLabel="저장"
          initialLine={editTarget.line ?? ""}
          initialChamps={[editTarget.champ1, editTarget.champ2, editTarget.champ3].filter(Boolean) as string[]}
          champList={champList}
          onClose={() => setEditTarget(null)}
          onSubmit={async (line, champs) => { await saveRoster(editTarget.member_id, line, champs); setEditTarget(null); onSaved(); }}
        />
      )}
    </div>
  );
}
