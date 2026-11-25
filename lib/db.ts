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
import { soloTierToNewMemberMmr } from "./scrim";
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
  if (!schemaReady) {
    // 실패한 Promise를 계속 캐시하면 DB가 복구돼도 재시작 전까지 모든 요청이 실패하므로,
    // 실패 시에는 캐시를 비워 다음 요청에서 다시 시도하게 한다.
    schemaReady = createSchema().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
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
      id            INT AUTO_INCREMENT PRIMARY KEY,
      mode          VARCHAR(20) NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      winner_team   INT NOT NULL DEFAULT 0,
      note          VARCHAR(255),
      played_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      riot_match_id VARCHAR(30) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Riot 전적에서 자동 동기화한 경기는 원본 매치 ID를 저장해 같은 경기가 중복으로 들어오지 않게 한다.
  // (수동으로 입력한 경기는 riot_match_id가 NULL이라 겹치지 않는다.)
  await pool.query(`ALTER TABLE scrim_matches ADD COLUMN IF NOT EXISTS riot_match_id VARCHAR(30) NULL`);
  // 경기 시간(초). Riot 자동 동기화 경기만 채워진다 (수동 입력 경기는 0). 분당 딜량(DPM)/분당 CS 계산용.
  await pool.query(`ALTER TABLE scrim_matches ADD COLUMN IF NOT EXISTS game_duration INT NOT NULL DEFAULT 0`);
  const [riotIdxRows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scrim_matches' AND INDEX_NAME = 'uniq_riot_match_id'`
  ) as any[];
  if (riotIdxRows[0].c === 0) {
    await pool.query(`ALTER TABLE scrim_matches ADD UNIQUE KEY uniq_riot_match_id (riot_match_id)`);
  }

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
      damage    INT NOT NULL DEFAULT 0,
      item0     INT NOT NULL DEFAULT 0,
      item1     INT NOT NULL DEFAULT 0,
      item2     INT NOT NULL DEFAULT 0,
      item3     INT NOT NULL DEFAULT 0,
      item4     INT NOT NULL DEFAULT 0,
      item5     INT NOT NULL DEFAULT 0,
      item6     INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_participants_match FOREIGN KEY (match_id) REFERENCES scrim_matches(id) ON DELETE CASCADE,
      CONSTRAINT fk_participants_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`ALTER TABLE scrim_participants ADD COLUMN IF NOT EXISTS damage INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE scrim_participants ADD COLUMN IF NOT EXISTS vision_score INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE scrim_participants ADD COLUMN IF NOT EXISTS cs INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE scrim_participants ADD COLUMN IF NOT EXISTS is_mvp TINYINT NOT NULL DEFAULT 0`);
  for (const col of ["item0", "item1", "item2", "item3", "item4", "item5", "item6"]) {
    await pool.query(`ALTER TABLE scrim_participants ADD COLUMN IF NOT EXISTS ${col} INT NOT NULL DEFAULT 0`);
  }

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
      user_id    INT NULL,
      nickname   VARCHAR(100) NOT NULL,
      line       VARCHAR(20),
      is_waiting TINYINT NOT NULL DEFAULT 0,
      joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pp_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // line에 라인 2개(예: "TOP,JG")까지 저장할 수 있도록 기존 테이블 컬럼 폭을 넉넉히 늘린다.
  await pool.query(`ALTER TABLE party_participants MODIFY COLUMN line VARCHAR(20)`);
  // 정원이 다 차도 추가로 신청한 사람은 "대기"로 들어갈 수 있게 하는 컬럼.
  await pool.query(`ALTER TABLE party_participants ADD COLUMN IF NOT EXISTS is_waiting TINYINT NOT NULL DEFAULT 0`);
  // user_id를 NULL 허용으로 변경 (운영진 수기 입력 시 계정 미연동 닉네임도 저장 가능)
  await pool.query(`ALTER TABLE party_participants MODIFY COLUMN user_id INT NULL`);
  // 기존 FK(user_id → users) 제거 (NULL 허용 후 FK가 있으면 NULL 삽입 시 오류)
  const [ppFkRows] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'party_participants'
     AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users'`
  ) as any[];
  for (const row of ppFkRows) {
    try { await pool.query(`ALTER TABLE party_participants DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`); } catch {}
  }
  // (party_id, user_id) UNIQUE는 user_id가 NULL이면 중복 허용이 되므로 제거
  const [ppUqRows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'party_participants'
     AND INDEX_NAME = 'uniq_party_user'`
  ) as any[];
  if ((ppUqRows as any[])[0]) {
    try { await pool.query(`ALTER TABLE party_participants DROP INDEX uniq_party_user`); } catch {}
  }

  // 파티 참가자 변경 이력 — 펑 시 전체 기간 동안 등록된 모든 클랜원 대상으로 전적 조회
  await pool.query(`
    CREATE TABLE IF NOT EXISTS party_participant_history (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      party_id   INT NOT NULL,
      nickname   VARCHAR(100) NOT NULL,
      added_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pph_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 내전 모집(신청) 단계용 테이블. 클랜원 클랜원은 이 모집 공고만 보고 신청/취소할 수 있고,
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

  // 포인트 로그 테이블
  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_logs (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      member_id   INT NOT NULL,
      points      INT NOT NULL,
      type        VARCHAR(20) NOT NULL,
      games       INT NOT NULL DEFAULT 0,
      comment     VARCHAR(255),
      given_by    INT NULL,
      ref_id      INT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pl_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`ALTER TABLE point_logs ADD COLUMN IF NOT EXISTS party_count INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE point_logs ADD COLUMN IF NOT EXISTS ref_table VARCHAR(20) NULL`);
  await pool.query(`ALTER TABLE point_logs ADD COLUMN IF NOT EXISTS with_members VARCHAR(500) NULL`);
  // 수습 동반 10점 중복 방지: 클랜원이 특정 수습에게 한 번만 보너스 지급
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rookie_bonus_log (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      member_id       INT NOT NULL,
      rookie_member_id INT NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_rookie_bonus (member_id, rookie_member_id),
      CONSTRAINT fk_rbl_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      CONSTRAINT fk_rbl_rookie FOREIGN KEY (rookie_member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS total_points INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS gender VARCHAR(1) NULL`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE NULL`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_year INT NULL`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS position VARCHAR(20) NULL DEFAULT '클랜원'`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS status_note VARCHAR(255) NULL`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS promoted_at DATETIME NULL`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS withdrew_at DATE NULL`);

  // 추방 테이블
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      member_id  INT NOT NULL,
      reason     VARCHAR(500),
      added_at   DATE NOT NULL,
      given_by   INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_bl_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS scrim_only TINYINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
  // 세션 무효화용 버전. 비밀번호 변경/초기화 시 +1 되어 기존 로그인 쿠키가 모두 만료된다.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0`);
  await seedScrimOnlyAccount(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS warnings (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      member_id  INT NOT NULL,
      type       VARCHAR(30) NOT NULL,
      reason     VARCHAR(500),
      warned_at  DATE NOT NULL,
      given_by   INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_warn_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_friends (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      member_id  INT NOT NULL,
      friend_id  INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_friend (member_id, friend_id),
      CONSTRAINT fk_mf_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      CONSTRAINT fk_mf_friend FOREIGN KEY (friend_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS party_point_settings (
      mode       VARCHAR(20) NOT NULL PRIMARY KEY,
      points     INT NOT NULL DEFAULT 0,
      min_games  INT NOT NULL DEFAULT 3
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 기본값 없으면 삽입
  await pool.query(`
    INSERT IGNORE INTO party_point_settings (mode, points, min_games) VALUES
      ('aram', 5, 4),
      ('normal', 5, 3),
      ('flex', 10, 3),
      ('solo', 5, 3)
  `);

  // 내전 전용 MMR 테이블
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrim_ratings (
      member_id  INT NOT NULL PRIMARY KEY,
      mmr        INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sr_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 내전 MMR 변동 로그
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrim_mmr_logs (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      member_id  INT NOT NULL,
      match_id   INT NOT NULL,
      delta      INT NOT NULL,
      mmr_after  INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_mmr_log (member_id, match_id),
      CONSTRAINT fk_sml_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      CONSTRAINT fk_sml_match FOREIGN KEY (match_id) REFERENCES scrim_matches(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      cost       INT NOT NULL DEFAULT 0,
      cond       VARCHAR(50),
      note       VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 경매 참여자 사전 등록 (라인 + 주챔피언)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auction_roster (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      member_id  INT NOT NULL UNIQUE,
      line       VARCHAR(10) NULL,
      champ1     VARCHAR(50) NULL,
      champ2     VARCHAR(50) NULL,
      champ3     VARCHAR(50) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_roster_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 경매 참여자 소개사진 (입찰 시작 전에 보여주는 이미지)
  // - 폴링 쿼리가 가벼워지도록 auction_roster와 분리해서 보관한다.
  // - ver: 업로드 시각(ms). 이미지 URL에 붙여 브라우저 캐시를 갱신한다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auction_intro (
      member_id  INT NOT NULL PRIMARY KEY,
      mime       VARCHAR(50) NOT NULL,
      data       MEDIUMBLOB NOT NULL,
      ver        BIGINT NOT NULL,
      CONSTRAINT fk_intro_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 경매 세션
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auction_sessions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      status       VARCHAR(20) NOT NULL DEFAULT 'waiting',
      current_idx  INT NOT NULL DEFAULT 0,
      created_by   INT NOT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_auction_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 경매 참가자 (팀장 + 일반 선수)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auction_players (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      session_id   INT NOT NULL,
      member_id    INT NOT NULL,
      is_captain   TINYINT NOT NULL DEFAULT 0,
      points       INT NOT NULL DEFAULT 0,
      team_id      INT NULL,
      sort_order   INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_ap_session FOREIGN KEY (session_id) REFERENCES auction_sessions(id) ON DELETE CASCADE,
      CONSTRAINT fk_ap_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`ALTER TABLE auction_players ADD COLUMN IF NOT EXISTS champ1 VARCHAR(50) NULL`);
  await pool.query(`ALTER TABLE auction_players ADD COLUMN IF NOT EXISTS champ2 VARCHAR(50) NULL`);
  await pool.query(`ALTER TABLE auction_players ADD COLUMN IF NOT EXISTS champ3 VARCHAR(50) NULL`);
  await pool.query(`ALTER TABLE auction_sessions ADD COLUMN IF NOT EXISTS timer_started TINYINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE auction_sessions ADD COLUMN IF NOT EXISTS timer_started_at BIGINT NULL`);
  await pool.query(`ALTER TABLE auction_sessions ADD COLUMN IF NOT EXISTS awarded_player_id INT NULL`);
  // 경매 방식: member = 팀원 경매(참여자 중 팀장, 팀장 라인 제외 4명 경매), team = 팀 경매(참여자가 아닌 클랜원이 팀장, 5라인 전부 경매)
  await pool.query(`ALTER TABLE auction_sessions ADD COLUMN IF NOT EXISTS auction_type VARCHAR(10) NOT NULL DEFAULT 'member'`);

  // 경매 플랜카드 (경매 시작 전 대기 화면에 크게 보여주는 이미지, 세션별 1장)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auction_banner (
      session_id INT NOT NULL PRIMARY KEY,
      mime       VARCHAR(50) NOT NULL,
      data       MEDIUMBLOB NOT NULL,
      ver        BIGINT NOT NULL,
      CONSTRAINT fk_banner_session FOREIGN KEY (session_id) REFERENCES auction_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 경매 입찰 기록
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auction_bids (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      session_id   INT NOT NULL,
      player_id    INT NOT NULL,
      captain_id   INT NOT NULL,
      points       INT NOT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_ab_session FOREIGN KEY (session_id) REFERENCES auction_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 솔랭내기 세션
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solorank_sessions (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(100) NULL,
      total_games INT NOT NULL DEFAULT 5,
      status      VARCHAR(20) NOT NULL DEFAULT 'waiting',
      created_by  INT NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sr_session_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 솔랭내기 참여자 (team: 1 or 2)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solorank_participants (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      session_id  INT NOT NULL,
      member_id   INT NOT NULL,
      team        TINYINT NOT NULL,
      CONSTRAINT fk_srp_session FOREIGN KEY (session_id) REFERENCES solorank_sessions(id) ON DELETE CASCADE,
      CONSTRAINT fk_srp_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 솔랭내기 판 결과
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solorank_games (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      session_id  INT NOT NULL,
      game_no     INT NOT NULL,
      winner_team TINYINT NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_sg (session_id, game_no),
      CONSTRAINT fk_sgg_session FOREIGN KEY (session_id) REFERENCES solorank_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`ALTER TABLE solorank_sessions ADD COLUMN IF NOT EXISTS start_at DATETIME NULL`);

  // 솔랭 티어 전체 동기화 실행 기록 (자동 스케줄러 / 운영진 전체 동기화)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solo_sync_runs (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      trigger_type  VARCHAR(10) NOT NULL,          -- auto | manual
      started_at    DATETIME NOT NULL,
      finished_at   DATETIME NULL,                 -- NULL 이면 진행 중(또는 서버가 도중에 꺼짐)
      total         INT NOT NULL DEFAULT 0,
      processed     INT NOT NULL DEFAULT 0,
      error_count   INT NOT NULL DEFAULT 0,
      errors        TEXT NULL,
      rate_limited  TINYINT NOT NULL DEFAULT 0,
      KEY idx_started (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 클랜 공유 캘린더 일정 (운영진이 추가/수정, 전원 조회)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(100) NOT NULL,
      start_date  DATE NOT NULL,
      end_date    DATE NOT NULL,                 -- 하루 일정이면 start_date와 같음
      start_time  VARCHAR(5) NULL,               -- 'HH:MM', NULL이면 종일
      end_time    VARCHAR(5) NULL,
      color       VARCHAR(10) NOT NULL DEFAULT 'blue',
      memo        VARCHAR(500) NULL,
      created_by  INT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NULL,
      KEY idx_range (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 미니게임 > 에임 연습 기록 (한 판마다 한 줄, 랭킹은 1인 최고점)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aim_records (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,                  -- users.id
      nickname    VARCHAR(100) NOT NULL,         -- 기록 당시 닉네임
      score       INT NOT NULL,
      hits        INT NOT NULL,
      misses      INT NOT NULL,
      avg_ms      INT NOT NULL,                  -- 맞힌 간격 평균(ms)
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_score (user_id, score),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 미니게임 > 테트리스 40줄 기록 (한 판마다 한 줄, 랭킹은 1인 최단 시간)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tetris_records (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,                  -- users.id
      nickname    VARCHAR(100) NOT NULL,         -- 기록 당시 닉네임
      time_ms     INT NOT NULL,                  -- 40줄 지우는 데 걸린 시간
      pieces      INT NOT NULL,                  -- 놓은 블록 수
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_time (user_id, time_ms),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 미니게임 > 사과게임 기록 (한 판마다 한 줄, 랭킹은 1인 최고점)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apple_records (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,                  -- users.id
      nickname    VARCHAR(100) NOT NULL,         -- 기록 당시 닉네임
      score       INT NOT NULL,                  -- 없앤 사과 수
      moves       INT NOT NULL,                  -- 묶은 횟수
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_score (user_id, score),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 방꾸미기 > 산 물건 (가구 · 벽지 · 바닥 · 프로필 테두리). 한 번 살 때마다 한 줄
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_items (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NOT NULL,                  -- users.id
      item_key    VARCHAR(40) NOT NULL,          -- lib/roomShared.ts CATALOG의 key
      price       INT NOT NULL DEFAULT 0,        -- 살 때 쓴 포인트
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_item (user_id, item_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 방꾸미기 > 사용자별 방 배치 + 끼고 있는 프로필 테두리
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_rooms (
      user_id     INT NOT NULL PRIMARY KEY,      -- users.id
      wallpaper   VARCHAR(40) NULL,
      flooring    VARCHAR(40) NULL,
      items       TEXT NULL,                     -- 배치 JSON [{k,x,y,r} | {k,wall,u}]
      frame       VARCHAR(40) NULL,              -- 프로필 테두리 key
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`ALTER TABLE user_rooms ADD COLUMN IF NOT EXISTS icon VARCHAR(40) NULL`); // 프로필 아이콘 key

  await seedDefaultAdmin(pool);
  await seedScrimRatings(pool);
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

// 솔랭 티어 기반으로 scrim_ratings 초기값 세팅 (이미 있는 행은 건드리지 않음)
async function seedScrimRatings(pool: mysql.Pool): Promise<void> {
  const [accRows] = await pool.query(
    `SELECT member_id, solo_tier, is_main FROM accounts ORDER BY is_main DESC, id ASC`
  ) as [any[], any];
  const tierMap = new Map<number, string | null>();
  for (const r of accRows) {
    if (!tierMap.has(r.member_id)) tierMap.set(r.member_id, r.solo_tier ?? null);
  }
  for (const [memberId, tier] of tierMap) {
    const mmr = soloTierToNewMemberMmr(tier);
    await pool.query(
      `INSERT IGNORE INTO scrim_ratings (member_id, mmr) VALUES (?, ?)`,
      [memberId, mmr]
    );
  }
}

async function seedScrimOnlyAccount(pool: mysql.Pool): Promise<void> {
  const [rows] = await pool.query("SELECT COUNT(*) AS c FROM users WHERE username = '또간집'") as any[];
  if (rows[0].c > 0) return;
  const scrimPassword = process.env.SCRIM_ONLY_PASSWORD;
  if (!scrimPassword) {
    console.warn("[db] SCRIM_ONLY_PASSWORD 환경변수가 설정되지 않았습니다. 내전 전용 계정을 생성하지 않습니다.");
    return;
  }
  await pool.query(
    "INSERT INTO users (username, password, nickname, role, scrim_only) VALUES (?, ?, ?, 'member', 1)",
    ["또간집", hashPassword(scrimPassword), "내전관람"]
  );
  console.log(`[db] 내전 전용 계정 생성됨. (아이디: 또간집)`);
}
