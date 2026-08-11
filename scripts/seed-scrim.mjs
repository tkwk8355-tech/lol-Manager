import { createPool } from "mysql2/promise";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const cfg = {};
env.split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) cfg[k.trim()] = v.join("=").trim(); });

const pool = createPool({ host: cfg.DB_HOST, port: Number(cfg.DB_PORT || 3306), user: cfg.DB_USER, password: cfg.DB_PASSWORD, database: cfg.DB_NAME });

// 10명 선택 (실제 id 기준)
const PLAYERS = [
  { id: 1,  name: "옵타론" },
  { id: 2,  name: "옐니쓰" },
  { id: 3,  name: "내당맨" },
  { id: 4,  name: "님들블루좀" },
  { id: 5,  name: "타꼬야" },
  { id: 6,  name: "공주의자세" },
  { id: 7,  name: "뒷골목아기고양이" },
  { id: 8,  name: "이길수있다화이팅" },
  { id: 9,  name: "딩거개충새기" },
  { id: 10, name: "chiychi" },
];

const LINES = ["TOP", "JG", "MID", "ADC", "SUP"];

const CHAMPS = [
  "Ahri","Jinx","Yasuo","Zed","Lux","Thresh","LeeSin","Ezreal","Caitlyn","Jhin",
  "Akali","Katarina","Vayne","Ashe","Blitzcrank","Nautilus","Graves","Nidalee",
  "Orianna","Syndra","Veigar","Fizz","Irelia","Camille","Darius","Garen","Malphite",
  "Nasus","Renekton","Sett","Fiora","Riven","Yone","Viego","Kaisa","Xayah","Jinx",
];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 3판 진행: 매 판마다 10명을 5:5로 나눠서 라인 배정
for (let game = 1; game <= 3; game++) {
  // 10명 섞기
  const shuffled = [...PLAYERS].sort(() => Math.random() - 0.5);
  const team1 = shuffled.slice(0, 5);
  const team2 = shuffled.slice(5, 10);
  const winnerTeam = rand(1, 2);

  const [matchRes] = await pool.query(
    `INSERT INTO scrim_matches (mode, status, winner_team, note, played_at) VALUES (?, 'done', ?, ?, NOW() - INTERVAL ? DAY)`,
    ["rift", winnerTeam, `테스트 ${game}판`, 3 - game]
  );
  const matchId = matchRes.insertId;
  console.log(`\n[게임 ${game}] matchId=${matchId}, 승리팀=${winnerTeam}`);

  // 챔피언 중복 방지
  const usedChamps = new Set();
  function pickChamp() {
    let c;
    do { c = pick(CHAMPS); } while (usedChamps.has(c));
    usedChamps.add(c);
    return c;
  }

  for (let i = 0; i < 5; i++) {
    const line = LINES[i];
    for (const [teamNum, player] of [[1, team1[i]], [2, team2[i]]]) {
      const champ = pickChamp();
      const kills   = rand(0, 12);
      const deaths  = rand(0, 10);
      const assists = rand(0, 18);
      const damage  = rand(8000, 45000);
      await pool.query(
        `INSERT INTO scrim_participants (match_id, member_id, team, line, champion, kills, deaths, assists, damage) VALUES (?,?,?,?,?,?,?,?,?)`,
        [matchId, player.id, teamNum, line, champ, kills, deaths, assists, damage]
      );
      console.log(`  팀${teamNum} ${line} ${player.name} → ${champ} ${kills}/${deaths}/${assists} 딜:${damage}`);
    }
  }
}

await pool.end();
console.log("\n✅ 테스트 데이터 삽입 완료!");
