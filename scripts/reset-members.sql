-- 클랜원 데이터 초기화 (로그인 계정 유지)
-- 실행 전 반드시 백업할 것!

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE member_friends;
TRUNCATE TABLE warnings;
TRUNCATE TABLE point_logs;
TRUNCATE TABLE played_with;
TRUNCATE TABLE party_participant_history;
TRUNCATE TABLE party_participants;
TRUNCATE TABLE parties;
TRUNCATE TABLE scrim_recruit_participants;
TRUNCATE TABLE scrim_recruits;
TRUNCATE TABLE scrim_participants;
TRUNCATE TABLE scrim_matches;
TRUNCATE TABLE accounts;

-- users.member_id 연동 해제 (로그인 계정 유지)
UPDATE users SET member_id = NULL;

TRUNCATE TABLE members;

SET FOREIGN_KEY_CHECKS = 1;
