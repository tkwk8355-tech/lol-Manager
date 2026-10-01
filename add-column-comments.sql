-- ================================================================
-- DB 컬럼 코멘트 일괄 추가
-- 대상: lolclient DB 전체 테이블 (22개)
-- 실행: MariaDB/MySQL 클라이언트에서 1회 실행하면 됨
--   예) mysql -u root -p lolclient < add-column-comments.sql
-- ================================================================


-- ----------------------------------------------------------------
-- members (클랜원 목록)
-- ----------------------------------------------------------------
ALTER TABLE members
  MODIFY COLUMN id              INT AUTO_INCREMENT                     COMMENT '클랜원 고유 ID (PK)',
  MODIFY COLUMN nickname        VARCHAR(100) NOT NULL                  COMMENT '클랜 닉네임. UNIQUE. 회원가입 시 연동 키로 사용됨',
  MODIFY COLUMN memo            VARCHAR(255)                           COMMENT '운영진 전용 메모 (자유 텍스트)',
  MODIFY COLUMN birth_year      INT                                    COMMENT '출생 연도 (구버전. birth_date로 대체됨)',
  MODIFY COLUMN birth_date      DATE                                   COMMENT '생년월일 (DATE 타입)',
  MODIFY COLUMN gender          VARCHAR(1)                             COMMENT '성별. M / F / NULL',
  MODIFY COLUMN main_line       VARCHAR(10)                            COMMENT '주 포지션. TOP / JG / MID / ADC / SUP',
  MODIFY COLUMN sub_line        VARCHAR(10)                            COMMENT '부 포지션. main_line과 같은 범위',
  MODIFY COLUMN position        VARCHAR(20)   DEFAULT '클랜원'        COMMENT '클랜 직책. 클랜원 / 수습 / 운영진 등',
  MODIFY COLUMN status          VARCHAR(20)   NOT NULL DEFAULT 'active' COMMENT '활동 상태. active / inactive / banned 등',
  MODIFY COLUMN status_note     VARCHAR(255)                           COMMENT '상태 사유 (예: 군입대, 개인 사정 등)',
  MODIFY COLUMN total_points    INT           NOT NULL DEFAULT 0       COMMENT '누적 포인트 합계. point_logs.points 합산과 항상 동기화됨',
  MODIFY COLUMN created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '클랜 등록(가입)일',
  MODIFY COLUMN promoted_at     DATETIME                               COMMENT '클랜원 승격일 (수습→클랜원이 된 날짜)',
  MODIFY COLUMN withdrew_at     DATE                                   COMMENT '탈퇴일',
  MODIFY COLUMN last_achieved_at DATETIME                              COMMENT '마지막 활동 달성일. 칼바람 4판 or 협곡 3판 이상 조건을 마지막으로 충족한 날짜. 판수 미달 여부 판단 기준점';


-- ----------------------------------------------------------------
-- accounts (Riot 게임 계정. 클랜원 1명이 여러 계정 보유 가능)
-- ----------------------------------------------------------------
ALTER TABLE accounts
  MODIFY COLUMN id              INT AUTO_INCREMENT                     COMMENT '계정 고유 ID (PK)',
  MODIFY COLUMN member_id       INT NOT NULL                           COMMENT 'FK → members.id. 이 계정을 소유한 클랜원',
  MODIFY COLUMN game_name       VARCHAR(100) NOT NULL                  COMMENT '롤 인게임 이름 (예: 전창민)',
  MODIFY COLUMN tag_line        VARCHAR(50)  NOT NULL                  COMMENT 'Riot ID 태그 (예: KR1). game_name+tag_line 조합이 UNIQUE',
  MODIFY COLUMN puuid           VARCHAR(120)                           COMMENT 'Riot API 고유 식별자. 전적 조회에 사용됨',
  MODIFY COLUMN is_main         TINYINT      NOT NULL DEFAULT 0        COMMENT '1=본계정, 0=부계정. 클랜원당 본계정 1개',
  MODIFY COLUMN last_match_id   VARCHAR(60)                            COMMENT '마지막으로 동기화한 Riot 매치 ID (중복 조회 방지)',
  MODIFY COLUMN last_played_at  DATETIME                               COMMENT '마지막 게임 플레이 시각',
  MODIFY COLUMN games_2w        INT          NOT NULL DEFAULT 0        COMMENT '최근 2주간 총 게임 수 (Riot API 동기화)',
  MODIFY COLUMN ranked_games_2w INT          NOT NULL DEFAULT 0        COMMENT '최근 2주간 랭크 게임 수',
  MODIFY COLUMN last_synced_at  DATETIME                               COMMENT '마지막 솔랭 티어 동기화 시각',
  MODIFY COLUMN games_total     INT          NOT NULL DEFAULT 0        COMMENT '전체 누적 게임 수',
  MODIFY COLUMN solo_tier       VARCHAR(20)                            COMMENT '솔랭 티어. IRON / BRONZE / SILVER / ... / CHALLENGER / NULL',
  MODIFY COLUMN solo_rank       VARCHAR(10)                            COMMENT '솔랭 단계. I / II / III / IV. 마스터 이상은 NULL',
  MODIFY COLUMN solo_lp         INT          NOT NULL DEFAULT 0        COMMENT '솔랭 LP',
  MODIFY COLUMN created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '계정 등록 시각';


-- ----------------------------------------------------------------
-- users (로그인 계정)
-- ----------------------------------------------------------------
ALTER TABLE users
  MODIFY COLUMN id          INT AUTO_INCREMENT                         COMMENT '로그인 계정 고유 ID (PK)',
  MODIFY COLUMN username    VARCHAR(50)  NOT NULL                      COMMENT '로그인 아이디. UNIQUE',
  MODIFY COLUMN password    VARCHAR(255) NOT NULL                      COMMENT 'scrypt 해시 비밀번호. {salt_hex}:{hash_hex} 형식',
  MODIFY COLUMN nickname    VARCHAR(100) NOT NULL                      COMMENT '화면 표시 이름. members.nickname과 보통 동일하게 설정',
  MODIFY COLUMN role        VARCHAR(20)  NOT NULL DEFAULT 'member'     COMMENT '권한. admin / subadmin / member / captain',
  MODIFY COLUMN member_id   INT                                        COMMENT 'FK → members.id. 연동된 클랜원. NULL이면 미연동. UNIQUE(클랜원 1:1)',
  MODIFY COLUMN scrim_only  TINYINT      NOT NULL DEFAULT 0            COMMENT '1=내전 전용 관람 계정. /scrim 페이지만 접근 가능',
  MODIFY COLUMN status      VARCHAR(20)  NOT NULL DEFAULT 'active'     COMMENT 'active=정상, pending=가입 승인 대기',
  MODIFY COLUMN created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '계정 생성 시각';


-- ----------------------------------------------------------------
-- parties (파티 모집 공고)
-- ----------------------------------------------------------------
ALTER TABLE parties
  MODIFY COLUMN id            INT AUTO_INCREMENT                       COMMENT '파티 고유 ID (PK)',
  MODIFY COLUMN mode          VARCHAR(20) NOT NULL                     COMMENT '게임 모드. aram / normal / flex / solo / scrim',
  MODIFY COLUMN max_size      INT         NOT NULL DEFAULT 5           COMMENT '최대 참가 인원. solo=2, 나머지=5',
  MODIFY COLUMN status        VARCHAR(20) NOT NULL DEFAULT 'open'      COMMENT 'open=모집 중, ended=파티 종료(펑)',
  MODIFY COLUMN host_user_id  INT         NOT NULL                     COMMENT 'FK → users.id. 파티를 만든 운영진 계정',
  MODIFY COLUMN host_nickname VARCHAR(100) NOT NULL                    COMMENT '방장 닉네임 스냅샷 (표시용)',
  MODIFY COLUMN note          VARCHAR(255)                             COMMENT '파티 메모 (예: 노말 캐주얼, 탑미드구함)',
  MODIFY COLUMN start_at      DATETIME                                 COMMENT '시작 예정 시각. NULL이면 미정',
  MODIFY COLUMN created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '파티 생성 시각',
  MODIFY COLUMN ended_at      DATETIME                                 COMMENT '파티 종료(펑) 시각. NULL이면 아직 열려있음';


-- ----------------------------------------------------------------
-- party_participants (파티 현재 참가자)
-- ----------------------------------------------------------------
ALTER TABLE party_participants
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '참가자 레코드 고유 ID (PK)',
  MODIFY COLUMN party_id   INT         NOT NULL                        COMMENT 'FK → parties.id',
  MODIFY COLUMN user_id    INT                                         COMMENT 'FK → users.id. NULL이면 운영진 수기 입력 닉네임',
  MODIFY COLUMN nickname   VARCHAR(100) NOT NULL                       COMMENT '인게임 닉네임. user_id가 NULL일 때도 이 값으로 식별',
  MODIFY COLUMN line       VARCHAR(20)                                 COMMENT '선호 포지션. 2개까지 콤마 구분 가능 (예: TOP,JG)',
  MODIFY COLUMN is_waiting TINYINT     NOT NULL DEFAULT 0              COMMENT '1=정원 초과 대기 중인 참가자',
  MODIFY COLUMN joined_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '참가 시각';


-- ----------------------------------------------------------------
-- party_participant_history (파티 참가자 변경 이력)
-- ----------------------------------------------------------------
ALTER TABLE party_participant_history
  MODIFY COLUMN id        INT AUTO_INCREMENT                           COMMENT '이력 고유 ID (PK)',
  MODIFY COLUMN party_id  INT         NOT NULL                         COMMENT 'FK → parties.id',
  MODIFY COLUMN nickname  VARCHAR(100) NOT NULL                        COMMENT '참가했던 인게임 닉네임 스냅샷',
  MODIFY COLUMN added_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '이 닉네임이 명단에 추가된 시각. 파티 펑 시 이 테이블 기준으로 전원 포인트 지급';


-- ----------------------------------------------------------------
-- point_logs (포인트 지급 이력)
-- ----------------------------------------------------------------
ALTER TABLE point_logs
  MODIFY COLUMN id           INT AUTO_INCREMENT                        COMMENT '로그 고유 ID (PK)',
  MODIFY COLUMN member_id    INT         NOT NULL                      COMMENT 'FK → members.id. 포인트를 받은 클랜원',
  MODIFY COLUMN points       INT         NOT NULL                      COMMENT '지급 포인트. 음수 가능. 0이면 판수만 기록(포인트 없음)',
  MODIFY COLUMN type         VARCHAR(20) NOT NULL                      COMMENT '포인트 종류. aram/normal/flex/solo/scrim=게임 참여, rookie_session=수습 파티 기록(points=0), manual=수동 지급, award_error=자동지급 실패 기록',
  MODIFY COLUMN games        INT         NOT NULL DEFAULT 0            COMMENT '이 로그에 해당하는 게임 판수',
  MODIFY COLUMN comment      VARCHAR(255)                              COMMENT '지급 사유 메모 (예: 칼바람 5판 달성 (07-15 00:12))',
  MODIFY COLUMN given_by     INT                                       COMMENT 'FK → users.id. 지급한 운영진. NULL이면 시스템 자동 지급',
  MODIFY COLUMN ref_id       INT                                       COMMENT '관련 레코드 ID. ref_table 값에 따라 가리키는 테이블이 다름',
  MODIFY COLUMN ref_table    VARCHAR(20)                               COMMENT 'ref_id가 가리키는 테이블. party / scrim_match / NULL',
  MODIFY COLUMN party_count  INT         NOT NULL DEFAULT 0            COMMENT 'flex/scrim 모드 수습 카운팅용 파티 참여 횟수',
  MODIFY COLUMN with_members VARCHAR(500)                              COMMENT '같이 플레이한 클랜원 닉네임 목록 (콤마 구분, 최대 500자)',
  MODIFY COLUMN created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '포인트 지급 시각';


-- ----------------------------------------------------------------
-- rookie_bonus_log (수습 동반 보너스 중복 방지)
-- ----------------------------------------------------------------
ALTER TABLE rookie_bonus_log
  MODIFY COLUMN id               INT AUTO_INCREMENT                    COMMENT '로그 고유 ID (PK)',
  MODIFY COLUMN member_id        INT NOT NULL                          COMMENT 'FK → members.id. 보너스를 받은 클랜원',
  MODIFY COLUMN rookie_member_id INT NOT NULL                          COMMENT 'FK → members.id. 동반한 수습 클랜원. (member_id, rookie_member_id) UNIQUE로 수습 1명당 보너스 1회만 지급',
  MODIFY COLUMN created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '보너스 지급 기록 시각';


-- ----------------------------------------------------------------
-- scrim_matches (내전 경기 기록)
-- ----------------------------------------------------------------
ALTER TABLE scrim_matches
  MODIFY COLUMN id            INT AUTO_INCREMENT                       COMMENT '경기 고유 ID (PK)',
  MODIFY COLUMN mode          VARCHAR(20) NOT NULL                     COMMENT '내전 형식. draft / blind 등',
  MODIFY COLUMN status        VARCHAR(20) NOT NULL DEFAULT 'pending'   COMMENT 'pending=결과 미입력, done=완료, cancelled=취소',
  MODIFY COLUMN winner_team   INT         NOT NULL DEFAULT 0           COMMENT '승리팀. 1 또는 2. 0이면 미결정',
  MODIFY COLUMN note          VARCHAR(255)                             COMMENT '운영진 메모',
  MODIFY COLUMN played_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '경기 진행 시각',
  MODIFY COLUMN riot_match_id VARCHAR(30)                              COMMENT 'Riot API 매치 ID. 자동 동기화 경기에만 있음. UNIQUE. 수동 입력 경기는 NULL';


-- ----------------------------------------------------------------
-- scrim_participants (내전 경기 참가자 & 스탯)
-- ----------------------------------------------------------------
ALTER TABLE scrim_participants
  MODIFY COLUMN id           INT AUTO_INCREMENT                        COMMENT '참가자 레코드 고유 ID (PK)',
  MODIFY COLUMN match_id     INT         NOT NULL                      COMMENT 'FK → scrim_matches.id',
  MODIFY COLUMN member_id    INT         NOT NULL                      COMMENT 'FK → members.id',
  MODIFY COLUMN team         INT         NOT NULL                      COMMENT '소속 팀. 1 또는 2',
  MODIFY COLUMN line         VARCHAR(10)                               COMMENT '플레이한 포지션',
  MODIFY COLUMN champion     VARCHAR(50)                               COMMENT '사용한 챔피언 이름',
  MODIFY COLUMN kills        INT         NOT NULL DEFAULT 0            COMMENT '킬',
  MODIFY COLUMN deaths       INT         NOT NULL DEFAULT 0            COMMENT '데스',
  MODIFY COLUMN assists      INT         NOT NULL DEFAULT 0            COMMENT '어시스트',
  MODIFY COLUMN damage       INT         NOT NULL DEFAULT 0            COMMENT '가한 피해량',
  MODIFY COLUMN vision_score INT         NOT NULL DEFAULT 0            COMMENT '시야 점수',
  MODIFY COLUMN cs           INT         NOT NULL DEFAULT 0            COMMENT '미니언 처치 수 (CS)',
  MODIFY COLUMN is_mvp       TINYINT     NOT NULL DEFAULT 0            COMMENT '1=이 경기 MVP',
  MODIFY COLUMN item0        INT         NOT NULL DEFAULT 0            COMMENT '장착 아이템 슬롯0 (Riot 아이템 코드)',
  MODIFY COLUMN item1        INT         NOT NULL DEFAULT 0            COMMENT '장착 아이템 슬롯1',
  MODIFY COLUMN item2        INT         NOT NULL DEFAULT 0            COMMENT '장착 아이템 슬롯2',
  MODIFY COLUMN item3        INT         NOT NULL DEFAULT 0            COMMENT '장착 아이템 슬롯3',
  MODIFY COLUMN item4        INT         NOT NULL DEFAULT 0            COMMENT '장착 아이템 슬롯4',
  MODIFY COLUMN item5        INT         NOT NULL DEFAULT 0            COMMENT '장착 아이템 슬롯5',
  MODIFY COLUMN item6        INT         NOT NULL DEFAULT 0            COMMENT '와드 아이템 슬롯6 (장신구)';


-- ----------------------------------------------------------------
-- scrim_ratings (내전 MMR)
-- ----------------------------------------------------------------
ALTER TABLE scrim_ratings
  MODIFY COLUMN member_id  INT      NOT NULL                           COMMENT 'PK + FK → members.id. 클랜원 1명당 1행',
  MODIFY COLUMN mmr        INT      NOT NULL DEFAULT 0                 COMMENT '내전 실력 지수. 초기값: SILVER=100 GOLD=200 PLATINUM=300 EMERALD=400 DIAMOND+=500',
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '마지막 MMR 변동 시각 (자동 갱신)';


-- ----------------------------------------------------------------
-- scrim_mmr_logs (내전 MMR 변동 이력)
-- ----------------------------------------------------------------
ALTER TABLE scrim_mmr_logs
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '로그 고유 ID (PK)',
  MODIFY COLUMN member_id  INT      NOT NULL                           COMMENT 'FK → members.id',
  MODIFY COLUMN match_id   INT      NOT NULL                           COMMENT 'FK → scrim_matches.id. 이 경기로 MMR 변동됨. (member_id, match_id) UNIQUE',
  MODIFY COLUMN delta      INT      NOT NULL                           COMMENT 'MMR 변화량. 양수=상승, 음수=하락',
  MODIFY COLUMN mmr_after  INT      NOT NULL                           COMMENT '변동 후 최종 MMR',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '기록 시각';


-- ----------------------------------------------------------------
-- scrim_recruits (내전 모집 공고)
-- ----------------------------------------------------------------
ALTER TABLE scrim_recruits
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '모집 공고 고유 ID (PK)',
  MODIFY COLUMN mode       VARCHAR(20) NOT NULL                        COMMENT '모집 모드',
  MODIFY COLUMN max_size   INT         NOT NULL DEFAULT 10             COMMENT '모집 인원 상한 (기본 10명)',
  MODIFY COLUMN status     VARCHAR(20) NOT NULL DEFAULT 'open'         COMMENT 'open=모집 중, started=경기 시작됨, cancelled=취소',
  MODIFY COLUMN note       VARCHAR(255)                                COMMENT '공지 메모 (예: 오늘 저녁 8시)',
  MODIFY COLUMN created_by INT         NOT NULL                        COMMENT 'FK → users.id. 모집을 연 운영진',
  MODIFY COLUMN match_id   INT                                         COMMENT 'FK → scrim_matches.id. 이 모집으로 생성된 실제 경기. NULL이면 아직 미시작',
  MODIFY COLUMN created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '모집 공고 생성 시각';


-- ----------------------------------------------------------------
-- scrim_recruit_participants (내전 모집 신청자)
-- ----------------------------------------------------------------
ALTER TABLE scrim_recruit_participants
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '신청 레코드 고유 ID (PK)',
  MODIFY COLUMN recruit_id INT         NOT NULL                        COMMENT 'FK → scrim_recruits.id',
  MODIFY COLUMN user_id    INT         NOT NULL                        COMMENT 'FK → users.id. 신청한 로그인 계정. (recruit_id, user_id) UNIQUE',
  MODIFY COLUMN member_id  INT         NOT NULL                        COMMENT 'FK → members.id. 신청한 클랜원',
  MODIFY COLUMN nickname   VARCHAR(100) NOT NULL                       COMMENT '신청 시 인게임 닉네임 스냅샷',
  MODIFY COLUMN line       VARCHAR(20)                                 COMMENT '신청 시 선택한 포지션',
  MODIFY COLUMN joined_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '신청 시각';


-- ----------------------------------------------------------------
-- played_with (클랜원 간 함께 플레이한 기록)
-- ----------------------------------------------------------------
ALTER TABLE played_with
  MODIFY COLUMN id             INT AUTO_INCREMENT                      COMMENT '레코드 고유 ID (PK)',
  MODIFY COLUMN member_id      INT         NOT NULL                    COMMENT 'FK → members.id. 기준 클랜원',
  MODIFY COLUMN with_member_id INT         NOT NULL                    COMMENT 'FK → members.id. 같이 플레이한 클랜원',
  MODIFY COLUMN match_id       VARCHAR(60) NOT NULL                    COMMENT 'Riot 매치 ID. (member_id, with_member_id, match_id) UNIQUE',
  MODIFY COLUMN win            TINYINT     NOT NULL DEFAULT 0          COMMENT '1=이긴 게임, 0=진 게임',
  MODIFY COLUMN created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '기록 시각';


-- ----------------------------------------------------------------
-- warnings (경고 기록)
-- ----------------------------------------------------------------
ALTER TABLE warnings
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '경고 고유 ID (PK)',
  MODIFY COLUMN member_id  INT         NOT NULL                        COMMENT 'FK → members.id. 경고 받은 클랜원',
  MODIFY COLUMN type       VARCHAR(30) NOT NULL                        COMMENT '경고 유형 (예: 결석, 비매너, 규정 위반)',
  MODIFY COLUMN reason     VARCHAR(500)                                COMMENT '경고 상세 사유',
  MODIFY COLUMN warned_at  DATE        NOT NULL                        COMMENT '경고 발생 날짜',
  MODIFY COLUMN given_by   INT                                         COMMENT 'FK → users.id. 경고를 부여한 운영진. NULL이면 시스템',
  MODIFY COLUMN created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'DB 기록 시각';


-- ----------------------------------------------------------------
-- blacklist (블랙리스트)
-- ----------------------------------------------------------------
ALTER TABLE blacklist
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '블랙리스트 레코드 고유 ID (PK)',
  MODIFY COLUMN member_id  INT         NOT NULL                        COMMENT 'FK → members.id. 등록된 클랜원',
  MODIFY COLUMN reason     VARCHAR(500)                                COMMENT '등록 사유',
  MODIFY COLUMN added_at   DATE        NOT NULL                        COMMENT '블랙리스트 등록 날짜',
  MODIFY COLUMN given_by   INT                                         COMMENT 'FK → users.id. 등록한 운영진. NULL이면 시스템',
  MODIFY COLUMN created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'DB 기록 시각';


-- ----------------------------------------------------------------
-- member_friends (클랜원 지인 관계)
-- ----------------------------------------------------------------
ALTER TABLE member_friends
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '레코드 고유 ID (PK)',
  MODIFY COLUMN member_id  INT      NOT NULL                           COMMENT 'FK → members.id. 기준 클랜원',
  MODIFY COLUMN friend_id  INT      NOT NULL                           COMMENT 'FK → members.id. 지인으로 등록된 클랜원. (member_id, friend_id) UNIQUE',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '지인 등록 시각';


-- ----------------------------------------------------------------
-- party_point_settings (파티 포인트 지급 설정)
-- ----------------------------------------------------------------
ALTER TABLE party_point_settings
  MODIFY COLUMN mode      VARCHAR(20) NOT NULL                         COMMENT 'PK. 게임 모드. aram / normal / flex / solo',
  MODIFY COLUMN points    INT         NOT NULL DEFAULT 0               COMMENT '달성 시 지급 포인트',
  MODIFY COLUMN min_games INT         NOT NULL DEFAULT 3               COMMENT '포인트를 받으려면 채워야 하는 최소 판수 (aram=4, 나머지=3)';


-- ----------------------------------------------------------------
-- champions (챔피언 이름 매핑)
-- ----------------------------------------------------------------
ALTER TABLE champions
  MODIFY COLUMN id      INT AUTO_INCREMENT                             COMMENT '챔피언 고유 ID (PK)',
  MODIFY COLUMN name_ko VARCHAR(50) NOT NULL                           COMMENT '한국어 챔피언 이름 (예: 가렌)',
  MODIFY COLUMN name_en VARCHAR(50) NOT NULL                           COMMENT '영문 챔피언 이름 (예: Garen). UNIQUE';


-- ----------------------------------------------------------------
-- shop_items (상점 아이템 목록)
-- ----------------------------------------------------------------
ALTER TABLE shop_items
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '아이템 고유 ID (PK)',
  MODIFY COLUMN name       VARCHAR(100) NOT NULL                       COMMENT '아이템 이름',
  MODIFY COLUMN cost       INT          NOT NULL DEFAULT 0             COMMENT '포인트 가격',
  MODIFY COLUMN cond       VARCHAR(50)                                 COMMENT '구매 조건 텍스트 (예: 클랜원 등급 이상)',
  MODIFY COLUMN note       VARCHAR(255)                                COMMENT '아이템 설명',
  MODIFY COLUMN sort_order INT          NOT NULL DEFAULT 0             COMMENT '목록 정렬 순서. 낮을수록 위에 표시',
  MODIFY COLUMN created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '아이템 등록 시각';


-- ----------------------------------------------------------------
-- auction_sessions (경매 세션)
-- ----------------------------------------------------------------
ALTER TABLE auction_sessions
  MODIFY COLUMN id               INT AUTO_INCREMENT                    COMMENT '세션 고유 ID (PK)',
  MODIFY COLUMN status           VARCHAR(20) NOT NULL DEFAULT 'waiting' COMMENT 'waiting=대기, active=진행 중, done=완료',
  MODIFY COLUMN current_idx      INT         NOT NULL DEFAULT 0        COMMENT '현재 경매 중인 선수 순번 (auction_players.sort_order 기준)',
  MODIFY COLUMN created_by       INT         NOT NULL                  COMMENT 'FK → users.id. 경매를 만든 운영진',
  MODIFY COLUMN created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '세션 생성 시각',
  MODIFY COLUMN timer_started    TINYINT     NOT NULL DEFAULT 0        COMMENT '1=현재 선수의 입찰 타이머가 돌고 있음',
  MODIFY COLUMN timer_started_at BIGINT                                COMMENT '타이머 시작 시각 (Unix milliseconds)',
  MODIFY COLUMN awarded_player_id INT                                  COMMENT 'FK → auction_players.id. 현재 낙찰 처리 중인 선수';


-- ----------------------------------------------------------------
-- auction_roster (경매 사전 등록 정보)
-- ----------------------------------------------------------------
ALTER TABLE auction_roster
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '레코드 고유 ID (PK)',
  MODIFY COLUMN member_id  INT      NOT NULL                           COMMENT 'FK → members.id. UNIQUE (클랜원 1명당 1행)',
  MODIFY COLUMN line       VARCHAR(10)                                 COMMENT '주 포지션',
  MODIFY COLUMN champ1     VARCHAR(50)                                 COMMENT '주챔피언 1순위',
  MODIFY COLUMN champ2     VARCHAR(50)                                 COMMENT '주챔피언 2순위',
  MODIFY COLUMN champ3     VARCHAR(50)                                 COMMENT '주챔피언 3순위',
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '마지막 수정 시각 (자동 갱신)';


-- ----------------------------------------------------------------
-- auction_players (경매 세션 참가자)
-- ----------------------------------------------------------------
ALTER TABLE auction_players
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '참가자 레코드 고유 ID (PK)',
  MODIFY COLUMN session_id INT     NOT NULL                            COMMENT 'FK → auction_sessions.id',
  MODIFY COLUMN member_id  INT     NOT NULL                            COMMENT 'FK → members.id',
  MODIFY COLUMN is_captain TINYINT NOT NULL DEFAULT 0                  COMMENT '1=팀장(입찰하는 쪽). 0=경매 대상 선수',
  MODIFY COLUMN points     INT     NOT NULL DEFAULT 0                  COMMENT '팀장이 보유한 입찰 가능 포인트',
  MODIFY COLUMN team_id    INT                                         COMMENT '낙찰 후 배정된 팀. 팀장 행의 auction_players.id를 가리킴',
  MODIFY COLUMN sort_order INT     NOT NULL DEFAULT 0                  COMMENT '경매 진행 순서',
  MODIFY COLUMN champ1     VARCHAR(50)                                 COMMENT '경매 화면 표시용 주챔피언 1순위 (auction_roster에서 복사)',
  MODIFY COLUMN champ2     VARCHAR(50)                                 COMMENT '경매 화면 표시용 주챔피언 2순위',
  MODIFY COLUMN champ3     VARCHAR(50)                                 COMMENT '경매 화면 표시용 주챔피언 3순위';


-- ----------------------------------------------------------------
-- auction_bids (경매 입찰 기록)
-- ----------------------------------------------------------------
ALTER TABLE auction_bids
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '입찰 레코드 고유 ID (PK)',
  MODIFY COLUMN session_id INT      NOT NULL                           COMMENT 'FK → auction_sessions.id',
  MODIFY COLUMN player_id  INT      NOT NULL                           COMMENT 'FK → auction_players.id. 낙찰된(입찰 대상) 선수',
  MODIFY COLUMN captain_id INT      NOT NULL                           COMMENT 'FK → auction_players.id. 입찰한 팀장',
  MODIFY COLUMN points     INT      NOT NULL                           COMMENT '입찰 포인트 금액',
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '입찰 시각';


-- ----------------------------------------------------------------
-- solorank_sessions (솔랭내기 세션)
-- ----------------------------------------------------------------
ALTER TABLE solorank_sessions
  MODIFY COLUMN id          INT AUTO_INCREMENT                         COMMENT '세션 고유 ID (PK)',
  MODIFY COLUMN name        VARCHAR(100)                               COMMENT '세션 이름 (예: 10월 1주차 솔랭내기)',
  MODIFY COLUMN total_games INT         NOT NULL DEFAULT 5             COMMENT '전체 판수. 몇 판 선승인지 기준',
  MODIFY COLUMN status      VARCHAR(20) NOT NULL DEFAULT 'waiting'     COMMENT 'waiting=대기, active=진행 중, done=완료',
  MODIFY COLUMN created_by  INT         NOT NULL                       COMMENT 'FK → users.id. 만든 운영진',
  MODIFY COLUMN created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '세션 생성 시각';


-- ----------------------------------------------------------------
-- solorank_participants (솔랭내기 참가자)
-- ----------------------------------------------------------------
ALTER TABLE solorank_participants
  MODIFY COLUMN id         INT AUTO_INCREMENT                          COMMENT '참가자 레코드 고유 ID (PK)',
  MODIFY COLUMN session_id INT     NOT NULL                            COMMENT 'FK → solorank_sessions.id',
  MODIFY COLUMN member_id  INT     NOT NULL                            COMMENT 'FK → members.id',
  MODIFY COLUMN team       TINYINT NOT NULL                            COMMENT '소속 팀. 1 또는 2';


-- ----------------------------------------------------------------
-- solorank_games (솔랭내기 판별 결과)
-- ----------------------------------------------------------------
ALTER TABLE solorank_games
  MODIFY COLUMN id          INT AUTO_INCREMENT                         COMMENT '레코드 고유 ID (PK)',
  MODIFY COLUMN session_id  INT     NOT NULL                           COMMENT 'FK → solorank_sessions.id',
  MODIFY COLUMN game_no     INT     NOT NULL                           COMMENT '몇 번째 판인지 (1부터 시작). (session_id, game_no) UNIQUE',
  MODIFY COLUMN winner_team TINYINT NOT NULL                           COMMENT '이 판을 이긴 팀. 1 또는 2',
  MODIFY COLUMN created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '결과 기록 시각';
