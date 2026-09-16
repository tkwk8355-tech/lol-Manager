const mysql = require('mysql2/promise');

async function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

async function run() {
  const pool = await mysql.createPool({
    host: '127.0.0.1', port: 3301,
    user: 'markany', password: 'markany1@', database: 'lolclient'
  });

  const [members] = await pool.query(
    "SELECT id, nickname, DATE(promoted_at) as promoted_at FROM members WHERE promoted_at IS NOT NULL AND position='클랜원'"
  );
  console.log('총 클랜원:', members.length);

  for (const m of members) {
    const base = typeof m.promoted_at === 'string' ? m.promoted_at : m.promoted_at.toISOString().slice(0,10);
    let deadline = await addDays(base, 14);
    let lastDeadline = base;

    for (let i = 0; i < 100; i++) {
      const today = new Date().toISOString().slice(0, 10);
      if (deadline > today) break;

      const [[ar]] = await pool.query(
        'SELECT COALESCE(SUM(pl.games),0) as g FROM point_logs pl LEFT JOIN parties p ON p.id=pl.ref_id AND pl.ref_table="party" WHERE pl.member_id=? AND pl.type="aram" AND DATE(COALESCE(p.start_at,pl.created_at)) > ? AND DATE(COALESCE(p.start_at,pl.created_at)) <= ?',
        [m.id, lastDeadline, deadline]
      );
      const [[nr]] = await pool.query(
        'SELECT COALESCE(SUM(pl.games),0) as g FROM point_logs pl LEFT JOIN parties p ON p.id=pl.ref_id AND pl.ref_table="party" WHERE pl.member_id=? AND pl.type IN ("normal","flex","solo") AND DATE(COALESCE(p.start_at,pl.created_at)) > ? AND DATE(COALESCE(p.start_at,pl.created_at)) <= ?',
        [m.id, lastDeadline, deadline]
      );
      const [[sr]] = await pool.query(
        'SELECT COUNT(*) as g FROM scrim_participants sp JOIN scrim_matches sm ON sm.id=sp.match_id AND sm.status="done" WHERE sp.member_id=? AND DATE(sm.played_at) > ? AND DATE(sm.played_at) <= ?',
        [m.id, lastDeadline, deadline]
      );

      const aram = Number(ar.g || 0);
      const normal = Number(nr.g || 0) + Number(sr.g || 0);

      if (Math.floor(aram / 2) + normal >= 3) {
        lastDeadline = deadline;
        deadline = await addDays(deadline, 14);
      } else {
        break;
      }
    }

    if (lastDeadline > base) {
      await pool.query('UPDATE members SET last_achieved_at=? WHERE id=?', [lastDeadline, m.id]);
      console.log(`[갱신] ${m.nickname} (id=${m.id}) -> ${lastDeadline}`);
    } else {
      console.log(`[미달] ${m.nickname} (id=${m.id}) promoted=${base}`);
    }
  }

  await pool.end();
  console.log('완료');
}

run().catch(console.error);
