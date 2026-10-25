// 기존 내전 경기(Riot 자동 동기화분) 중 최근 N경기의 경기 시간(game_duration)을 채운다.
// DPM / 분당 CS 계산용. 한 번만 실행하면 된다.
//
// 사용법 (프로젝트 폴더에서):
//   node scripts/backfill-duration.js        → 최근 20경기
//   node scripts/backfill-duration.js 30     → 최근 30경기
//
// .env.local의 RIOT_API_KEY, RIOT_REGION, DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME 을 사용한다.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// .env.local 읽기 (이미 설정된 환경변수는 덮어쓰지 않음)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const COUNT = Math.max(1, Number(process.argv[2]) || 20);
const API_KEY = process.env.RIOT_API_KEY;
const REGION = process.env.RIOT_REGION || 'asia';

// gameEndTimestamp가 있으면 gameDuration은 초, 없으면 밀리초 (lib/scrim.ts matchDurationSec와 동일)
function durationSec(info) {
  const d = Number(info.gameDuration || 0);
  if (!d) return 0;
  return Math.round(info.gameEndTimestamp ? d : d / 1000);
}

async function main() {
  if (!API_KEY) throw new Error('RIOT_API_KEY가 없습니다. .env.local을 확인하세요.');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // 서버가 아직 새 코드로 재시작되지 않았어도 동작하도록 컬럼을 먼저 보장
  await pool.query('ALTER TABLE scrim_matches ADD COLUMN IF NOT EXISTS game_duration INT NOT NULL DEFAULT 0');

  const [rows] = await pool.query(
    `SELECT id, riot_match_id, played_at FROM scrim_matches
     WHERE riot_match_id IS NOT NULL AND game_duration = 0 AND status = 'done'
     ORDER BY played_at DESC LIMIT ?`,
    [COUNT]
  );
  console.log(`대상 경기: ${rows.length}개 (최근 ${COUNT}경기 기준)`);

  let updated = 0;
  for (const r of rows) {
    const res = await fetch(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/${r.riot_match_id}`, {
      headers: { 'X-Riot-Token': API_KEY },
    });
    if (res.status === 429) { console.log('요청 한도 초과 — 2분 뒤 다시 실행하세요.'); break; }
    if (!res.ok) { console.log(`  ✗ ${r.riot_match_id} (HTTP ${res.status})`); continue; }
    const dur = durationSec((await res.json()).info || {});
    if (dur > 0) {
      await pool.query('UPDATE scrim_matches SET game_duration = ? WHERE id = ?', [dur, r.id]);
      updated++;
      console.log(`  ✓ #${r.id} ${r.riot_match_id} → ${Math.floor(dur / 60)}분 ${dur % 60}초`);
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }

  console.log(`완료: ${updated}개 경기 시간 저장`);
  await pool.end();
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
