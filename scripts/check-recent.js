const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3301,
    user: 'markany', password: 'markany1@', database: 'lolclient'
  });

  const targets = [
    { id: 50,  p: '2026-08-22' }, // 개발자
    { id: 58,  p: '2026-08-23' }, // 무무맛좀봐라
    { id: 72,  p: '2026-08-25' }, // 큰사람
    { id: 77,  p: '2026-09-05' }, // 블랙판사
    { id: 78,  p: '2026-09-06' }, // kapila
    { id: 80,  p: '2026-09-06' }, // 꾼탁
    { id: 81,  p: '2026-09-06' }, // 응애
    { id: 82,  p: '2026-09-08' }, // 비야요
    { id: 89,  p: '2026-09-08' }, // 로망
    { id: 90,  p: '2026-09-11' }, // CROCO
    { id: 94,  p: '2026-09-13' }, // 희생
    { id: 93,  p: '2026-09-14' }, // 낭만
  ];

  const today = new Date().toISOString().slice(0, 10);

  for (const t of targets) {
    const [[m]] = await c.query('SELECT nickname, last_achieved_at FROM members WHERE id=?', [t.id]);
    const la = m.last_achieved_at ? String(m.last_achieved_at).slice(0, 10) : null;

    // 구간 순회
    let from = t.p;
    let lastDeadline = la;

    for (let i = 0; i < 20; i++) {
      const d = new Date(from); d.setDate(d.getDate() + 14);
      const deadline = d.toISOString().slice(0, 10);
      if (deadline > today) {
        console.log(`⏳ ${m.nickname} | 현재구간: ${from}~${deadline} (마감전)`);
        break;
      }

      const [[ar]] = await c.query('SELECT COALESCE(SUM(games),0) as g FROM point_logs WHERE member_id=? AND type="aram" AND created_at>? AND created_at<=?', [t.id, from, deadline]);
      const [[nr]] = await c.query('SELECT COALESCE(SUM(games),0) as g FROM point_logs WHERE member_id=? AND type IN ("normal","flex","solo") AND created_at>? AND created_at<=?', [t.id, from, deadline]);
      const [[sr]] = await c.query('SELECT COUNT(*) as g FROM scrim_participants sp JOIN scrim_matches sm ON sm.id=sp.match_id WHERE sp.member_id=? AND sm.status="done" AND sm.played_at>? AND sm.played_at<=?', [t.id, from, deadline]);
      const aram = Number(ar.g), normal = Number(nr.g) + Number(sr.g);

      if (Math.floor(aram / 2) + normal >= 3) {
        lastDeadline = deadline;
        from = deadline;
      } else {
        console.log(`X ${m.nickname} | 미달구간: ${from}~${deadline} | aram:${aram} n+s:${normal} | DB:${la}`);
        break;
      }
    }

    if (lastDeadline && lastDeadline !== la) {
      await c.query('UPDATE members SET last_achieved_at=? WHERE id=?', [lastDeadline, t.id]);
      console.log(`V ${m.nickname} | 업데이트: ${la} -> ${lastDeadline}`);
    } else if (lastDeadline === la) {
      console.log(`- ${m.nickname} | 변경없음: ${la}`);
    }
  }

  await c.end();
}

run().catch(console.error);
