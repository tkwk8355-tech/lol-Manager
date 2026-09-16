const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3301,
    user: 'markany', password: 'markany1@', database: 'lolclient'
  });

  const [members] = await c.query(
    "SELECT id, nickname, DATE_FORMAT(promoted_at,'%Y-%m-%d') as p FROM members WHERE promoted_at IS NOT NULL AND position='클랜원' AND status='active' ORDER BY promoted_at"
  );

  const [[{today}]] = await c.query('SELECT DATE_FORMAT(NOW(),"%Y-%m-%d") as today');

  for (const m of members) {
    const [logs] = await c.query(
      'SELECT DATE_FORMAT(created_at,"%Y-%m-%d") as d, type, games FROM point_logs WHERE member_id=? AND type IN ("aram","normal","flex","solo") AND created_at>=? ORDER BY created_at',
      [m.id, m.p]
    );
    const [scrims] = await c.query(
      'SELECT DATE_FORMAT(sm.played_at,"%Y-%m-%d") as d FROM scrim_participants sp JOIN scrim_matches sm ON sm.id=sp.match_id WHERE sp.member_id=? AND sm.status="done" AND sm.played_at>=? ORDER BY sm.played_at',
      [m.id, m.p]
    );

    // 날짜별 합산
    const dayMap = new Map();
    for (const l of logs) {
      if (!dayMap.has(l.d)) dayMap.set(l.d, { aram: 0, normal: 0 });
      if (l.type === 'aram') dayMap.get(l.d).aram += Number(l.games);
      else dayMap.get(l.d).normal += Number(l.games);
    }
    for (const s of scrims) {
      if (!dayMap.has(s.d)) dayMap.set(s.d, { aram: 0, normal: 0 });
      dayMap.get(s.d).normal += 1;
    }

    const days = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    // 슬라이딩 윈도우: 각 날짜를 윈도우 끝으로 보고 14일 내 누적
    let lastAchievedAt = null;
    for (let i = 0; i < days.length; i++) {
      const windowEnd = days[i][0];
      const [[{windowStart}]] = await c.query(
        'SELECT DATE_FORMAT(DATE_SUB(?,INTERVAL 14 DAY),"%Y-%m-%d") as windowStart', [windowEnd]
      );
      let aram = 0, normal = 0;
      for (const [day, g] of days) {
        if (day < windowStart) continue;
        if (day > windowEnd) break;
        aram += g.aram;
        normal += g.normal;
      }
      if (Math.floor(aram / 2) + normal >= 3) {
        lastAchievedAt = windowEnd;
      }
    }

    if (lastAchievedAt) {
      await c.query('UPDATE members SET last_achieved_at=? WHERE id=?', [lastAchievedAt, m.id]);
      console.log(`[갱신] ${m.nickname} -> ${lastAchievedAt}`);
    } else {
      await c.query('UPDATE members SET last_achieved_at=NULL WHERE id=?', [m.id]);
      console.log(`[미달] ${m.nickname}`);
    }
  }

  await c.end();
  console.log('완료');
}

run().catch(console.error);
