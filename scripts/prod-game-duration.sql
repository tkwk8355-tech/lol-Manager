-- =============================================================
-- 실서버: 내전 경기 시간(game_duration) 컬럼 추가 + 기존 경기 경기 시간 입력
-- DPM / 분당 CS 계산용. 실서버 DB에서 위에서부터 순서대로 실행.
-- 값은 로컬 DB(127.0.0.1:3301)에서 backfill-duration.js로 받아온 Riot 경기 시간(초).
-- 로컬과 실서버의 id가 다를 수 있어서 riot_match_id 기준으로 넣는다.
-- =============================================================

-- 1) 컬럼 추가 (새 코드 배포 시에도 자동으로 추가되므로, 이미 있으면 그대로 넘어감 / MariaDB 문법)
ALTER TABLE scrim_matches ADD COLUMN IF NOT EXISTS game_duration INT NOT NULL DEFAULT 0;

-- 2) 기존 경기 경기 시간 (초)
UPDATE scrim_matches SET game_duration = 1931 WHERE riot_match_id = 'KR_8427831937' AND game_duration = 0;  -- 32분 11초
UPDATE scrim_matches SET game_duration = 1719 WHERE riot_match_id = 'KR_8427775574' AND game_duration = 0;  -- 28분 39초
UPDATE scrim_matches SET game_duration = 2123 WHERE riot_match_id = 'KR_8427687693' AND game_duration = 0;  -- 35분 23초
UPDATE scrim_matches SET game_duration = 1433 WHERE riot_match_id = 'KR_8427630160' AND game_duration = 0;  -- 23분 53초
UPDATE scrim_matches SET game_duration = 1414 WHERE riot_match_id = 'KR_8427550109' AND game_duration = 0;  -- 23분 34초
UPDATE scrim_matches SET game_duration = 1862 WHERE riot_match_id = 'KR_8424764466' AND game_duration = 0;  -- 31분 2초
UPDATE scrim_matches SET game_duration = 1911 WHERE riot_match_id = 'KR_8424696723' AND game_duration = 0;  -- 31분 51초
UPDATE scrim_matches SET game_duration = 1414 WHERE riot_match_id = 'KR_8424645017' AND game_duration = 0;  -- 23분 34초
UPDATE scrim_matches SET game_duration = 2113 WHERE riot_match_id = 'KR_8424534522' AND game_duration = 0;  -- 35분 13초
UPDATE scrim_matches SET game_duration = 2282 WHERE riot_match_id = 'KR_8424420786' AND game_duration = 0;  -- 38분 2초
UPDATE scrim_matches SET game_duration = 1512 WHERE riot_match_id = 'KR_8424363190' AND game_duration = 0;  -- 25분 12초
UPDATE scrim_matches SET game_duration = 1792 WHERE riot_match_id = 'KR_8424273617' AND game_duration = 0;  -- 29분 52초
UPDATE scrim_matches SET game_duration = 2057 WHERE riot_match_id = 'KR_8423193622' AND game_duration = 0;  -- 34분 17초
UPDATE scrim_matches SET game_duration = 2404 WHERE riot_match_id = 'KR_8423106311' AND game_duration = 0;  -- 40분 4초
UPDATE scrim_matches SET game_duration = 2228 WHERE riot_match_id = 'KR_8422994613' AND game_duration = 0;  -- 37분 8초

-- 3) 확인
SELECT id, riot_match_id, played_at, game_duration,
       CONCAT(FLOOR(game_duration/60), '분 ', game_duration%60, '초') AS 경기시간
FROM scrim_matches
WHERE game_duration > 0
ORDER BY played_at DESC;
