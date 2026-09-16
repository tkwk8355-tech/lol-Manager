const mysql = require('mysql2/promise');

async function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function run() {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3301,
    user: 'markany', password: 'markany1@', database: 'lolclient'
  });

  const [members] = await c.query(
    "SELECT id, nickname, DATE(promoted_at) as p, last_achieved_at FROM members WHERE promoted_at IS NOT NULL AND position='클랜원' AND status='active' ORDER BY promoted_at"
  );

  for (const m of members) {
    const base = m.p instanceof Date ? m.p.toISOString().slice(0, 10) : String(m.p);
    const la = m.last_achieved_at
      ? (m.last_achieved_at instanceof Date ? m.last_achieved_at.toISOString().slice(0, 10) : String(m.last_achieved_at))
      : null;

    // la가 있으면 다음 구간, 없으면 첫 구간
    const from = la || base;
    const deadline = await addDays(from, 14);
    const today = new Date().toISOString().slice(0, 10);

    const [[ar]] = await c.query(
      'SELECT COALESCE(SUM(games),0) as g FROM point_logs WHERE member_id=? AND type="aram" AND DATE(created_at)>? AND DATE(created_at)<=?',
      [m.id, from, deadline]
    );
    const [[nr]] = await c.query(
      'SELECT COALESCE(SUM(games),0) as g FROM point_logs WHERE member_id=? AND type IN ("normal","flex","solo") AND DATE(created_at)>? AND DATE(created_at)<=?',
      [m.id, from, deadline]
    );
    const [[sr]] = await c.query(
      'SELECT COUNT(*) as g FROM scrim_participants sp JOIN scrim_matches sm ON sm.id=sp.match_id WHERE sp.member_id=? AND sm.status="done" AND DATE(sm.played_at)>? AND DATE(sm.played_at)<=?',
      [m.id, from, deadline]
    );

    const aram = Number(ar.g);
    const normal = Number(nr.g) + Number(sr.g);
    const achieved = Math.floor(aram / 2) + normal >= 3;
    const deadlinePassed = deadline <= today;

    console.log(
      `${m.nickname.padEnd(16)} | 달성일: ${la || 'NULL'.padEnd(10)} | 현재구간: ${from}~${deadline} | aram:${aram} normal+scrim:${normal} | ${deadlinePassed ? (achieved ? '✅달성' : '❌미달') : '⏳마감전'}`
    );
  }

  await c.end();
}

run().catch(console.error);
