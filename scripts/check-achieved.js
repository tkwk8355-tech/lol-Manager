const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3301,
    user: 'markany', password: 'markany1@', database: 'lolclient'
  });

  const ids = [35, 51, 63, 77, 78, 80, 81, 82, 89, 90, 94];

  for (const id of ids) {
    const [[m]] = await c.query('SELECT id, nickname, DATE(promoted_at) as p FROM members WHERE id=?', [id]);
    const [logs] = await c.query(
      'SELECT DATE(created_at) as d, type, games FROM point_logs WHERE member_id=? AND created_at>=? ORDER BY created_at',
      [id, m.p]
    );
    const [scrims] = await c.query(
      'SELECT DATE(sm.played_at) as d FROM scrim_participants sp JOIN scrim_matches sm ON sm.id=sp.match_id WHERE sp.member_id=? AND sm.played_at>=? AND sm.status="done" ORDER BY sm.played_at',
      [id, m.p]
    );
    console.log(`\n--- ${m.nickname} (id=${id}) promoted: ${m.p}`);
    logs.forEach(l => console.log(`  point: ${l.d}  ${l.type}  ${l.games}판`));
    scrims.forEach(s => console.log(`  scrim: ${s.d}`));
    if (!logs.length && !scrims.length) console.log('  (기록없음)');
  }

  await c.end();
}

run().catch(console.error);
