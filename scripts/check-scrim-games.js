const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((a, l) => {
  const [k, ...v] = l.replace(/\r/, '').split('=');
  if (k && !k.startsWith('#')) a[k.trim()] = v.join('=').trim();
  return a;
}, {});
const mysql = require('mysql2/promise');
(async () => {
  const pool = await mysql.createPool({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME });

  const [rows] = await pool.query(
    `SELECT nickname, DATE(last_achieved_at) as last_achieved_at FROM members WHERE nickname = '가 을'`
  );
  console.log('lastAchievedAt:', JSON.stringify(rows));

  // 달성일 이후 내전 판수
  const lastAchieved = rows[0]?.last_achieved_at;
  if (lastAchieved) {
    const [scrimRows] = await pool.query(
      `SELECT COUNT(*) as cnt FROM scrim_participants sp
       JOIN scrim_matches sm ON sm.id = sp.match_id AND sm.status = 'done'
       JOIN members m ON m.id = sp.member_id
       WHERE m.nickname = '가 을' AND DATE(sm.played_at) > ?`,
      [lastAchieved]
    );
    console.log(`달성일(${lastAchieved}) 이후 내전:`, JSON.stringify(scrimRows));
  }

  pool.end();
})();
