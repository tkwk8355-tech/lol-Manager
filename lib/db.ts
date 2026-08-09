// =============================================================
// MariaDB(MySQL 프로토콜) 연결 + 스키마 관리 (서버 전용)
// 로컬에 이미 떠 있는 MariaDB를 사용한다. 접속 정보는 .env.local의
// DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME 을 사용한다.
//
// 기존에는 better-sqlite3로 프로젝트 폴더 안의 파일(data/lolclient.db)에
// 데이터를 저장했는데, 그 파일이 실수로 삭제되면 데이터가 통째로 사라지는
// 문제가 있었다. 이제는 별도로 관리되는 MariaDB 서버에 저장하므로 이 앱의
// 파일을 지워도 데이터는 안전하다.
// =============================================================

import mysql from "mysql2/promise";
import { hashPassword } from "@/lib/auth";

const globalForDb = globalThis as unknown as { _pool?: mysql.Pool };

export function getPool(): mysql.Pool {
  if (!globalForDb._pool) {
    globalForDb._pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true, // DATETIME 컬럼을 JS Date 대신 문자열로 받는다 (기존 코드와 호환).
    });
  }
  return globalForDb._pool;
}

let schemaReady: Promise<void> | null = null;

// 스키마가 아직 없으면 만든다. 여러 요청이 동시에 들어와도 한 번만 실행되도록
// 진행 중인 Promise를 캐시해 둔다.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = createSchema();
  return schemaReady;
}

async function createSchema(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nickname   VARCHAR(100) NOT NULL,
      memo       VARCHAR(255),
      birth_year INT,
      main_line  VARCHAR(10),
      sub_line   VARCHAR(10),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 클랜원 이름 중복 방지(회원가입 시 이름으로 본인을 찾아 연동하므로 중복이 있으면 안 된다).
  // 기존 데이터에 이미 중복된 이름이 있으면 제약 추가가 실패할 수 있으니, 실패해도 앱 시작은 막지 않는다
  // (그 경우 API 레벨의 중복 체크만으로 새로운 중복은 계속 막힌다).
  const [nickIdxRows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members' AND INDEX_NAME = 'uniq_member_nickname'`
  ) as any[];
  if (nickIdxRows[0].c === 0) {
    try {
      await pool.query(`ALTER TABLE members ADD UNIQUE KEY uniq_member_nickname (nickname)`);
    } catch (e) {
      console.warn("[db] members.nickname UNIQUE 제약 추가 실패(기존 중복 데이터가 있을 수 있음):", e);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      member_id        INT NOT NULL,
      game_name        VARCHAR(100) NOT NULL,
      tag_line         VARCHAR(50) NOT NULL,
      puuid            VARCHAR(120),
      is_main          TINYINT NOT NULL DEFAULT 0,
      last_match_id    VARCHAR(60),
      last_played_at   DATETIME NULL,
      games_2w         INT NOT NULL DEFAULT 0,
      ranked_games_2w  INT NOT NULL DEFAULT 0,
      last_synced_at   DATETIME NULL,
      games_total      INT NOT NULL DEFAULT 0,
      solo_tier        VARCHAR(20),
      solo_rank        VARCHAR(10),
      solo_lp          INT NOT NULL DEFAULT 0,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_riot_id (game_name, tag_line),
      CONSTRAINT fk_accounts_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrim_matches (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      mode        VARCHAR(20) NOT NULL,
      status      VARCHAR(20) NOT NULL DEFAULT 'pending',
      winner_team INT NOT NULL DEFAULT 0,
      note        VARCHAR(255),
      played_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrim_participants (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      match_id  INT NOT NULL,
      member_id INT NOT NULL,
      team      INT NOT NULL,
      line      VARCHAR(10),
      champion  VARCHAR(50),
      kills     INT NOT NULL DEFAULT 0,
      deaths    INT NOT NULL DEFAULT 0,
      assists   INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_participants_match FOREIGN KEY (match_id) REFERENCES scrim_matches(id) ON DELETE CASCADE,
      CONSTRAINT fk_participants_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS played_with (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      member_id      INT NOT NULL,
      with_member_id INT NOT NULL,
      match_id       VARCHAR(60) NOT NULL,
      win            TINYINT NOT NULL DEFAULT 0,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_played_with (member_id, with_member_id, match_id),
      CONSTRAINT fk_pw_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      CONSTRAINT fk_pw_with_member FOREIGN KEY (with_member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS champions (
      id      INT AUTO_INCREMENT PRIMARY KEY,
      name_ko VARCHAR(50) NOT NULL,
      name_en VARCHAR(50) NOT NULL,
      UNIQUE KEY uniq_name_en (name_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      username   VARCHAR(50) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      nickname   VARCHAR(100) NOT NULL,
      role       VARCHAR(20) NOT NULL DEFAULT 'member',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 로그인 계정과 클랜원(members)을 1:1로 연동하는 컬럼.
  // 클랜원 한 명당 로그인 계정 한 개만 연동되도록 UNIQUE로 강제한다.
  // 이 계정으로 파티를 만들면 클랜원의 "본계정 롤 ID"가 참가자 표시 이름으로 쓰인다.
  // 클랜원이 삭제되면 연동된 로그인 계정도 함께 삭제되어야 하므로 ON DELETE CASCADE를 쓴다.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id INT NULL UNIQUE`);
  const [fkRows] = await pool.query(
    `SELECT rc.DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS rc
     WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.TABLE_NAME = 'users' AND rc.CONSTRAINT_NAME = 'fk_users_member'`
  ) as any[];
  if (fkRows.length === 0) {
    await pool.query(
      `ALTER TABLE users ADD CONSTRAINT fk_users_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE`
    );
  } else if (fkRows[0].DELETE_RULE !== "CASCADE") {
    // 예전에 ON DELETE SET NULL로 만들어진 제약이 있으면 CASCADE로 교체한다.
    await pool.query(`ALTER TABLE users DROP FOREIGN KEY fk_users_member`);
    await pool.query(
      `ALTER TABLE users ADD CONSTRAINT fk_users_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE`
    );
  }

  // 파티 생성(롤 협곡/칼바람 같이 할 사람 모집) 기능용 테이블.
  // 방장/참가자는 로그인 계정(users.id) 기준으로 기록한다.
  // start_at: 시작 예정 시각(선택). 방장이 나가도 파티 자체는 삭제되지 않으며,
  // 방장이 명시적으로 삭제(DELETE /api/party)해야 없어진다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parties (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      mode           VARCHAR(20) NOT NULL,
      max_size       INT NOT NULL DEFAULT 5,
      status         VARCHAR(20) NOT NULL DEFAULT 'open',
      host_user_id   INT NOT NULL,
      host_nickname  VARCHAR(100) NOT NULL,
      note           VARCHAR(255),
      start_at       DATETIME NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_parties_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 기존에 만들어진 테이블에는 start_at 컬럼이 없을 수 있으므로 안전하게 추가한다.
  await pool.query(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS start_at DATETIME NULL`);
  await pool.query(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS ended_at DATETIME NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS party_participants (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      party_id   INT NOT NULL,
      user_id    INT NOT NULL,
      nickname   VARCHAR(100) NOT NULL,
      line       VARCHAR(20),
      is_waiting TINYINT NOT NULL DEFAULT 0,
      joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_party_user (party_id, user_id),
      CONSTRAINT fk_pp_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
      CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // line에 라인 2개(예: "TOP,JG")까지 저장할 수 있도록 기존 테이블 컬럼 폭을 넉넉히 늘린다.
  await pool.query(`ALTER TABLE party_participants MODIFY COLUMN line VARCHAR(20)`);
  // 정원이 다 차도 추가로 신청한 사람은 "대기"로 들어갈 수 있게 하는 컬럼.
  await pool.query(`ALTER TABLE party_participants ADD COLUMN IF NOT EXISTS is_waiting TINYINT NOT NULL DEFAULT 0`);

  // 내전 모집(신청) 단계용 테이블. 일반 클랜원은 이 모집 공고만 보고 신청/취소할 수 있고,
  // 점수표/경기 기록 같은 상세 데이터는 못 본다. 운영진이 모집을 열고(open),
  // 정원(기본 10명)이 다 차면 팀 생성기에서 이 모집 명단을 불러와 실제 경기(scrim_matches)를 시작한다.
  // 경기가 시작되면 status가 'started'로 바뀐다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrim_recruits (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      mode          VARCHAR(20) NOT NULL,
      max_size      INT NOT NULL DEFAULT 10,
      status        VARCHAR(20) NOT NULL DEFAULT 'open',
      note          VARCHAR(255),
      created_by    INT NOT NULL,
      match_id      INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_recruit_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrim_recruit_participants (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      recruit_id  INT NOT NULL,
      user_id     INT NOT NULL,
      member_id   INT NOT NULL,
      nickname    VARCHAR(100) NOT NULL,
      line        VARCHAR(20),
      joined_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_recruit_user (recruit_id, user_id),
      CONSTRAINT fk_recruit_part_recruit FOREIGN KEY (recruit_id) REFERENCES scrim_recruits(id) ON DELETE CASCADE,
      CONSTRAINT fk_recruit_part_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await seedDefaultAdmin(pool);
}

// 최초 실행 시 로그인할 계정이 하나도 없으면 기본 운영진 계정을 만들어 둔다.
// 운영자는 이후 반드시 비밀번호를 변경해야 한다.
async function seedDefaultAdmin(pool: mysql.Pool): Promise<void> {
  const [rows] = await pool.query("SELECT COUNT(*) AS c FROM users");
  const count = (rows as any[])[0].c;
  if (count > 0) return;
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "1234";
  if (!process.env.DEFAULT_ADMIN_PASSWORD) {
    console.warn("[db] DEFAULT_ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. 기본값 '1234'를 사용합니다. 반드시 변경하세요.");
  }
  await pool.query(
    "INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, 'admin')",
    ["admin", hashPassword(defaultPassword), "운영진"]
  );
  console.log(
    `[db] 기본 운영진 계정이 생성되었습니다. (아이디: admin / 비밀번호: ${defaultPassword}) 로그인 후 비밀번호를 변경하세요.`
  );
}
