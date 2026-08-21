const mysql = require('mysql2/promise');

const LINE_WEIGHTS = {
  TOP: [0.35, 0.35, 0.10, 0.20],
  JG:  [0.35, 0.20, 0.25, 0.20],
  MID: [0.35, 0.35, 0.10, 0.20],
  ADC: [0.35, 0.50, 0.05, 0.10],
  SUP: [0.35, 0.00, 0.45, 0.20],
};
const DEFAULT_W = [0.35, 0.35, 0.10, 0.20];

function calcScore(p, team, isWin) {
  const [wKda, wDmg, wVis, wKp] = LINE_WEIGHTS[(p.line || '').toUpperCase()] ?? DEFAULT_W;
  const kda = (p.kills + p.assists) / Math.max(p.deaths, 1);
  const maxKda = Math.max(...team.map(x => (x.kills + x.assists) / Math.max(x.deaths, 1)), 1);
  const maxDmg = Math.max(...team.map(x => x.damage), 1);
  const maxVis = Math.max(...team.map(x => x.vision_score), 1);
  const teamKills = Math.max(team.reduce((s, x) => s + x.kills, 0), 1);
  const kp = (p.kills + p.assists) / teamKills;
  return ((kda / maxKda) * wKda + (p.damage / maxDmg) * wDmg + (p.vision_score / maxVis) * wVis + kp * wKp) * (isWin ? 1.2 : 1);
}

function pickMvp(team, isWin) {
  if (!team.length) return null;
  return team.reduce((best, p) => calcScore(p, team, isWin) >= calcScore(best, team, isWin) ? p : best).member_id;
}

async function main() {
  const pool = mysql.createPool({ host: '127.0.0.1', port: 3301, user: 'markany', password: 'markany1@', database: 'lolclient' });

  const [matches] = await pool.query(
    `SELECT sm.id, sm.winner_team, sm.played_at
     FROM scrim_matches sm
     WHERE sm.status = 'done'
       AND NOT EXISTS (
         SELECT 1 FROM point_logs pl
         WHERE pl.ref_id = sm.id AND pl.ref_table = 'scrim_match' AND pl.type = 'scrim_mvp'
       )`
  );
  console.log('소급 대상 경기 수:', matches.length);
  if (!matches.length) { await pool.end(); return; }

  const matchIds = matches.map(m => m.id);
  const ph = matchIds.map(() => '?').join(',');
  const [parts] = await pool.query(
    `SELECT match_id, member_id, team, line, kills, deaths, assists, damage, vision_score
     FROM scrim_participants WHERE match_id IN (${ph})`,
    matchIds
  );

  const byMatch = new Map();
  for (const p of parts) {
    if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, []);
    byMatch.get(p.match_id).push(p);
  }

  let updated = 0;
  for (const m of matches) {
    const ps = byMatch.get(m.id) ?? [];
    if (!ps.length) continue;
    const t1 = ps.filter(p => p.team === 1);
    const t2 = ps.filter(p => p.team === 2);
    const mvp1 = pickMvp(t1, m.winner_team === 1);
    const mvp2 = pickMvp(t2, m.winner_team === 2);
    const label = String(m.played_at).slice(5, 16);

    for (const mvpId of [mvp1, mvp2]) {
      if (!mvpId) continue;
      await pool.query(
        `INSERT INTO point_logs (member_id, points, type, games, comment, given_by, ref_id, party_count, ref_table)
         VALUES (?, 1, 'scrim_mvp', 0, ?, NULL, ?, 0, 'scrim_match')`,
        [mvpId, `내전 MVP (${label})`, m.id]
      );
      await pool.query('UPDATE members SET total_points = total_points + 1 WHERE id = ?', [mvpId]);
      console.log(`  MVP +1 지급: member_id=${mvpId} (경기 #${m.id})`);
    }
    updated++;
  }

  console.log(`\n완료: ${updated}/${matches.length}경기 MVP 포인트 지급`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
