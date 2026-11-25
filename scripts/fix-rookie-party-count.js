// 수습 파티 참여 횟수 보정 (이미 펑한 파티)
// 원인: 펑할 때 history를 "있냐/없냐"만 봐서 파티원이 바뀌어도 항상 1회로 기록됨
// 기준: 파티 생성 = 1파티, 이후 "새로운 사람이 들어온" 명단 변경마다 +1 (빠지기만 한 건 제외)
//       그중 수습이 들어 있던 명단만 센다. 자유랭크/내전만 party_count에 반영(기존 로직과 동일).
//
// 사용법:
//   node scripts\fix-rookie-party-count.js          ← 미리보기 (DB 안 바뀜)
//   node scripts\fix-rookie-party-count.js --apply  ← 실제 반영
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

// app/api/party/route.ts 의 countPartiesFromHistory 와 같은 로직
function countPartiesFromHistory(rows, nickname) {
  const snaps = [];
  let cur = null;
  let curStart = 0;
  for (const r of rows) {
    const t = new Date(r.added_at).getTime();
    if (!cur || cur.has(r.nickname) || Math.abs(t - curStart) > 2000) {
      cur = new Set();
      curStart = t;
      snaps.push(cur);
    }
    cur.add(r.nickname);
  }
  let count = 0;
  let prev = null;
  for (const s of snaps) {
    const isNewParty = !prev || [...s].some((n) => !prev.has(n));
    if (isNewParty && s.has(nickname)) count++;
    prev = s;
  }
  return count;
}

async function run() {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3301,
    user: 'markany', password: 'markany1@', database: 'lolclient'
  });

  const [logs] = await c.query(`
    SELECT pl.id, pl.member_id, pl.party_count, pl.comment, pl.ref_id AS party_id, p.mode, a.game_name
    FROM point_logs pl
    JOIN parties p ON p.id = pl.ref_id AND pl.ref_table = 'party'
    LEFT JOIN accounts a ON a.member_id = pl.member_id AND a.is_main = 1
    WHERE pl.type = 'rookie_session'
    ORDER BY pl.id`);

  const histCache = new Map();
  let changed = 0, skipped = 0;
  for (const l of logs) {
    if (!l.game_name) { console.log(`[건너뜀] log#${l.id} member=${l.member_id}: 본계정 없음`); skipped++; continue; }
    if (!histCache.has(l.party_id)) {
      const [h] = await c.query(
        'SELECT nickname, added_at FROM party_participant_history WHERE party_id = ? ORDER BY id', [l.party_id]);
      histCache.set(l.party_id, h);
    }
    const cnt = countPartiesFromHistory(histCache.get(l.party_id), l.game_name);
    if (cnt === 0) { console.log(`[건너뜀] log#${l.id} ${l.game_name} party#${l.party_id}: history에 닉네임 없음 (닉 변경?)`); skipped++; continue; }

    const countable = l.mode === 'flex' || l.mode === 'scrim';
    const newCount = countable ? cnt : 0;
    const newComment = (l.comment || '').replace(/수습 파티 \d+회/, `수습 파티 ${cnt}회`);
    if (Number(l.party_count) === newCount && newComment === l.comment) continue;

    console.log(`log#${l.id} ${l.game_name} party#${l.party_id}(${l.mode}): ${l.party_count} → ${newCount}  | ${newComment}`);
    changed++;
    if (APPLY) {
      await c.query('UPDATE point_logs SET party_count = ?, comment = ? WHERE id = ?', [newCount, newComment, l.id]);
    }
  }

  console.log(`\n대상 ${changed}건, 건너뜀 ${skipped}건 — ${APPLY ? '반영 완료' : '미리보기만 했습니다. 반영하려면 --apply'}`);
  await c.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
